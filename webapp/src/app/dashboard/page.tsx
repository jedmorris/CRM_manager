'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChatMessage } from '@/lib/types'
import AutomationsList from '@/components/AutomationsList'

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
    const response = await fetch('/api/clickup/auth-url')
    const { url } = await response.json()
    window.location.href = url
  }

  const connectGmail = async () => {
    const response = await fetch('/api/google/auth-url')
    const { url } = await response.json()
    window.location.href = url
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-accent selection:text-black">
      {/* Navbar */}
      <nav className="border-b border-border/50 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-6 bg-accent rounded-sm skew-x-[-12deg]"></div>
            <span className="font-bold text-xl tracking-tight">CRM<span className="text-gray-500 font-normal">Manager</span></span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm font-medium hover:text-white text-gray-400 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Sidebar / Status Panel */}
        <div className="lg:col-span-3 space-y-6">
          {/* Status Cards (Bento Grid) */}
          <div className="grid gap-4">
            {/* ClickUp Card */}
            <div className="bg-card border border-border p-5 rounded-3xl flex flex-col gap-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" /></svg>
              </div>
              <div className="flex items-center justify-between z-10">
                <h3 className="font-semibold text-lg">ClickUp</h3>
                {clickUpConnected && <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_#CCFF00]"></span>}
              </div>
              <p className="text-gray-400 text-sm z-10 min-h-[40px]">
                {clickUpConnected ? `Connected as ${clickUpUsername}` : 'Manage tasks & lists'}
              </p>
              {!clickUpConnected ? (
                <button
                  onClick={connectClickUp}
                  className="w-full py-3 rounded-full bg-white text-black font-semibold text-sm hover:scale-[1.02] transition-transform active:scale-95"
                >
                  Connect
                </button>
              ) : (
                <div className="h-10 flex items-center text-sm text-accent font-medium">
                  ✓ Active
                </div>
              )}
            </div>

            {/* Gmail Card */}
            <div className="bg-card border border-border p-5 rounded-3xl flex flex-col gap-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"> <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" /> </svg>
              </div>
              <div className="flex items-center justify-between z-10">
                <h3 className="font-semibold text-lg">Gmail</h3>
                {gmailConnected && <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_#CCFF00]"></span>}
              </div>
              <p className="text-gray-400 text-sm z-10 min-h-[40px]">
                {gmailConnected ? `Connected as ${gmailEmail}` : 'Send emails & logs'}
              </p>
              {!gmailConnected ? (
                <button
                  onClick={connectGmail}
                  className="w-full py-3 rounded-full bg-white text-black font-semibold text-sm hover:scale-[1.02] transition-transform active:scale-95"
                >
                  Connect
                </button>
              ) : (
                <div className="h-10 flex items-center text-sm text-accent font-medium">
                  ✓ Active
                </div>
              )}
            </div>
          </div>

          {/* Automations Panel */}
          {clickUpConnected && gmailConnected && (
            <AutomationsList />
          )}
        </div>

        {/* Main Chat Area */}
        <div className="lg:col-span-9 flex flex-col h-[calc(100vh-8rem)]">
          <div className="flex-1 bg-card border border-border rounded-[2rem] p-4 flex flex-col relative overflow-hidden">

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 scrollbar-hide">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                  <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6">
                    <span className="text-3xl">✨</span>
                  </div>
                  <h3 className="text-xl font-medium mb-2">How can I help you?</h3>
                  <p className="text-sm max-w-sm">Try asking to "Check my tasks", "Email John about the project", or "Create an automation when I get emails from..."</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-6 py-4 rounded-2xl text-[15px] leading-relaxed ${message.role === 'user'
                          ? 'bg-white text-black rounded-br-sm font-medium'
                          : 'bg-[#1a1a1a] text-gray-200 border border-border rounded-bl-sm'
                        }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))
              )}
              {sending && (
                <div className="flex justify-start">
                  <div className="px-6 py-4 rounded-2xl bg-[#1a1a1a] border border-border rounded-bl-sm flex gap-2 items-center">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Floating Bar */}
            <div className="p-4 pt-2">
              <form
                onSubmit={sendMessage}
                className="relative flex items-center gap-2 bg-[#050505] border border-border p-2 rounded-full shadow-2xl shadow-black/50 transition-all focus-within:border-gray-500"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent border-none text-white px-6 py-3 focus:outline-none placeholder-gray-600 font-medium"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="p-3 bg-accent text-black rounded-full hover:brightness-110 disabled:opacity-50 disabled:grayscale transition-all active:scale-95"
                >
                  <svg className="w-5 h-5 translate-x-px" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </form>
            </div>

          </div>
        </div>

      </main>
    </div>
  )
}
