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
  created_at: string
  updated_at: string
}
