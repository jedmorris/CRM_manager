import { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import {
  Automation,
  CreateAutomationInput,
  AutomationLog,
  ParsedAutomation,
  TriggerType,
  ActionType,
  GmailEmailTriggerConfig,
  ClickUpCreateTaskActionConfig,
  AutomationStatus,
} from './types'

// ============================================
// Automation CRUD Operations
// ============================================

export async function createAutomation(
  supabase: SupabaseClient,
  userId: string,
  input: CreateAutomationInput
): Promise<Automation> {
  const webhookId = randomBytes(16).toString('hex')
  const webhookSecret = randomBytes(32).toString('hex')

  const { data, error } = await supabase
    .from('automations')
    .insert({
      user_id: userId,
      name: input.name,
      description: input.description || null,
      trigger_type: input.trigger_type,
      trigger_config: input.trigger_config,
      action_type: input.action_type,
      action_config: input.action_config,
      webhook_id: webhookId,
      webhook_secret: webhookSecret,
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create automation: ${error.message}`)
  }

  return data as Automation
}

export async function getAutomations(
  supabase: SupabaseClient,
  userId: string
): Promise<Automation[]> {
  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch automations: ${error.message}`)
  }

  return data as Automation[]
}

export async function getAutomationById(
  supabase: SupabaseClient,
  automationId: string
): Promise<Automation | null> {
  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('id', automationId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw new Error(`Failed to fetch automation: ${error.message}`)
  }

  return data as Automation
}

export async function getAutomationByWebhookId(
  supabase: SupabaseClient,
  webhookId: string
): Promise<Automation | null> {
  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('webhook_id', webhookId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw new Error(`Failed to fetch automation: ${error.message}`)
  }

  return data as Automation
}

export async function updateAutomationStatus(
  supabase: SupabaseClient,
  automationId: string,
  status: AutomationStatus
): Promise<Automation> {
  const { data, error } = await supabase
    .from('automations')
    .update({ status })
    .eq('id', automationId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update automation: ${error.message}`)
  }

  return data as Automation
}

export async function deleteAutomation(
  supabase: SupabaseClient,
  automationId: string
): Promise<void> {
  const { error } = await supabase
    .from('automations')
    .delete()
    .eq('id', automationId)

  if (error) {
    throw new Error(`Failed to delete automation: ${error.message}`)
  }
}

export async function updateAutomationLastRun(
  supabase: SupabaseClient,
  automationId: string,
  error?: string
): Promise<void> {
  const updates: Record<string, unknown> = {
    last_run_at: new Date().toISOString(),
    run_count: supabase.rpc('increment_run_count', { automation_id: automationId }),
  }

  if (error) {
    updates.last_error = error
    updates.status = 'error'
  } else {
    updates.last_error = null
  }

  await supabase
    .from('automations')
    .update(updates)
    .eq('id', automationId)
}

export async function updateGmailWatchInfo(
  supabase: SupabaseClient,
  automationId: string,
  historyId: string,
  expiration: Date
): Promise<void> {
  await supabase
    .from('automations')
    .update({
      gmail_history_id: historyId,
      gmail_watch_expiration: expiration.toISOString(),
    })
    .eq('id', automationId)
}

// ============================================
// Automation Logs
// ============================================

export async function createAutomationLog(
  supabase: SupabaseClient,
  automationId: string,
  status: 'success' | 'error' | 'skipped',
  triggerData?: Record<string, unknown>,
  actionResult?: Record<string, unknown>,
  errorMessage?: string
): Promise<AutomationLog> {
  const startedAt = new Date()

  const { data, error } = await supabase
    .from('automation_logs')
    .insert({
      automation_id: automationId,
      status,
      trigger_data: triggerData || null,
      action_result: actionResult || null,
      error_message: errorMessage || null,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create automation log: ${error.message}`)
  }

  return data as AutomationLog
}

export async function getAutomationLogs(
  supabase: SupabaseClient,
  automationId: string,
  limit = 20
): Promise<AutomationLog[]> {
  const { data, error } = await supabase
    .from('automation_logs')
    .select('*')
    .eq('automation_id', automationId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch automation logs: ${error.message}`)
  }

  return data as AutomationLog[]
}

// ============================================
// Natural Language Parsing Helpers
// ============================================

/**
 * Parses natural language input to extract automation configuration.
 * This is used by the Claude tool to understand what the user wants.
 */
export function buildAutomationFromParsed(parsed: ParsedAutomation): CreateAutomationInput {
  return {
    name: parsed.name,
    description: parsed.description,
    trigger_type: parsed.trigger.type,
    trigger_config: parsed.trigger.config,
    action_type: parsed.action.type,
    action_config: parsed.action.config,
  }
}

/**
 * Generates a human-readable summary of an automation.
 */
export function generateAutomationSummary(automation: Automation): string {
  const trigger = describeTrigger(automation.trigger_type, automation.trigger_config)
  const action = describeAction(automation.action_type, automation.action_config)
  return `When ${trigger}, ${action}`
}

function describeTrigger(type: TriggerType, config: unknown): string {
  switch (type) {
    case 'gmail_email': {
      const c = config as GmailEmailTriggerConfig
      const parts: string[] = []
      if (c.from_filter) parts.push(`from "${c.from_filter}"`)
      if (c.subject_contains) parts.push(`with subject containing "${c.subject_contains}"`)
      if (c.has_attachment) parts.push('with attachments')
      return parts.length > 0
        ? `you receive an email ${parts.join(' ')}`
        : 'you receive any email'
    }
    case 'gmail_label':
      return `an email is labeled "${(config as { label_name: string }).label_name}"`
    case 'schedule':
      return `scheduled (${(config as { cron_expression: string }).cron_expression})`
    default:
      return 'trigger occurs'
  }
}

function describeAction(type: ActionType, config: unknown): string {
  switch (type) {
    case 'clickup_create_task': {
      const c = config as ClickUpCreateTaskActionConfig
      return `create a task "${c.title_template}" in ${c.list_name || 'ClickUp'}`
    }
    case 'clickup_add_comment':
      return 'add a comment to the task'
    case 'send_email':
      return 'send an email'
    default:
      return 'perform action'
  }
}

// ============================================
// Template Processing
// ============================================

/**
 * Processes a template string, replacing {{variables}} with actual values.
 * Used when executing automations.
 */
export function processTemplate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const keys = path.trim().split('.')
    let value: unknown = data
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = (value as Record<string, unknown>)[key]
      } else {
        return `{{${path}}}` // Keep original if not found
      }
    }
    return String(value ?? '')
  })
}

// ============================================
// Webhook URL Generation
// ============================================

export function getWebhookUrl(webhookId: string): string {
  // This will be the Modal webhook endpoint
  const baseUrl = process.env.MODAL_WEBHOOK_BASE_URL || 'https://nick-90891--automation-webhook.modal.run'
  return `${baseUrl}?webhook_id=${webhookId}`
}

export function getGmailPubSubWebhookUrl(): string {
  // This is the endpoint that Google Pub/Sub will push to
  return process.env.GMAIL_PUBSUB_WEBHOOK_URL || 'https://nick-90891--automation-gmail-push.modal.run'
}
