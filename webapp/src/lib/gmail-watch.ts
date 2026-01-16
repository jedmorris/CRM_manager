import { SupabaseClient } from '@supabase/supabase-js'
import { updateGmailWatchInfo } from './automations'
import { refreshGoogleToken } from './google'

const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'

// Google Cloud Pub/Sub topic for Gmail push notifications
// This should be created in Google Cloud Console and configured to push to your Modal webhook
const GMAIL_PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC || 'projects/your-project/topics/gmail-automations'

interface GmailWatchResponse {
  historyId: string
  expiration: string // Unix timestamp in ms
}

interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  payload: {
    headers: Array<{ name: string; value: string }>
    body?: { data?: string }
    parts?: Array<{
      mimeType: string
      body?: { data?: string }
    }>
  }
  internalDate: string
}

interface GmailHistoryRecord {
  id: string
  messages?: Array<{ id: string; threadId: string }>
  messagesAdded?: Array<{ message: { id: string; threadId: string; labelIds: string[] } }>
}

/**
 * Sets up a Gmail watch to receive push notifications for new emails.
 * Gmail watches expire after 7 days and need to be renewed.
 */
export async function setupGmailWatch(
  supabase: SupabaseClient,
  automationId: string,
  accessToken: string,
  refreshToken: string | null
): Promise<GmailWatchResponse> {
  let token = accessToken

  // Try to set up the watch
  let response = await fetch(`${GMAIL_API_URL}/watch`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName: GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'INCLUDE',
    }),
  })

  // If token expired, refresh and retry
  if (response.status === 401 && refreshToken) {
    const newTokens = await refreshGoogleToken(refreshToken)
    token = newTokens.access_token

    // Update token in database
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('profiles')
        .update({ google_access_token: token })
        .eq('id', user.id)
    }

    // Retry the watch request
    response = await fetch(`${GMAIL_API_URL}/watch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName: GMAIL_PUBSUB_TOPIC,
        labelIds: ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      }),
    })
  }

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to setup Gmail watch: ${error}`)
  }

  const watchData: GmailWatchResponse = await response.json()

  // Store the history ID and expiration in the automation record
  const expiration = new Date(parseInt(watchData.expiration))
  await updateGmailWatchInfo(supabase, automationId, watchData.historyId, expiration)

  return watchData
}

/**
 * Stops a Gmail watch.
 */
export async function stopGmailWatch(accessToken: string): Promise<void> {
  const response = await fetch(`${GMAIL_API_URL}/stop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to stop Gmail watch: ${error}`)
  }
}

/**
 * Gets new messages since a given history ID.
 * Used when a push notification is received to fetch the actual new emails.
 */
export async function getNewMessagesSinceHistoryId(
  accessToken: string,
  historyId: string
): Promise<{ messages: GmailMessage[]; newHistoryId: string }> {
  const response = await fetch(
    `${GMAIL_API_URL}/history?startHistoryId=${historyId}&historyTypes=messageAdded&labelId=INBOX`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get Gmail history: ${error}`)
  }

  const data = await response.json() as {
    history?: GmailHistoryRecord[]
    historyId: string
  }

  if (!data.history) {
    return { messages: [], newHistoryId: data.historyId }
  }

  // Extract message IDs from history
  const messageIds = new Set<string>()
  for (const record of data.history) {
    if (record.messagesAdded) {
      for (const added of record.messagesAdded) {
        messageIds.add(added.message.id)
      }
    }
  }

  // Fetch full message details for each new message
  const messages: GmailMessage[] = []
  for (const messageId of messageIds) {
    const message = await getMessage(accessToken, messageId)
    if (message) {
      messages.push(message)
    }
  }

  return { messages, newHistoryId: data.historyId }
}

/**
 * Gets a single message by ID.
 */
export async function getMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage | null> {
  const response = await fetch(`${GMAIL_API_URL}/messages/${messageId}?format=full`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    console.error(`Failed to get message ${messageId}`)
    return null
  }

  return response.json()
}

/**
 * Extracts email data from a Gmail message for use in automation templates.
 */
export function extractEmailData(message: GmailMessage): {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  date: string
  snippet: string
  body: string
  hasAttachment: boolean
} {
  const headers = message.payload.headers || []

  const getHeader = (name: string): string => {
    const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    return header?.value || ''
  }

  // Extract body text
  let body = ''
  if (message.payload.body?.data) {
    body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
  } else if (message.payload.parts) {
    const textPart = message.payload.parts.find((p) => p.mimeType === 'text/plain')
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
    }
  }

  // Check for attachments
  const hasAttachment = message.payload.parts?.some(
    (p) => p.mimeType !== 'text/plain' && p.mimeType !== 'text/html'
  ) || false

  return {
    id: message.id,
    threadId: message.threadId,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    snippet: message.snippet,
    body,
    hasAttachment,
  }
}

/**
 * Checks if an email matches the trigger configuration.
 */
export function emailMatchesTrigger(
  emailData: ReturnType<typeof extractEmailData>,
  triggerConfig: {
    from_filter?: string
    to_filter?: string
    subject_contains?: string
    has_attachment?: boolean
  }
): boolean {
  // Check from filter
  if (triggerConfig.from_filter) {
    const fromLower = emailData.from.toLowerCase()
    const filterLower = triggerConfig.from_filter.toLowerCase()
    if (!fromLower.includes(filterLower)) {
      return false
    }
  }

  // Check to filter
  if (triggerConfig.to_filter) {
    const toLower = emailData.to.toLowerCase()
    const filterLower = triggerConfig.to_filter.toLowerCase()
    if (!toLower.includes(filterLower)) {
      return false
    }
  }

  // Check subject contains
  if (triggerConfig.subject_contains) {
    const subjectLower = emailData.subject.toLowerCase()
    const filterLower = triggerConfig.subject_contains.toLowerCase()
    if (!subjectLower.includes(filterLower)) {
      return false
    }
  }

  // Check attachment requirement
  if (triggerConfig.has_attachment !== undefined) {
    if (triggerConfig.has_attachment !== emailData.hasAttachment) {
      return false
    }
  }

  return true
}
