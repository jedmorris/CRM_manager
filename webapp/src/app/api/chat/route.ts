import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { clickUpOperations } from '@/lib/clickup'
import { sendEmail, refreshGoogleToken } from '@/lib/google'

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
  }
]

// Execute a tool call
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  profile: any
): Promise<string> {
  try {
    const accessToken = profile.clickup_access_token

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

    // Initial Claude call
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are a helpful assistant that helps users manage their ClickUp workspace.
You have access to tools that can interact with ClickUp to get information and perform actions.
You also have the ability to send emails via Gmail.
When asked to send an email, use the send_email tool. This tool will automatically log the email to the specified ClickUp task.
Always be helpful and proactive in using the tools to accomplish what the user asks.
When listing items, format them nicely for readability.
If you need to know the workspace/team ID first, call get_workspaces to find it.`,
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
            profile
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
        system: `You are a helpful assistant that helps users manage their ClickUp workspace.
You have access to tools that can interact with ClickUp to get information and perform actions.
You also have the ability to send emails via Gmail.
When asked to send an email, use the send_email tool. This tool will automatically log the email to the specified ClickUp task.
Always be helpful and proactive in using the tools to accomplish what the user asks.
When listing items, format them nicely for readability.
If you need to know the workspace/team ID first, call get_workspaces to find it.`,
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
