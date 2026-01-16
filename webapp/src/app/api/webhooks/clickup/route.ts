import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getAutomationByWebhookId, createAutomationLog } from '@/lib/automations'
import { processTemplate } from '@/lib/automations'
import { sendEmail } from '@/lib/google'
import {
  extractClickUpTaskData,
  formatChangeSummary,
  ClickUpWebhookPayload,
} from '@/lib/clickup-webhooks'
import {
  ClickUpTaskTriggerConfig,
  SendEmailActionConfig,
} from '@/lib/types'

// Lazy-initialize admin Supabase client
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
 * POST /api/webhooks/clickup
 *
 * Receives webhook calls from ClickUp when task events occur.
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const webhookId = searchParams.get('webhook_id')

    if (!webhookId) {
      return NextResponse.json({ error: 'Missing webhook_id' }, { status: 400 })
    }

    // Get the automation for this webhook
    const automation = await getAutomationByWebhookId(getSupabaseAdmin(), webhookId)

    if (!automation) {
      console.log('No automation found for webhook:', webhookId)
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 })
    }

    if (automation.status !== 'active') {
      console.log('Automation is not active:', automation.id)
      return NextResponse.json({ status: 'automation_inactive' })
    }

    // Parse the ClickUp webhook payload
    const payload: ClickUpWebhookPayload = await request.json()

    console.log('ClickUp webhook received:', {
      automation_id: automation.id,
      event: payload.event,
      task_id: payload.task_id,
    })

    // Check if this event matches our trigger config
    const triggerConfig = automation.trigger_config as ClickUpTaskTriggerConfig

    // Filter by list/folder/space if specified
    if (triggerConfig.list_id && payload.task?.list?.id !== triggerConfig.list_id) {
      console.log('Task not in target list, skipping')
      return NextResponse.json({ status: 'filtered_out' })
    }

    if (triggerConfig.folder_id && payload.task?.folder?.id !== triggerConfig.folder_id) {
      console.log('Task not in target folder, skipping')
      return NextResponse.json({ status: 'filtered_out' })
    }

    if (triggerConfig.space_id && payload.task?.space?.id !== triggerConfig.space_id) {
      console.log('Task not in target space, skipping')
      return NextResponse.json({ status: 'filtered_out' })
    }

    // Check if the event type matches
    if (!triggerConfig.events.includes(payload.event)) {
      console.log('Event type not in trigger events, skipping:', payload.event)
      return NextResponse.json({ status: 'event_filtered' })
    }

    // Extract task data for templates
    const taskData = extractClickUpTaskData(payload)
    const changeSummary = formatChangeSummary(taskData.changes)

    // Build trigger data for templates
    const triggerData = {
      task: taskData.task,
      event: taskData.event,
      changes: taskData.changes,
      change_summary: changeSummary,
    }

    // Execute the automation action
    const result = await executeClickUpAutomation(automation, triggerData)

    return NextResponse.json(result)
  } catch (error) {
    console.error('ClickUp webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

/**
 * Executes the automation action for a ClickUp trigger.
 */
async function executeClickUpAutomation(
  automation: Awaited<ReturnType<typeof getAutomationByWebhookId>>,
  triggerData: {
    task: ReturnType<typeof extractClickUpTaskData>['task']
    event: string
    changes: ReturnType<typeof extractClickUpTaskData>['changes']
    change_summary: string
  }
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  if (!automation) {
    return { success: false, error: 'Automation not found' }
  }

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
        throw new Error(`Unsupported action type for ClickUp trigger: ${automation.action_type}`)
    }

    // Log successful execution
    await createAutomationLog(
      getSupabaseAdmin(),
      automation.id,
      'success',
      triggerData as Record<string, unknown>,
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
      triggerData as Record<string, unknown>,
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
