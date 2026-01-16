import { SupabaseClient } from '@supabase/supabase-js'
import { ClickUpWebhookEvent, ClickUpTaskTriggerConfig } from './types'

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2'

interface ClickUpWebhookResponse {
  id: string
  webhook: {
    id: string
    userid: number
    team_id: number
    endpoint: string
    client_id: string
    events: string[]
    task_id: string | null
    list_id: string | null
    folder_id: string | null
    space_id: string | null
    health: {
      status: string
      fail_count: number
    }
    secret: string
  }
}

interface ClickUpWebhookPayload {
  webhook_id: string
  event: ClickUpWebhookEvent
  history_items: Array<{
    id: string
    type: number
    date: string
    field: string
    parent_id: string
    data: Record<string, unknown>
    source: string | null
    user: {
      id: number
      username: string
      email: string
      color: string
      initials: string
      profilePicture: string | null
    }
    before: unknown
    after: unknown
  }>
  task_id: string
  task?: {
    id: string
    name: string
    status: {
      status: string
      color: string
      type: string
    }
    date_created: string
    date_updated: string
    creator: {
      id: number
      username: string
      email: string
    }
    assignees: Array<{
      id: number
      username: string
      email: string
    }>
    priority: {
      id: string
      priority: string
      color: string
    } | null
    due_date: string | null
    description: string
    url: string
    list: {
      id: string
      name: string
    }
    folder: {
      id: string
      name: string
    }
    space: {
      id: string
      name: string
    }
  }
}

/**
 * Maps our trigger types to ClickUp webhook event names
 */
export function triggerTypeToClickUpEvents(triggerType: string): ClickUpWebhookEvent[] {
  const mapping: Record<string, ClickUpWebhookEvent[]> = {
    'clickup_task_created': ['taskCreated'],
    'clickup_task_updated': ['taskUpdated'],
    'clickup_task_deleted': ['taskDeleted'],
    'clickup_task_status_updated': ['taskStatusUpdated'],
    'clickup_task_assignee_updated': ['taskAssigneeUpdated'],
    'clickup_task_comment_posted': ['taskCommentPosted'],
  }
  return mapping[triggerType] || ['taskUpdated']
}

/**
 * Creates a ClickUp webhook for the specified workspace/list.
 */
export async function createClickUpWebhook(
  accessToken: string,
  teamId: string,
  endpointUrl: string,
  events: ClickUpWebhookEvent[],
  options?: {
    spaceId?: string
    folderId?: string
    listId?: string
  }
): Promise<ClickUpWebhookResponse> {
  const body: Record<string, unknown> = {
    endpoint: endpointUrl,
    events: events,
  }

  // Add optional filters
  if (options?.listId) {
    body.list_id = options.listId
  } else if (options?.folderId) {
    body.folder_id = options.folderId
  } else if (options?.spaceId) {
    body.space_id = options.spaceId
  }

  const response = await fetch(`${CLICKUP_API_URL}/team/${teamId}/webhook`, {
    method: 'POST',
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create ClickUp webhook: ${error}`)
  }

  return response.json()
}

/**
 * Deletes a ClickUp webhook.
 */
export async function deleteClickUpWebhook(
  accessToken: string,
  webhookId: string
): Promise<void> {
  const response = await fetch(`${CLICKUP_API_URL}/webhook/${webhookId}`, {
    method: 'DELETE',
    headers: {
      Authorization: accessToken,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to delete ClickUp webhook: ${error}`)
  }
}

/**
 * Lists all webhooks for a workspace.
 */
export async function listClickUpWebhooks(
  accessToken: string,
  teamId: string
): Promise<{ webhooks: ClickUpWebhookResponse['webhook'][] }> {
  const response = await fetch(`${CLICKUP_API_URL}/team/${teamId}/webhook`, {
    headers: {
      Authorization: accessToken,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list ClickUp webhooks: ${error}`)
  }

  return response.json()
}

/**
 * Updates a ClickUp webhook.
 */
export async function updateClickUpWebhook(
  accessToken: string,
  webhookId: string,
  updates: {
    endpoint?: string
    events?: ClickUpWebhookEvent[]
    status?: 'active' | 'inactive'
  }
): Promise<ClickUpWebhookResponse> {
  const response = await fetch(`${CLICKUP_API_URL}/webhook/${webhookId}`, {
    method: 'PUT',
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to update ClickUp webhook: ${error}`)
  }

  return response.json()
}

/**
 * Sets up a ClickUp webhook for an automation.
 */
export async function setupClickUpWebhookForAutomation(
  supabase: SupabaseClient,
  automationId: string,
  webhookId: string, // Our internal webhook ID for the callback URL
  accessToken: string,
  triggerConfig: ClickUpTaskTriggerConfig
): Promise<string> {
  // Build the webhook endpoint URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const endpointUrl = `${baseUrl}/api/webhooks/clickup?webhook_id=${webhookId}`

  // Create the webhook in ClickUp
  const result = await createClickUpWebhook(
    accessToken,
    triggerConfig.team_id,
    endpointUrl,
    triggerConfig.events,
    {
      spaceId: triggerConfig.space_id,
      folderId: triggerConfig.folder_id,
      listId: triggerConfig.list_id,
    }
  )

  // Store the ClickUp webhook ID in our database
  await supabase
    .from('automations')
    .update({ clickup_webhook_id: result.webhook.id })
    .eq('id', automationId)

  return result.webhook.id
}

/**
 * Removes a ClickUp webhook when an automation is deleted or paused.
 */
export async function removeClickUpWebhookForAutomation(
  supabase: SupabaseClient,
  automationId: string,
  accessToken: string
): Promise<void> {
  // Get the automation to find the ClickUp webhook ID
  const { data: automation } = await supabase
    .from('automations')
    .select('clickup_webhook_id')
    .eq('id', automationId)
    .single()

  if (automation?.clickup_webhook_id) {
    try {
      await deleteClickUpWebhook(accessToken, automation.clickup_webhook_id)
    } catch (error) {
      console.error('Failed to delete ClickUp webhook:', error)
      // Continue anyway - the webhook might already be deleted
    }

    // Clear the webhook ID from our database
    await supabase
      .from('automations')
      .update({ clickup_webhook_id: null })
      .eq('id', automationId)
  }
}

/**
 * Extracts relevant data from a ClickUp webhook payload for use in templates.
 */
export function extractClickUpTaskData(payload: ClickUpWebhookPayload): {
  task: {
    id: string
    name: string
    status: string
    description: string
    url: string
    creator: string
    assignees: string
    priority: string
    due_date: string
    list_name: string
    folder_name: string
    space_name: string
  }
  event: string
  changes: Array<{
    field: string
    before: string
    after: string
    user: string
  }>
} {
  const task = payload.task || {
    id: payload.task_id,
    name: 'Unknown Task',
    status: { status: 'unknown' },
    description: '',
    url: `https://app.clickup.com/t/${payload.task_id}`,
    creator: { username: 'unknown' },
    assignees: [],
    priority: null,
    due_date: null,
    list: { name: 'Unknown' },
    folder: { name: 'Unknown' },
    space: { name: 'Unknown' },
  }

  // Extract changes from history items
  const changes = (payload.history_items || []).map((item) => ({
    field: item.field,
    before: String(item.before ?? ''),
    after: String(item.after ?? ''),
    user: item.user?.username || 'unknown',
  }))

  return {
    task: {
      id: task.id,
      name: task.name,
      status: task.status?.status || 'unknown',
      description: task.description || '',
      url: task.url || `https://app.clickup.com/t/${task.id}`,
      creator: task.creator?.username || 'unknown',
      assignees: task.assignees?.map((a) => a.username).join(', ') || '',
      priority: task.priority?.priority || 'none',
      due_date: task.due_date || '',
      list_name: task.list?.name || '',
      folder_name: task.folder?.name || '',
      space_name: task.space?.name || '',
    },
    event: payload.event,
    changes,
  }
}

/**
 * Formats changes into a human-readable summary for email notifications.
 */
export function formatChangeSummary(
  changes: Array<{ field: string; before: string; after: string; user: string }>
): string {
  if (changes.length === 0) return 'No specific changes recorded.'

  return changes
    .map((change) => {
      const fieldName = change.field.replace(/_/g, ' ')
      if (change.before && change.after) {
        return `• **${fieldName}** changed from "${change.before}" to "${change.after}" by ${change.user}`
      } else if (change.after) {
        return `• **${fieldName}** set to "${change.after}" by ${change.user}`
      } else if (change.before) {
        return `• **${fieldName}** "${change.before}" was removed by ${change.user}`
      }
      return `• **${fieldName}** was modified by ${change.user}`
    })
    .join('\n')
}

export type { ClickUpWebhookPayload }
