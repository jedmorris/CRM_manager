'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChatMessage } from '@/lib/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [clickUpConnected, setClickUpConnected] = useState(false)
  const [clickUpUsername, setClickUpUsername] = useState<string | null>(null)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/')
      return
    }

    // Check if ClickUp and Gmail are connected
    const { data: profile } = await supabase
      .from('profiles')
      .select('clickup_access_token, clickup_username, google_access_token, google_email')
      .eq('id', user.id)
      .single()

    if (profile?.clickup_access_token) {
      setClickUpConnected(true)
      setClickUpUsername(profile.clickup_username)
    }

    if (profile?.google_access_token) {
      setGmailConnected(true)
      setGmailEmail(profile.google_email)
    }

    setLoading(false)
  }

  const connectClickUp = async () => {
    try {
      const response = await fetch('/api/clickup/auth-url')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to get auth URL')
      window.location.href = data.url
    } catch (error) {
      alert(error instanceof Error ? error.message : 'An error occurred')
    }
  }

  const connectGmail = async () => {
    try {
      const response = await fetch('/api/google/auth-url')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to get auth URL')
      window.location.href = data.url
    } catch (error) {
      alert(error instanceof Error ? error.message : 'An error occurred')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sending) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setSending(true)

    try {
      // Build messages array for API
      const apiMessages: Message[] = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send message')
      }

      const data = await response.json()

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">
            ClickUp CRM Automation
          </h1>
          <div className="flex items-center gap-4">
            {clickUpConnected ? (
              <div className="flex items-center gap-2 text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span className="text-sm">Connected as {clickUpUsername}</span>
              </div>
            ) : (
              <button
                onClick={connectClickUp}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Connect ClickUp
              </button>
            )}

            {gmailConnected ? (
              <div className="flex items-center gap-2 text-green-400">
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                <span className="text-sm">{gmailEmail}</span>
              </div>
            ) : (
              <button
                onClick={connectGmail}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Connect Gmail
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-6">
        {!clickUpConnected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-6">🔗</div>
              <h2 className="text-2xl font-semibold text-white mb-4">
                Connect Your ClickUp Account
              </h2>
              <p className="text-gray-400 mb-8 max-w-md">
                To start automating your CRM, connect your ClickUp account.
                We'll use secure OAuth to access your workspace.
              </p>
              <button
                onClick={connectClickUp}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Connect ClickUp Account
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-5xl mb-4">💬</div>
                  <h2 className="text-xl font-semibold text-white mb-2">
                    Start a Conversation
                  </h2>
                  <p className="text-gray-400 max-w-md mx-auto">
                    Ask me to help you manage your ClickUp CRM. For example:
                  </p>
                  <div className="mt-4 space-y-2 text-gray-500 text-sm">
                    <p>"Show me all my workspaces"</p>
                    <p>"Create a task called 'Follow up with client' in my Sales list"</p>
                    <p>"What tasks are due this week?"</p>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                  >
                    <div
                      className={`max-w-[80%] px-4 py-3 rounded-2xl ${message.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                        }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 text-gray-400 px-4 py-3 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={sendMessage} className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
