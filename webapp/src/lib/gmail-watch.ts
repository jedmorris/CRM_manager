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

interface GmailMessagePart {
  partId?: string
  mimeType: string
  filename?: string
  headers?: Array<{ name: string; value: string }>
  body?: {
    attachmentId?: string
    size?: number
    data?: string
  }
  parts?: GmailMessagePart[] // Nested parts for multipart messages
}

interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  snippet: string
  payload: {
    headers: Array<{ name: string; value: string }>
    mimeType?: string
    body?: {
      attachmentId?: string
      size?: number
      data?: string
    }
    parts?: GmailMessagePart[]
  }
  internalDate: string
}

// Attachment metadata for automation templates
export interface AttachmentInfo {
  filename: string
  mimeType: string
  size: number
  attachmentId: string
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

interface GmailThread {
  id: string
  historyId: string
  messages: GmailMessage[]
}

export interface ThreadContext {
  threadId: string
  messageCount: number
  hasReplies: boolean
  participants: string[]
  originalSender: string
  originalSubject: string
  originalDate: string
  latestDate: string
  positionInThread: number // 1-indexed position of current message
  isFirstMessage: boolean
  isLatestMessage: boolean
  messages: Array<{
    id: string
    from: string
    to: string
    date: string
    snippet: string
    isReply: boolean
  }>
}

/**
 * Gets the full thread context for a message.
 * Useful for understanding conversation history and position.
 */
export async function getThreadContext(
  accessToken: string,
  threadId: string,
  currentMessageId?: string
): Promise<ThreadContext | null> {
  const response = await fetch(`${GMAIL_API_URL}/threads/${threadId}?format=full`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    console.error(`Failed to get thread ${threadId}`)
    return null
  }

  const thread: GmailThread = await response.json()
  const messages = thread.messages || []

  if (messages.length === 0) {
    return null
  }

  // Helper to get header from a message
  const getHeader = (msg: GmailMessage, name: string): string => {
    const header = msg.payload.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase()
    )
    return header?.value || ''
  }

  // Extract participant emails (unique senders and recipients)
  const participantSet = new Set<string>()
  for (const msg of messages) {
    const from = getHeader(msg, 'From')
    const to = getHeader(msg, 'To')
    if (from) participantSet.add(from)
    if (to) {
      // To can have multiple recipients
      to.split(',').forEach((addr) => participantSet.add(addr.trim()))
    }
  }

  // First message in thread
  const firstMsg = messages[0]
  const lastMsg = messages[messages.length - 1]

  // Find position of current message
  let positionInThread = messages.length // Default to last
  if (currentMessageId) {
    const idx = messages.findIndex((m) => m.id === currentMessageId)
    if (idx !== -1) {
      positionInThread = idx + 1
    }
  }

  // Build message summaries
  const messageSummaries = messages.map((msg, idx) => ({
    id: msg.id,
    from: getHeader(msg, 'From'),
    to: getHeader(msg, 'To'),
    date: getHeader(msg, 'Date'),
    snippet: msg.snippet,
    isReply: idx > 0 || !!getHeader(msg, 'In-Reply-To'),
  }))

  return {
    threadId: thread.id,
    messageCount: messages.length,
    hasReplies: messages.length > 1,
    participants: Array.from(participantSet),
    originalSender: getHeader(firstMsg, 'From'),
    originalSubject: getHeader(firstMsg, 'Subject'),
    originalDate: getHeader(firstMsg, 'Date'),
    latestDate: getHeader(lastMsg, 'Date'),
    positionInThread,
    isFirstMessage: positionInThread === 1,
    isLatestMessage: positionInThread === messages.length,
    messages: messageSummaries,
  }
}

/**
 * Recursively extracts body content and attachments from message parts.
 */
function extractFromParts(
  parts: GmailMessagePart[] | undefined,
  result: { textBody: string; htmlBody: string; attachments: AttachmentInfo[] }
): void {
  if (!parts) return

  for (const part of parts) {
    // Handle nested multipart structures
    if (part.parts) {
      extractFromParts(part.parts, result)
      continue
    }

    // Extract text body
    if (part.mimeType === 'text/plain' && part.body?.data && !result.textBody) {
      result.textBody = Buffer.from(part.body.data, 'base64').toString('utf-8')
    }

    // Extract HTML body
    if (part.mimeType === 'text/html' && part.body?.data && !result.htmlBody) {
      result.htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8')
    }

    // Extract attachment metadata
    if (part.filename && part.body?.attachmentId) {
      result.attachments.push({
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
      })
    }
  }
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
  htmlBody: string
  hasAttachment: boolean
  attachments: AttachmentInfo[]
  attachmentCount: number
  // Reply detection fields
  isReply: boolean
  inReplyTo: string | null
  references: string[]
} {
  const headers = message.payload.headers || []

  const getHeader = (name: string): string => {
    const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    return header?.value || ''
  }

  // Initialize extraction result
  const extracted = { textBody: '', htmlBody: '', attachments: [] as AttachmentInfo[] }

  // Handle simple single-part messages
  if (message.payload.body?.data) {
    const content = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
    if (message.payload.mimeType === 'text/html') {
      extracted.htmlBody = content
    } else {
      extracted.textBody = content
    }
  }

  // Handle multipart messages
  extractFromParts(message.payload.parts, extracted)

  // Reply detection - check In-Reply-To and References headers
  const inReplyToHeader = getHeader('In-Reply-To').trim()
  const referencesHeader = getHeader('References').trim()

  // Parse references - space or newline separated list of message IDs
  const references = referencesHeader
    ? referencesHeader.split(/\s+/).filter(ref => ref.length > 0)
    : []

  // Email is a reply if it has In-Reply-To header or References
  const isReply = !!inReplyToHeader || references.length > 0

  return {
    id: message.id,
    threadId: message.threadId,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    snippet: message.snippet,
    body: extracted.textBody,
    htmlBody: extracted.htmlBody,
    hasAttachment: extracted.attachments.length > 0,
    attachments: extracted.attachments,
    attachmentCount: extracted.attachments.length,
    // Reply detection
    isReply,
    inReplyTo: inReplyToHeader || null,
    references,
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
    is_reply?: boolean
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

  // Check reply filter
  if (triggerConfig.is_reply !== undefined) {
    if (triggerConfig.is_reply !== emailData.isReply) {
      return false
    }
  }

  return true
}
