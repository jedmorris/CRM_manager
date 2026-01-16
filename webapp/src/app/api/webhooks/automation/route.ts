import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getAutomationByWebhookId, createAutomationLog } from '@/lib/automations'
import {
  getNewMessagesSinceHistoryId,
  extractEmailData,
  emailMatchesTrigger,
} from '@/lib/gmail-watch'
import { processTemplate } from '@/lib/automations'
import { createTask } from '@/lib/clickup'
import { sendEmail } from '@/lib/google'
import {
  GmailEmailTriggerConfig,
  ClickUpCreateTaskActionConfig,
  SendEmailActionConfig,
} from '@/lib/types'

// Lazy-initialize admin Supabase client for webhook processing
// This bypasses RLS since webhooks don't have user sessions
let _supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

/**
 * POST /api/webhooks/automation
 *
 * This endpoint receives:
 * 1. Direct webhook calls with ?webhook_id=xxx
 * 2. Gmail Pub/Sub push notifications
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get('webhook_id')

    // Handle direct webhook call
    if (webhookId) {
      return handleDirectWebhook(webhookId, request)
    }

    // Handle Gmail Pub/Sub notification
    const body = await request.json()
    if (body.message?.data) {
      return handleGmailPushNotification(body)
    }

    return NextResponse.json({ error: 'Invalid webhook request' }, { status: 400 })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

/**
 * Handles direct webhook calls (e.g., from external services).
 */
async function handleDirectWebhook(webhookId: string, request: NextRequest) {
  const automation = await getAutomationByWebhookId(getSupabaseAdmin(), webhookId)

  if (!automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 })
  }

  if (automation.status !== 'active') {
    return NextResponse.json({ error: 'Automation is not active' }, { status: 400 })
  }

  // Get trigger data from request body
  const triggerData = await request.json().catch(() => ({}))

  // Execute the automation
  const result = await executeAutomation(automation, triggerData)

  return NextResponse.json(result)
}

/**
 * Handles Gmail Pub/Sub push notifications.
 * Google sends a base64-encoded message with the user's email and historyId.
 */
async function handleGmailPushNotification(body: { message: { data: string } }) {
  // Decode the Pub/Sub message
  const messageData = JSON.parse(
    Buffer.from(body.message.data, 'base64').toString('utf-8')
  ) as {
    emailAddress: string
    historyId: string
  }

  console.log('Gmail push notification for:', messageData.emailAddress)

  // Find all active Gmail automations for this user
  const { data: profiles } = await getSupabaseAdmin()
    .from('profiles')
    .select('id, google_access_token, google_refresh_token')
    .eq('google_email', messageData.emailAddress)

  if (!profiles || profiles.length === 0) {
    console.log('No profile found for email:', messageData.emailAddress)
    return NextResponse.json({ status: 'no_user' })
  }

  const profile = profiles[0]

  // Get all active Gmail automations for this user
  const { data: automations } = await getSupabaseAdmin()
    .from('automations')
    .select('*')
    .eq('user_id', profile.id)
    .like('trigger_type', 'gmail_%')
    .eq('status', 'active')

  if (!automations || automations.length === 0) {
    console.log('No active Gmail automations for user')
    return NextResponse.json({ status: 'no_automations' })
  }

  // Process each automation
  const results = []
  for (const automation of automations) {
    try {
      // Get new messages since last history ID
      const lastHistoryId = automation.gmail_history_id || messageData.historyId
      const { messages, newHistoryId } = await getNewMessagesSinceHistoryId(
        profile.google_access_token,
        lastHistoryId
      )

      // Update the history ID
      await getSupabaseAdmin()
        .from('automations')
        .update({ gmail_history_id: newHistoryId })
        .eq('id', automation.id)

      // Process each new message
      for (const message of messages) {
        const emailData = extractEmailData(message)

        // Check if email matches trigger config
        const triggerConfig = automation.trigger_config as GmailEmailTriggerConfig
        if (!emailMatchesTrigger(emailData, triggerConfig)) {
          continue
        }

        // Execute the automation action
        const result = await executeAutomation(automation, { email: emailData })
        results.push(result)
      }
    } catch (error) {
      console.error('Error processing automation:', automation.id, error)
      results.push({ automation_id: automation.id, error: String(error) })
    }
  }

  return NextResponse.json({ status: 'processed', results })
}

/**
 * Executes an automation's action with the given trigger data.
 */
async function executeAutomation(
  automation: Awaited<ReturnType<typeof getAutomationByWebhookId>>,
  triggerData: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  if (!automation) {
    return { success: false, error: 'Automation not found' }
  }

  const startTime = Date.now()

  try {
    let actionResult: unknown

    // Get user profile for tokens
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('*')
      .eq('id', automation.user_id)
      .single()

    if (!profile) {
      throw new Error('User profile not found')
    }

    // Execute based on action type
    switch (automation.action_type) {
      case 'clickup_create_task': {
        const config = automation.action_config as ClickUpCreateTaskActionConfig

        if (!profile.clickup_access_token) {
          throw new Error('ClickUp not connected')
        }

        const title = processTemplate(config.title_template, triggerData)
        const description = config.description_template
          ? processTemplate(config.description_template, triggerData)
          : undefined

        actionResult = await createTask(profile.clickup_access_token, config.list_id, {
          name: title,
          description,
          priority: config.priority,
          assignees: config.assignees?.map(Number),
        })
        break
      }

      case 'send_email': {
        const config = automation.action_config as SendEmailActionConfig

        if (!profile.google_access_token) {
          throw new Error('Gmail not connected')
        }

        const to = processTemplate(config.to_template, triggerData)
        const subject = processTemplate(config.subject_template, triggerData)
        const body = processTemplate(config.body_template, triggerData)

        actionResult = await sendEmail(profile.google_access_token, to, subject, body)
        break
      }

      default:
        throw new Error(`Unknown action type: ${automation.action_type}`)
    }

    // Log successful execution
    await createAutomationLog(
      getSupabaseAdmin(),
      automation.id,
      'success',
      triggerData,
      actionResult as Record<string, unknown>
    )

    // Update automation stats
    await getSupabaseAdmin()
      .from('automations')
      .update({
        last_run_at: new Date().toISOString(),
        run_count: (automation.run_count || 0) + 1,
        last_error: null,
      })
      .eq('id', automation.id)

    return { success: true, result: actionResult }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Log failed execution
    await createAutomationLog(
      getSupabaseAdmin(),
      automation.id,
      'error',
      triggerData,
      undefined,
      errorMessage
    )

    // Update automation with error
    await getSupabaseAdmin()
      .from('automations')
      .update({
        last_run_at: new Date().toISOString(),
        last_error: errorMessage,
      })
      .eq('id', automation.id)

    return { success: false, error: errorMessage }
  }
}
