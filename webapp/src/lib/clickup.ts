import { ClickUpTokens, ClickUpUser } from './types'

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2'
const CLICKUP_AUTH_URL = 'https://app.clickup.com/api'

export function getClickUpAuthUrl(): string {
  const clientId = process.env.CLICKUP_CLIENT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`

  return `${CLICKUP_AUTH_URL}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`
}

export async function exchangeCodeForToken(code: string): Promise<ClickUpTokens> {
  const response = await fetch(`${CLICKUP_API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.CLICKUP_CLIENT_ID,
      client_secret: process.env.CLICKUP_CLIENT_SECRET,
      code,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange code for token: ${error}`)
  }

  return response.json()
}

export async function getClickUpUser(accessToken: string): Promise<ClickUpUser> {
  const response = await fetch(`${CLICKUP_API_URL}/user`, {
    headers: {
      Authorization: accessToken,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get ClickUp user')
  }

  const data = await response.json()
  return data.user
}

// ClickUp API wrapper functions for use with Claude
export async function clickUpRequest(
  accessToken: string,
  endpoint: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${CLICKUP_API_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`ClickUp API error: ${error}`)
  }

  return response.json()
}

// Common ClickUp operations
export const clickUpOperations = {
  async getWorkspaces(accessToken: string) {
    return clickUpRequest(accessToken, '/team')
  },

  async getSpaces(accessToken: string, teamId: string) {
    return clickUpRequest(accessToken, `/team/${teamId}/space`)
  },

  async getLists(accessToken: string, spaceId: string) {
    return clickUpRequest(accessToken, `/space/${spaceId}/list`)
  },

  async getFolderLists(accessToken: string, folderId: string) {
    return clickUpRequest(accessToken, `/folder/${folderId}/list`)
  },

  async getTasks(accessToken: string, listId: string) {
    return clickUpRequest(accessToken, `/list/${listId}/task`)
  },

  async getTask(accessToken: string, taskId: string) {
    return clickUpRequest(accessToken, `/task/${taskId}`)
  },

  async createTask(accessToken: string, listId: string, task: {
    name: string
    description?: string
    priority?: number
    due_date?: number
    assignees?: number[]
  }) {
    return clickUpRequest(accessToken, `/list/${listId}/task`, {
      method: 'POST',
      body: JSON.stringify(task),
    })
  },

  async updateTask(accessToken: string, taskId: string, updates: {
    name?: string
    description?: string
    status?: string
    priority?: number
    due_date?: number
  }) {
    return clickUpRequest(accessToken, `/task/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  },

  async addComment(accessToken: string, taskId: string, commentText: string) {
    return clickUpRequest(accessToken, `/task/${taskId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ comment_text: commentText }),
    })
  },

  async searchTasks(accessToken: string, teamId: string, query: string) {
    return clickUpRequest(
      accessToken,
      `/team/${teamId}/task?query=${encodeURIComponent(query)}`
    )
  },

  // Structural Creation
  async createSpace(accessToken: string, teamId: string, name: string, isPrivate: boolean = false) {
    return clickUpRequest(accessToken, `/team/${teamId}/space`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        multiple_assignees: true,
        features: {
          due_dates: { enabled: true, start_date: true, remap_due_dates: true, remap_closed_due_date: false },
          time_tracking: { enabled: false },
          tags: { enabled: true },
          time_estimates: { enabled: false },
          checklists: { enabled: true },
          custom_fields: { enabled: true },
          remap_dependencies: { enabled: true },
          dependency_warning: { enabled: true },
          portfolios: { enabled: true }
        },
        private: isPrivate
      })
    })
  },

  async createFolder(accessToken: string, spaceId: string, name: string) {
    return clickUpRequest(accessToken, `/space/${spaceId}/folder`, {
      method: 'POST',
      body: JSON.stringify({ name })
    })
  },

  async createList(accessToken: string, parentId: string, name: string, parentType: 'space' | 'folder' = 'space') {
    const endpoint = parentType === 'folder'
      ? `/folder/${parentId}/list`
      : `/space/${parentId}/list`

    return clickUpRequest(accessToken, endpoint, {
      method: 'POST',
      body: JSON.stringify({ name })
    })
  },

  // Custom Fields
  async getCustomFields(accessToken: string, listId: string) {
    return clickUpRequest(accessToken, `/list/${listId}/field`)
  },

  async setCustomFieldValue(accessToken: string, taskId: string, fieldId: string, value: any) {
    return clickUpRequest(accessToken, `/task/${taskId}/field/${fieldId}`, {
      method: 'POST',
      body: JSON.stringify({ value })
    })
  },
}

// Convenience exports for direct use
export const createTask = clickUpOperations.createTask
export const getWorkspaces = clickUpOperations.getWorkspaces
export const getSpaces = clickUpOperations.getSpaces
export const getLists = clickUpOperations.getLists
