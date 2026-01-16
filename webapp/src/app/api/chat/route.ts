import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { clickUpOperations } from '@/lib/clickup'
import { sendEmail, refreshGoogleToken } from '@/lib/google'
import {
  createAutomation,
  getAutomations,
  deleteAutomation,
  updateAutomationStatus,
  getWebhookUrl,
  generateAutomationSummary,
} from '@/lib/automations'
import { setupGmailWatch } from '@/lib/gmail-watch'
import { setupClickUpWebhookForAutomation, removeClickUpWebhookForAutomation, triggerTypeToClickUpEvents } from '@/lib/clickup-webhooks'
import { CreateAutomationInput, ClickUpTaskTriggerConfig } from '@/lib/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Define tools that Claude can use
const tools: Anthropic.Tool[] = [
  {
    name: 'send_email',
    description: 'Send an email via Gmail and log it to a ClickUp task',
    input_schema: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address',
        },
        subject: {
          type: 'string',
          description: 'Email subject',
        },
        body: {
          type: 'string',
          description: 'Email body content',
        },
        task_id: {
          type: 'string',
          description: 'The ClickUp Task ID to log the email to',
        },
      },
      required: ['to', 'subject', 'body', 'task_id'],
    },
  },
  {
    name: 'get_workspaces',
    description: 'Get all ClickUp workspaces the user has access to',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_spaces',
    description: 'Get all spaces in a workspace',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_id: {
          type: 'string',
          description: 'The workspace/team ID',
        },
      },
      required: ['team_id'],
    },
  },
  {
    name: 'get_lists',
    description: 'Get all lists in a space',
    input_schema: {
      type: 'object' as const,
      properties: {
        space_id: {
          type: 'string',
          description: 'The space ID',
        },
      },
      required: ['space_id'],
    },
  },
  {
    name: 'get_tasks',
    description: 'Get all tasks in a list',
    input_schema: {
      type: 'object' as const,
      properties: {
        list_id: {
          type: 'string',
          description: 'The list ID',
        },
      },
      required: ['list_id'],
    },
  },
  {
    name: 'get_task',
    description: 'Get details of a specific task',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in a list',
    input_schema: {
      type: 'object' as const,
      properties: {
        list_id: {
          type: 'string',
          description: 'The list ID where the task will be created',
        },
        name: {
          type: 'string',
          description: 'The name of the task',
        },
        description: {
          type: 'string',
          description: 'The description of the task',
        },
        priority: {
          type: 'number',
          description: 'Priority level (1=urgent, 2=high, 3=normal, 4=low)',
        },
        due_date: {
          type: 'number',
          description: 'Due date as Unix timestamp in milliseconds',
        },
      },
      required: ['list_id', 'name'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID to update',
        },
        name: {
          type: 'string',
          description: 'New name for the task',
        },
        description: {
          type: 'string',
          description: 'New description for the task',
        },
        status: {
          type: 'string',
          description: 'New status for the task',
        },
        priority: {
          type: 'number',
          description: 'New priority level',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a task',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID',
        },
        comment: {
          type: 'string',
          description: 'The comment text',
        },
      },
      required: ['task_id', 'comment'],
    },
  },
  {
    name: 'search_tasks',
    description: 'Search for tasks by name or keyword',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_id: {
          type: 'string',
          description: 'The workspace/team ID to search in',
        },
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['team_id', 'query'],
    },
  },
  {
    name: 'create_space',
    description: 'Create a new Space in a workspace',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_id: {
          type: 'string',
          description: 'The workspace/team ID',
        },
        name: {
          type: 'string',
          description: 'The name of the new Space',
        },
        is_private: {
          type: 'boolean',
          description: 'Whether the space should be private (default: false)',
        },
      },
      required: ['team_id', 'name'],
    },
  },
  {
    name: 'create_folder',
    description: 'Create a new Folder in a Space',
    input_schema: {
      type: 'object' as const,
      properties: {
        space_id: {
          type: 'string',
          description: 'The Space ID',
        },
        name: {
          type: 'string',
          description: 'The name of the new Folder',
        },
      },
      required: ['space_id', 'name'],
    },
  },
  {
    name: 'create_list',
    description: 'Create a new List in a Space or Folder',
    input_schema: {
      type: 'object' as const,
      properties: {
        parent_id: {
          type: 'string',
          description: 'The Space ID or Folder ID',
        },
        name: {
          type: 'string',
          description: 'The name of the new List',
        },
        parent_type: {
          type: 'string',
          enum: ['space', 'folder'],
          description: 'Whether the parent is a space or folder (default: space)',
        },
      },
      required: ['parent_id', 'name'],
    },
  },
  {
    name: 'get_custom_fields',
    description: 'Get all custom fields available in a list',
    input_schema: {
      type: 'object' as const,
      properties: {
        list_id: {
          type: 'string',
          description: 'The list ID',
        },
      },
      required: ['list_id'],
    },
  },
  {
    name: 'set_custom_field',
    description: 'Set the value of a custom field on a task',
    input_schema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID',
        },
        field_id: {
          type: 'string',
          description: 'The custom field ID (get this from get_custom_fields)',
        },
        value: {
          type: 'object', // Explicitly allow any type here since custom fields values vary widely
          description: 'The value to set (string for text/dropdown/email/phone, number for numbers)',
        },
      },
      required: ['task_id', 'field_id', 'value'],
    },
  },
  // ========== AUTOMATION TOOLS ==========
  {
    name: 'create_automation',
    description: `Create a background automation that runs automatically when triggered.

SUPPORTED TRIGGERS:
1. Gmail triggers: "whenever I get an email from X..." -> trigger_type: 'gmail_email'
2. ClickUp triggers: "whenever a task is updated/created..." -> trigger_type: 'clickup_task_updated', 'clickup_task_created', etc.

IMPORTANT: Before creating an automation, you MUST:
1. First get the ClickUp workspace hierarchy (get_workspaces -> get_spaces -> get_lists) to find the correct IDs
2. Confirm with the user which workspace/list they want to use
3. Then create the automation with the correct IDs

For ClickUp triggers, you need the team_id (workspace ID) at minimum. Optionally filter by space_id, folder_id, or list_id.
For Gmail triggers, you need gmail connected.

The automation will run in the background without user intervention.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        name: {
          type: 'string',
          description: 'A short descriptive name for the automation (e.g., "Task Updated -> Email Notification")',
        },
        description: {
          type: 'string',
          description: 'A longer description of what this automation does',
        },
        trigger_type: {
          type: 'string',
          enum: [
            'gmail_email',
            'gmail_label',
            'clickup_task_created',
            'clickup_task_updated',
            'clickup_task_deleted',
            'clickup_task_status_updated',
            'clickup_task_assignee_updated',
            'clickup_task_comment_posted',
          ],
          description: `The type of trigger:
- gmail_email: When an email is received
- clickup_task_created: When a new task is created
- clickup_task_updated: When any task field is updated
- clickup_task_status_updated: When a task status changes
- clickup_task_assignee_updated: When task assignees change
- clickup_task_comment_posted: When a comment is added to a task
- clickup_task_deleted: When a task is deleted`,
        },
        trigger_config: {
          type: 'object',
          description: `Configuration for the trigger.

For gmail_email: { from_filter?: string, to_filter?: string, subject_contains?: string, has_attachment?: boolean }

For clickup_* triggers: { team_id: string (REQUIRED), space_id?: string, folder_id?: string, list_id?: string, list_name?: string }
- team_id is the workspace ID (get from get_workspaces)
- Optionally filter to specific space/folder/list`,
          properties: {
            // Gmail properties
            from_filter: { type: 'string', description: 'Filter emails from this sender' },
            to_filter: { type: 'string', description: 'Filter emails to this recipient' },
            subject_contains: { type: 'string', description: 'Filter by subject text' },
            has_attachment: { type: 'boolean', description: 'Filter by attachment presence' },
            // ClickUp properties
            team_id: { type: 'string', description: 'ClickUp workspace/team ID (REQUIRED for ClickUp triggers)' },
            space_id: { type: 'string', description: 'Filter to specific space' },
            folder_id: { type: 'string', description: 'Filter to specific folder' },
            list_id: { type: 'string', description: 'Filter to specific list' },
            list_name: { type: 'string', description: 'Human-readable list name for display' },
          },
        },
        action_type: {
          type: 'string',
          enum: ['clickup_create_task', 'clickup_add_comment', 'send_email'],
          description: 'The action to perform. For ClickUp triggers, send_email is most common.',
        },
        action_config: {
          type: 'object',
          description: `Configuration for the action.

For send_email: { to_template: string, subject_template: string, body_template: string }

For clickup_create_task: { list_id: string, title_template: string, description_template?: string, priority?: number }

Template variables for Gmail triggers: {{email.subject}}, {{email.from}}, {{email.body}}, {{email.snippet}}

Template variables for ClickUp triggers: {{task.name}}, {{task.status}}, {{task.url}}, {{task.assignees}}, {{task.priority}}, {{task.list_name}}, {{task.space_name}}, {{event}}, {{change_summary}}`,
          properties: {
            // send_email properties
            to_template: { type: 'string', description: 'Email recipient (can use templates)' },
            subject_template: { type: 'string', description: 'Email subject template' },
            body_template: { type: 'string', description: 'Email body template' },
            // clickup_create_task properties
            list_id: { type: 'string', description: 'List ID for new tasks' },
            list_name: { type: 'string', description: 'Human-readable list name' },
            title_template: { type: 'string', description: 'Task title template' },
            description_template: { type: 'string', description: 'Task description template' },
            priority: { type: 'number', description: 'Task priority (1-4)' },
          },
        },
      },
      required: ['name', 'trigger_type', 'trigger_config', 'action_type', 'action_config'],
    },
  },
  {
    name: 'list_automations',
    description: 'List all automations the user has created. Shows their status, last run time, and configuration.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'pause_automation',
    description: 'Pause an automation so it stops running. Use this when user wants to temporarily disable an automation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        automation_id: {
          type: 'string',
          description: 'The ID of the automation to pause',
        },
      },
      required: ['automation_id'],
    },
  },
  {
    name: 'resume_automation',
    description: 'Resume a paused automation so it starts running again.',
    input_schema: {
      type: 'object' as const,
      properties: {
        automation_id: {
          type: 'string',
          description: 'The ID of the automation to resume',
        },
      },
      required: ['automation_id'],
    },
  },
  {
    name: 'delete_automation',
    description: 'Permanently delete an automation. This cannot be undone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        automation_id: {
          type: 'string',
          description: 'The ID of the automation to delete',
        },
      },
      required: ['automation_id'],
    },
  },
]

// Execute a tool call
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  profile: { clickup_access_token?: string; google_access_token?: string; google_refresh_token?: string },
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  try {
    const accessToken = profile.clickup_access_token || ''

    switch (toolName) {
      case 'send_email': {
        if (!profile.google_access_token) {
          throw new Error('Gmail is not connected. Please connect Gmail in the dashboard.')
        }

        try {
          await sendEmail(
            profile.google_access_token,
            toolInput.to as string,
            toolInput.subject as string,
            toolInput.body as string
          )
        } catch (error) {
          // Attempt token refresh if failed
          if (profile.google_refresh_token) {
            try {
              const newTokens = await refreshGoogleToken(profile.google_refresh_token)
              // In a real app we would update the DB here. 
              // For now, let's try sending again with new token
              await sendEmail(
                newTokens.access_token,
                toolInput.to as string,
                toolInput.subject as string,
                toolInput.body as string
              )
            } catch (refreshError) {
              throw error // Original error
            }
          } else {
            throw error
          }
        }

        // Log to ClickUp if we have an access token
        if (accessToken) {
          await clickUpOperations.addComment(
            accessToken,
            toolInput.task_id as string,
            `📧 **Email Sent via Gmail**\n\n**To:** ${toolInput.to}\n**Subject:** ${toolInput.subject}\n\n${toolInput.body}`
          )
        }

        return JSON.stringify({ success: true, message: 'Email sent and logged to task.' })
      }
      case 'get_workspaces': {
        const result = await clickUpOperations.getWorkspaces(accessToken)
        return JSON.stringify(result, null, 2)
      }
      case 'get_spaces': {
        const result = await clickUpOperations.getSpaces(
          accessToken,
          toolInput.team_id as string
        )
        return JSON.stringify(result, null, 2)
      }
      case 'get_lists': {
        const result = await clickUpOperations.getLists(
          accessToken,
          toolInput.space_id as string
        )
        return JSON.stringify(result, null, 2)
      }
      case 'get_tasks': {
        const result = await clickUpOperations.getTasks(
          accessToken,
          toolInput.list_id as string
        )
        return JSON.stringify(result, null, 2)
      }
      case 'get_task': {
        const result = await clickUpOperations.getTask(
          accessToken,
          toolInput.task_id as string
        )
        return JSON.stringify(result, null, 2)
      }
      case 'create_task': {
        const result = await clickUpOperations.createTask(
          accessToken,
          toolInput.list_id as string,
          {
            name: toolInput.name as string,
            description: toolInput.description as string | undefined,
            priority: toolInput.priority as number | undefined,
            due_date: toolInput.due_date as number | undefined,
          }
        )
        return JSON.stringify(result, null, 2)
      }
      case 'update_task': {
        const result = await clickUpOperations.updateTask(
          accessToken,
          toolInput.task_id as string,
          {
            name: toolInput.name as string | undefined,
            description: toolInput.description as string | undefined,
            status: toolInput.status as string | undefined,
            priority: toolInput.priority as number | undefined,
          }
        )
        return JSON.stringify(result, null, 2)
      }
      case 'add_comment': {
        const result = await clickUpOperations.addComment(
          accessToken,
          toolInput.task_id as string,
          toolInput.comment as string
        )
        return JSON.stringify(result, null, 2)
      }
      case 'search_tasks': {
        const result = await clickUpOperations.searchTasks(
          accessToken,
          toolInput.team_id as string,
          toolInput.query as string
        )
        return JSON.stringify(result, null, 2)
      }
      case 'create_space': {
        const result = await clickUpOperations.createSpace(
          accessToken,
          toolInput.team_id as string,
          toolInput.name as string,
          toolInput.is_private as boolean
        )
        return JSON.stringify(result, null, 2)
      }
      case 'create_folder': {
        const result = await clickUpOperations.createFolder(
          accessToken,
          toolInput.space_id as string,
          toolInput.name as string
        )
        return JSON.stringify(result, null, 2)
      }
      case 'create_list': {
        const result = await clickUpOperations.createList(
          accessToken,
          toolInput.parent_id as string,
          toolInput.name as string,
          (toolInput.parent_type as 'space' | 'folder') || 'space'
        )
        return JSON.stringify(result, null, 2)
      }
      case 'get_custom_fields': {
        const result = await clickUpOperations.getCustomFields(
          accessToken,
          toolInput.list_id as string
        )
        return JSON.stringify(result, null, 2)
      }
      case 'set_custom_field': {
        const result = await clickUpOperations.setCustomFieldValue(
          accessToken,
          toolInput.task_id as string,
          toolInput.field_id as string,
          toolInput.value
        )
        return JSON.stringify(result, null, 2)
      }
      // ========== AUTOMATION TOOL HANDLERS ==========
      case 'create_automation': {
        const triggerType = toolInput.trigger_type as string
        const isGmailTrigger = triggerType.startsWith('gmail_')
        const isClickUpTrigger = triggerType.startsWith('clickup_')

        // Validate required tokens based on trigger/action type
        if (isGmailTrigger && !profile.google_access_token) {
          throw new Error('Gmail is not connected. Please connect Gmail first to create email-based automations.')
        }
        if (isClickUpTrigger && !accessToken) {
          throw new Error('ClickUp is not connected. Please connect ClickUp first to create ClickUp-triggered automations.')
        }
        // For send_email action, we need Gmail
        if (toolInput.action_type === 'send_email' && !profile.google_access_token) {
          throw new Error('Gmail is not connected. Please connect Gmail to use the send_email action.')
        }

        // Build trigger config with events array for ClickUp triggers
        let triggerConfig = toolInput.trigger_config as Record<string, unknown>
        if (isClickUpTrigger) {
          // Add the events array based on trigger type
          const events = triggerTypeToClickUpEvents(triggerType)
          triggerConfig = {
            ...triggerConfig,
            events,
          }
        }

        const automationInput = {
          name: toolInput.name as string,
          description: toolInput.description as string | undefined,
          trigger_type: triggerType,
          trigger_config: triggerConfig,
          action_type: toolInput.action_type,
          action_config: toolInput.action_config,
        } as CreateAutomationInput

        // Create the automation
        const automation = await createAutomation(supabase, userId, automationInput)

        // Set up webhook based on trigger type
        if (isGmailTrigger) {
          // Gmail trigger: set up Gmail watch
          try {
            await setupGmailWatch(
              supabase,
              automation.id,
              profile.google_access_token!,
              profile.google_refresh_token || null
            )
          } catch (watchError) {
            // Update automation status to indicate setup issue
            await updateAutomationStatus(supabase, automation.id, 'error')
            return JSON.stringify({
              success: false,
              error: 'Automation created but Gmail watch setup failed. This may be due to Gmail API permissions. Please reconnect Gmail with the required permissions.',
              automation_id: automation.id,
            })
          }
        } else if (isClickUpTrigger) {
          // ClickUp trigger: set up ClickUp webhook
          try {
            const clickUpConfig = triggerConfig as unknown as ClickUpTaskTriggerConfig
            await setupClickUpWebhookForAutomation(
              supabase,
              automation.id,
              automation.webhook_id!, // Our internal webhook ID for the callback URL
              accessToken,
              clickUpConfig
            )
          } catch (webhookError) {
            // Update automation status to indicate setup issue
            await updateAutomationStatus(supabase, automation.id, 'error')
            const errorMsg = webhookError instanceof Error ? webhookError.message : 'Unknown error'
            return JSON.stringify({
              success: false,
              error: `Automation created but ClickUp webhook setup failed: ${errorMsg}. Please check your ClickUp permissions.`,
              automation_id: automation.id,
            })
          }
        }

        return JSON.stringify({
          success: true,
          message: `Automation "${automation.name}" created successfully!`,
          automation: {
            id: automation.id,
            name: automation.name,
            status: automation.status,
            summary: generateAutomationSummary(automation),
            webhook_url: automation.webhook_id ? getWebhookUrl(automation.webhook_id) : null,
          },
        })
      }
      case 'list_automations': {
        const automations = await getAutomations(supabase, userId)

        if (automations.length === 0) {
          return JSON.stringify({
            message: 'No automations found. You can create one by asking me to set up an automation.',
            automations: [],
          })
        }

        const formattedAutomations = automations.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          summary: generateAutomationSummary(a),
          last_run: a.last_run_at,
          run_count: a.run_count,
          last_error: a.last_error,
        }))

        return JSON.stringify({
          message: `Found ${automations.length} automation(s)`,
          automations: formattedAutomations,
        }, null, 2)
      }
      case 'pause_automation': {
        const automation = await updateAutomationStatus(
          supabase,
          toolInput.automation_id as string,
          'paused'
        )
        return JSON.stringify({
          success: true,
          message: `Automation "${automation.name}" has been paused.`,
        })
      }
      case 'resume_automation': {
        const automation = await updateAutomationStatus(
          supabase,
          toolInput.automation_id as string,
          'active'
        )
        return JSON.stringify({
          success: true,
          message: `Automation "${automation.name}" has been resumed and is now active.`,
        })
      }
      case 'delete_automation': {
        await deleteAutomation(supabase, toolInput.automation_id as string)
        return JSON.stringify({
          success: true,
          message: 'Automation has been permanently deleted.',
        })
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user and their ClickUp token
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's profile with tokens
    const { data: profile } = await supabase
      .from('profiles')
      .select('clickup_access_token, google_access_token, google_refresh_token')
      .eq('id', user.id)
      .single()

    if (!profile?.clickup_access_token) {
      return NextResponse.json(
        { error: 'ClickUp not connected' },
        { status: 400 }
      )
    }

    const { messages } = await request.json()

    const systemPrompt = `You are a helpful assistant that helps users manage their ClickUp workspace and create automations.

## Your Capabilities:
1. **ClickUp Management**: Get/create workspaces, spaces, folders, lists, and tasks
2. **Email**: Send emails via Gmail and log them to ClickUp tasks
3. **Background Automations**: Create automations that run automatically in both directions:
   - Gmail → ClickUp: "when I get an email from X, create a task"
   - ClickUp → Email: "when a task is updated, send me an email notification"

## Automation Guidelines:

### Creating Gmail-Triggered Automations:
When a user asks "whenever I get an email from...", "automatically create a task when I receive...":
1. FIRST use get_workspaces, then get_spaces, then get_lists to find the correct list_id
2. Ask the user to confirm which list they want tasks created in
3. Use create_automation with trigger_type: 'gmail_email' and action_type: 'clickup_create_task'

### Creating ClickUp-Triggered Automations:
When a user asks "whenever a task is updated...", "send me an email when a task changes...", "notify me when...":
1. FIRST use get_workspaces to get the team_id (workspace ID) - this is REQUIRED
2. Optionally use get_spaces and get_lists if they want to filter to a specific list
3. Ask the user to confirm the scope (entire workspace, specific space, or specific list)
4. Ask what email address they want notifications sent to
5. Use create_automation with:
   - trigger_type: 'clickup_task_updated' (or 'clickup_task_status_updated', 'clickup_task_created', etc.)
   - trigger_config: { team_id: "...", list_id: "..." (optional) }
   - action_type: 'send_email'
   - action_config with templates using {{task.name}}, {{task.status}}, {{task.url}}, {{change_summary}}

### Available Triggers:
- **Gmail triggers**: gmail_email (filter by sender, subject, attachments)
- **ClickUp triggers**:
  - clickup_task_created: New task created
  - clickup_task_updated: Any task field updated
  - clickup_task_status_updated: Task status changed
  - clickup_task_assignee_updated: Assignees changed
  - clickup_task_comment_posted: Comment added
  - clickup_task_deleted: Task deleted

### Available Actions:
- clickup_create_task: Create a new task
- send_email: Send an email notification

### Template Variables:
**For Gmail triggers:** {{email.subject}}, {{email.from}}, {{email.to}}, {{email.body}}, {{email.snippet}}

**For ClickUp triggers:** {{task.name}}, {{task.status}}, {{task.url}}, {{task.assignees}}, {{task.priority}}, {{task.description}}, {{task.list_name}}, {{task.folder_name}}, {{task.space_name}}, {{event}}, {{change_summary}}

### Example ClickUp → Email Automation:
User: "Send me an email whenever a task is updated in my Projects list"
Steps:
1. Call get_workspaces → get team_id
2. Call get_spaces → find Projects space
3. Call get_lists → find the specific list_id
4. Confirm with user
5. Create automation:
   - trigger_type: 'clickup_task_updated'
   - trigger_config: { team_id: "...", list_id: "..." }
   - action_type: 'send_email'
   - action_config: {
       to_template: "user@email.com",
       subject_template: "Task Updated: {{task.name}}",
       body_template: "The task '{{task.name}}' was updated.\\n\\nChanges:\\n{{change_summary}}\\n\\nView task: {{task.url}}"
     }

## General Guidelines:
- Always be helpful and proactive in using tools
- Format output nicely for readability
- ALWAYS get the workspace hierarchy first before creating automations
- For ClickUp triggers, team_id is REQUIRED - always fetch it first`

    // Initial Claude call
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    })

    // Handle tool use in a loop
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            profile,
            user.id,
            supabase
          )
          return {
            type: 'tool_result' as const,
            tool_use_id: toolUse.id,
            content: result,
          }
        })
      )

      // Continue the conversation with tool results
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools,
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ],
      })
    }

    // Extract text response
    const textContent = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    )

    return NextResponse.json({
      message: textContent?.text || 'No response generated',
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
