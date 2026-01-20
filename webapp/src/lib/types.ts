export interface ClickUpTokens {
  access_token: string
  token_type: string
}

export interface ClickUpUser {
  id: number
  username: string
  email: string
  color: string
  profilePicture: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface UserProfile {
  id: string
  email: string
  clickup_access_token: string | null
  clickup_user_id: string | null
  clickup_username: string | null
  google_access_token: string | null
  google_refresh_token: string | null
  google_email: string | null
  created_at: string
  updated_at: string
}

// ============================================
// Automation Types
// ============================================

export type TriggerType =
  | 'gmail_email'
  | 'gmail_label'
  | 'schedule'
  | 'clickup_task_created'
  | 'clickup_task_updated'
  | 'clickup_task_deleted'
  | 'clickup_task_status_updated'
  | 'clickup_task_assignee_updated'
  | 'clickup_task_comment_posted'

export type ActionType = 'clickup_create_task' | 'clickup_add_comment' | 'send_email'
export type AutomationStatus = 'active' | 'paused' | 'error'

// ClickUp webhook event types
export type ClickUpWebhookEvent =
  | 'taskCreated'
  | 'taskUpdated'
  | 'taskDeleted'
  | 'taskStatusUpdated'
  | 'taskAssigneeUpdated'
  | 'taskCommentPosted'
  | 'taskDueDateUpdated'
  | 'taskTagUpdated'
  | 'taskMoved'
  | 'taskTimeTrackedUpdated'

// Trigger configurations
export interface GmailEmailTriggerConfig {
  from_filter?: string
  to_filter?: string
  subject_contains?: string
  has_attachment?: boolean
  is_reply?: boolean // Filter for replies only (true) or new emails only (false)
  label_ids?: string[]
}

export interface GmailLabelTriggerConfig {
  label_id: string
  label_name: string
}

export interface ScheduleTriggerConfig {
  cron_expression: string
  timezone: string
}

// ClickUp trigger configurations
export interface ClickUpTaskTriggerConfig {
  team_id: string // Workspace ID (required for webhook registration)
  space_id?: string // Optional: filter to specific space
  folder_id?: string // Optional: filter to specific folder
  list_id?: string // Optional: filter to specific list
  list_name?: string // Human-readable name for display
  events: ClickUpWebhookEvent[] // Which events to listen for
}

export type TriggerConfig =
  | GmailEmailTriggerConfig
  | GmailLabelTriggerConfig
  | ScheduleTriggerConfig
  | ClickUpTaskTriggerConfig

// Action configurations
export interface ClickUpCreateTaskActionConfig {
  list_id: string
  list_name?: string
  title_template: string // e.g., "{{email.subject}}"
  description_template?: string // e.g., "From: {{email.from}}\n\n{{email.body}}"
  priority?: 1 | 2 | 3 | 4 // 1=urgent, 2=high, 3=normal, 4=low
  assignees?: string[]
  tags?: string[]
}

export interface ClickUpAddCommentActionConfig {
  task_id: string
  comment_template: string
}

export interface SendEmailActionConfig {
  to_template: string
  subject_template: string
  body_template: string
}

export type ActionConfig =
  | ClickUpCreateTaskActionConfig
  | ClickUpAddCommentActionConfig
  | SendEmailActionConfig

// Main Automation interface
export interface Automation {
  id: string
  user_id: string
  name: string
  description: string | null
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  action_type: ActionType
  action_config: ActionConfig
  webhook_id: string | null
  webhook_secret: string | null
  gmail_history_id: string | null
  gmail_watch_expiration: string | null
  clickup_webhook_id: string | null // ClickUp's webhook ID for managing/deleting
  status: AutomationStatus
  last_run_at: string | null
  last_error: string | null
  run_count: number
  created_at: string
  updated_at: string
}

// For creating new automations
export interface CreateAutomationInput {
  name: string
  description?: string
  trigger_type: TriggerType
  trigger_config: TriggerConfig
  action_type: ActionType
  action_config: ActionConfig
}

// Automation execution log
export interface AutomationLog {
  id: string
  automation_id: string
  status: 'success' | 'error' | 'skipped'
  trigger_data: Record<string, unknown> | null
  action_result: Record<string, unknown> | null
  error_message: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

// Parsed automation from natural language
export interface ParsedAutomation {
  name: string
  description: string
  trigger: {
    type: TriggerType
    config: TriggerConfig
    summary: string // Human-readable summary
  }
  action: {
    type: ActionType
    config: ActionConfig
    summary: string // Human-readable summary
  }
}
