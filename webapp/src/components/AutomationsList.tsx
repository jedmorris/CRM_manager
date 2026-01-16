'use client'

import { useEffect, useState } from 'react'

interface Automation {
  id: string
  name: string
  description: string | null
  status: 'active' | 'paused' | 'error'
  summary: string
  last_run_at: string | null
  run_count: number
  last_error: string | null
  webhook_url: string | null
}

interface AutomationsListProps {
  onRefresh?: () => void
}

export default function AutomationsList({ onRefresh }: AutomationsListProps) {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchAutomations()
  }, [])

  const fetchAutomations = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/automations')
      if (!response.ok) {
        throw new Error('Failed to fetch automations')
      }
      const data = await response.json()
      setAutomations(data.automations || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automations')
    } finally {
      setLoading(false)
    }
  }

  const handlePause = async (automationId: string) => {
    setActionLoading(automationId)
    try {
      const response = await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: automationId, status: 'paused' }),
      })
      if (!response.ok) throw new Error('Failed to pause automation')
      await fetchAutomations()
    } catch (err) {
      console.error('Error pausing automation:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleResume = async (automationId: string) => {
    setActionLoading(automationId)
    try {
      const response = await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: automationId, status: 'active' }),
      })
      if (!response.ok) throw new Error('Failed to resume automation')
      await fetchAutomations()
    } catch (err) {
      console.error('Error resuming automation:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (automationId: string) => {
    if (!confirm('Are you sure you want to delete this automation? This cannot be undone.')) {
      return
    }
    setActionLoading(automationId)
    try {
      const response = await fetch(`/api/automations?id=${automationId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Failed to delete automation')
      await fetchAutomations()
      onRefresh?.()
    } catch (err) {
      console.error('Error deleting automation:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const formatLastRun = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-accent shadow-[0_0_10px_#CCFF00]'
      case 'paused':
        return 'bg-yellow-500'
      case 'error':
        return 'bg-red-500 shadow-[0_0_10px_#ef4444]'
      default:
        return 'bg-gray-500'
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border p-5 rounded-3xl">
        <h3 className="font-semibold text-lg mb-4">Automations</h3>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-card border border-border p-5 rounded-3xl">
        <h3 className="font-semibold text-lg mb-4">Automations</h3>
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={fetchAutomations}
          className="mt-3 text-sm text-accent hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border p-5 rounded-3xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Automations</h3>
        <button
          onClick={fetchAutomations}
          className="text-gray-400 hover:text-white transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {automations.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-sm mb-1">No automations yet</p>
          <p className="text-xs text-gray-600">Ask in chat to create one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((automation) => (
            <div
              key={automation.id}
              className="bg-[#0a0a0a] border border-border/50 rounded-2xl p-4 hover:border-border transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(automation.status)}`}></span>
                    <h4 className="font-medium text-sm truncate">{automation.name}</h4>
                  </div>
                  <p className="text-xs text-gray-500 mb-2 line-clamp-2">{automation.summary}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span>Runs: {automation.run_count}</span>
                    <span>Last: {formatLastRun(automation.last_run_at)}</span>
                  </div>
                  {automation.last_error && (
                    <p className="text-xs text-red-400 mt-2 truncate" title={automation.last_error}>
                      Error: {automation.last_error}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {automation.status === 'active' ? (
                    <button
                      onClick={() => handlePause(automation.id)}
                      disabled={actionLoading === automation.id}
                      className="p-2 text-gray-400 hover:text-yellow-500 transition-colors disabled:opacity-50"
                      title="Pause"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleResume(automation.id)}
                      disabled={actionLoading === automation.id}
                      className="p-2 text-gray-400 hover:text-accent transition-colors disabled:opacity-50"
                      title="Resume"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(automation.id)}
                    disabled={actionLoading === automation.id}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
