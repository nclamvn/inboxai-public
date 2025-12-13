'use client'

import { useState, useEffect } from 'react'
import {
  Zap, Play, Pause, Trash2,
  Loader2, Clock, CheckCircle,
  Archive, Tag, Mail
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

interface Rule {
  id: string
  name: string
  description: string
  is_active: boolean
  is_system: boolean
  conditions: {
    match: string
    rules: { field: string; operator: string; value: string | number | boolean }[]
  }
  actions: { type: string; label?: string; priority?: number }[]
  run_frequency: string
  total_runs: number
  total_affected: number
  last_run_at: string | null
}

export function RulesList() {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [runningRule, setRunningRule] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchRules()
  }, [])

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toastMessage])

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/automation/rules')
      const data = await res.json()
      setRules(data.rules || [])
    } catch (error) {
      console.error('Failed to fetch rules:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleRule = async (ruleId: string, isActive: boolean) => {
    try {
      await fetch(`/api/automation/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive })
      })
      setRules(rules.map(r =>
        r.id === ruleId ? { ...r, is_active: !isActive } : r
      ))
      setToastMessage(isActive ? 'Đã tắt rule' : 'Đã bật rule')
    } catch {
      setToastMessage('Không thể cập nhật rule')
    }
  }

  const handleRunRule = async (ruleId: string) => {
    setRunningRule(ruleId)
    try {
      const res = await fetch('/api/automation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId })
      })
      const data = await res.json()

      setToastMessage(`Đã xử lý ${data.result?.emailsAffected || 0} email`)
      fetchRules()
    } catch {
      setToastMessage('Không thể chạy rule')
    } finally {
      setRunningRule(null)
    }
  }

  const runAllRulesHandler = async () => {
    setRunningRule('all')
    try {
      const res = await fetch('/api/automation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()

      setToastMessage(`${data.rulesRun} rules, xử lý ${data.totalAffected} email`)
      fetchRules()
    } catch {
      setToastMessage('Không thể chạy automation')
    } finally {
      setRunningRule(null)
    }
  }

  const deleteRule = async (ruleId: string) => {
    if (!confirm('Bạn có chắc muốn xóa rule này?')) return

    try {
      await fetch(`/api/automation/rules/${ruleId}`, { method: 'DELETE' })
      setRules(rules.filter(r => r.id !== ruleId))
      setToastMessage('Đã xóa rule')
    } catch {
      setToastMessage('Không thể xóa rule')
    }
  }

  const getActionIcon = (actions: { type: string }[]) => {
    const type = actions[0]?.type
    switch (type) {
      case 'archive': return Archive
      case 'delete': return Trash2
      case 'add_label': return Tag
      default: return Mail
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-[var(--muted-foreground)]">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-[14px]">Đang tải...</p>
      </div>
    )
  }

  return (
    <div className="p-5">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-3 rounded-xl shadow-lg text-[14px] animate-in slide-in-from-bottom-2">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[16px] font-semibold text-[var(--foreground)]">
            Automation Rules
          </h2>
          <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
            Tự động hóa việc xử lý email
          </p>
        </div>
        <Button
          onClick={runAllRulesHandler}
          disabled={runningRule === 'all'}
          loading={runningRule === 'all'}
          size="sm"
          icon={<Play className="w-3.5 h-3.5" strokeWidth={1.5} />}
        >
          Chạy tất cả
        </Button>
      </div>

      {/* Rules List */}
      <div className="space-y-2">
        {rules.map((rule) => {
          const ActionIcon = getActionIcon(rule.actions)
          return (
            <div
              key={rule.id}
              className={cn(
                'border rounded-xl p-4 transition-colors',
                rule.is_active
                  ? 'border-[var(--border)] bg-[var(--card)]'
                  : 'border-[var(--border)] bg-[var(--secondary)] opacity-75'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                  rule.is_active ? 'bg-[var(--primary)]' : 'bg-[var(--secondary)]'
                )}>
                  <ActionIcon className={cn(
                    'w-4 h-4',
                    rule.is_active ? 'text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)]'
                  )} strokeWidth={1.5} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={cn(
                      'text-[14px] font-medium',
                      rule.is_active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
                    )}>
                      {rule.name}
                    </h3>
                    {rule.is_system && (
                      <Badge variant="secondary" size="sm">
                        Hệ thống
                      </Badge>
                    )}
                  </div>
                  <p className="text-[13px] text-[var(--muted-foreground)] mt-0.5">
                    {rule.description}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-3 mt-2 text-[12px] text-[var(--muted)]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" strokeWidth={1.5} />
                      {rule.run_frequency === 'daily' ? 'Hàng ngày' :
                        rule.run_frequency === 'hourly' ? 'Hàng giờ' :
                          rule.run_frequency === 'realtime' ? 'Realtime' : 'Hàng tuần'}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" strokeWidth={1.5} />
                      {rule.total_runs || 0} lần
                    </span>
                    <span>
                      {rule.total_affected || 0} email
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRunRule(rule.id)}
                    disabled={runningRule === rule.id || !rule.is_active}
                    className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors disabled:opacity-50"
                    title="Chạy ngay"
                  >
                    {runningRule === rule.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" strokeWidth={1.5} />
                    ) : (
                      <Play className="w-4 h-4 text-[var(--muted-foreground)]" strokeWidth={1.5} />
                    )}
                  </button>

                  <button
                    onClick={() => toggleRule(rule.id, rule.is_active)}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      rule.is_active
                        ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'hover:bg-green-50 dark:hover:bg-green-500/10 text-green-600 dark:text-green-400'
                    )}
                    title={rule.is_active ? 'Tắt' : 'Bật'}
                  >
                    {rule.is_active ? (
                      <Pause className="w-4 h-4" strokeWidth={1.5} />
                    ) : (
                      <Play className="w-4 h-4" strokeWidth={1.5} />
                    )}
                  </button>

                  {!rule.is_system && (
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600 dark:text-red-400 transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {rules.length === 0 && (
        <EmptyState
          icon={<Zap className="w-8 h-8" strokeWidth={1.5} />}
          title="Chưa có automation rules"
          description="Tạo rule để tự động hóa việc xử lý email"
        />
      )}
    </div>
  )
}
