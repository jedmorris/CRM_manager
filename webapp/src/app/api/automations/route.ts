import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createAutomation,
  getAutomations,
  deleteAutomation,
  updateAutomationStatus,
  getWebhookUrl,
  generateAutomationSummary,
  getAutomationById,
} from '@/lib/automations'
import { setupGmailWatch, stopGmailWatch } from '@/lib/gmail-watch'
import { removeClickUpWebhookForAutomation } from '@/lib/clickup-webhooks'
import { CreateAutomationInput, AutomationStatus } from '@/lib/types'

// GET /api/automations - List all automations for the current user
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const automations = await getAutomations(supabase, user.id)

    // Add webhook URLs and summaries to each automation
    const enrichedAutomations = automations.map((automation) => ({
      ...automation,
      webhook_url: automation.webhook_id ? getWebhookUrl(automation.webhook_id) : null,
      summary: generateAutomationSummary(automation),
    }))

    return NextResponse.json({ automations: enrichedAutomations })
  } catch (error) {
    console.error('Error fetching automations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch automations' },
      { status: 500 }
    )
  }
}

// POST /api/automations - Create a new automation
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as CreateAutomationInput

    // Validate required fields
    if (!body.name || !body.trigger_type || !body.action_type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, trigger_type, action_type' },
        { status: 400 }
      )
    }

    // Create the automation
    const automation = await createAutomation(supabase, user.id, body)

    // If this is a Gmail trigger, set up the Gmail watch
    if (automation.trigger_type.startsWith('gmail_')) {
      // Get user's Google tokens
      const { data: profile } = await supabase
        .from('profiles')
        .select('google_access_token, google_refresh_token')
        .eq('id', user.id)
        .single()

      if (profile?.google_access_token) {
        try {
          await setupGmailWatch(
            supabase,
            automation.id,
            profile.google_access_token,
            profile.google_refresh_token
          )
        } catch (watchError) {
          console.error('Failed to setup Gmail watch:', watchError)
          // Update automation status to indicate setup issue
          await updateAutomationStatus(supabase, automation.id, 'error')
          return NextResponse.json({
            automation,
            warning: 'Automation created but Gmail watch setup failed. Please reconnect Gmail.',
          })
        }
      } else {
        return NextResponse.json(
          { error: 'Gmail not connected. Please connect Gmail first.' },
          { status: 400 }
        )
      }
    }

    return NextResponse.json({
      automation: {
        ...automation,
        webhook_url: automation.webhook_id ? getWebhookUrl(automation.webhook_id) : null,
        summary: generateAutomationSummary(automation),
      },
    })
  } catch (error) {
    console.error('Error creating automation:', error)
    return NextResponse.json(
      { error: 'Failed to create automation' },
      { status: 500 }
    )
  }
}

// DELETE /api/automations - Delete an automation
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const automationId = searchParams.get('id')

    if (!automationId) {
      return NextResponse.json(
        { error: 'Missing automation ID' },
        { status: 400 }
      )
    }

    // Get the automation to check its type and clean up external resources
    const automation = await getAutomationById(supabase, automationId)

    if (automation) {
      // Get user's tokens for cleanup
      const { data: profile } = await supabase
        .from('profiles')
        .select('clickup_access_token, google_access_token')
        .eq('id', user.id)
        .single()

      // Clean up ClickUp webhook if this is a ClickUp-triggered automation
      if (automation.trigger_type.startsWith('clickup_') && automation.clickup_webhook_id) {
        if (profile?.clickup_access_token) {
          try {
            await removeClickUpWebhookForAutomation(
              supabase,
              automationId,
              profile.clickup_access_token
            )
            console.log(`Cleaned up ClickUp webhook for automation ${automationId}`)
          } catch (webhookError) {
            // Log but don't fail - the webhook might already be gone
            console.error('Failed to clean up ClickUp webhook:', webhookError)
          }
        }
      }

      // Stop Gmail watch if this is a Gmail-triggered automation
      if (automation.trigger_type.startsWith('gmail_')) {
        if (profile?.google_access_token) {
          try {
            await stopGmailWatch(profile.google_access_token)
            console.log(`Stopped Gmail watch for automation ${automationId}`)
          } catch (watchError) {
            // Log but don't fail - the watch might already be stopped
            console.error('Failed to stop Gmail watch:', watchError)
          }
        }
      }
    }

    await deleteAutomation(supabase, automationId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting automation:', error)
    return NextResponse.json(
      { error: 'Failed to delete automation' },
      { status: 500 }
    )
  }
}

// PATCH /api/automations - Update automation status (pause/resume)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as { id: string; status: AutomationStatus }

    if (!body.id || !body.status) {
      return NextResponse.json(
        { error: 'Missing required fields: id, status' },
        { status: 400 }
      )
    }

    if (!['active', 'paused', 'error'].includes(body.status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: active, paused, or error' },
        { status: 400 }
      )
    }

    const automation = await updateAutomationStatus(supabase, body.id, body.status)

    return NextResponse.json({
      automation: {
        ...automation,
        webhook_url: automation.webhook_id ? getWebhookUrl(automation.webhook_id) : null,
        summary: generateAutomationSummary(automation),
      },
    })
  } catch (error) {
    console.error('Error updating automation:', error)
    return NextResponse.json(
      { error: 'Failed to update automation' },
      { status: 500 }
    )
  }
}
