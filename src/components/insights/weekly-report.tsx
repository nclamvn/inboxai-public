'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, Minus,
  Mail, Clock, Inbox, Users, Zap, Star,
  AlertCircle, Lightbulb, ChevronRight, Loader2,
  UserX, Bell
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatCard } from '@/components/ui/stat-card'
import { IconBox } from '@/components/ui/icon-box'
import { Badge } from '@/components/ui/badge'

interface WeeklyReport {
  period: { start: string; end: string }
  stats: {
    totalReceived: number
    totalProcessed: number
    processRate: number
    avgResponseTime: number
    inboxZeroDays: number
    busiestDay: string
    busiestHour: number
    categoryBreakdown: Record<string, number>
  }
  topSenders: Array<{
    email: string
    name: string
    totalEmails: number
    openRate: number
    suggestion: string
    reason: string
  }>
  productivity: {
    score: number
    grade: string
    trend: string
    trendValue: number
    factors: Array<{ name: string; score: number; weight: number }>
  }
  suggestions: Array<{
    type: string
    title: string
    description: string
    actionable: boolean
  }>
  comparison: Array<{
    metric: string
    current: number
    previous: number
    change: number
    changePercent: number
  }>
}

export function WeeklyReportView() {
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReport()
  }, [])

  const fetchReport = async () => {
    try {
      const res = await fetch('/api/ai/insights/weekly')
      const data = await res.json()
      setReport(data)
    } catch (error) {
      console.error('Failed to fetch report:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[#9B9B9B]" strokeWidth={1.5} />
        <p className="text-[15px] text-[#6B6B6B]">Đang phân tích dữ liệu...</p>
      </div>
    )
  }

  if (!report) {
    return (
      <div className="p-12 text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[#D4D4D4]" strokeWidth={1.5} />
        <p className="text-[15px] text-[#6B6B6B]">Không thể tải báo cáo</p>
      </div>
    )
  }

  const TrendIcon = report.productivity.trend === 'up' ? TrendingUp :
                    report.productivity.trend === 'down' ? TrendingDown : Minus

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' })
  }

  const getGradeVariant = () => {
    switch (report.productivity.grade) {
      case 'Xuất sắc': return 'success'
      case 'Tốt': return 'info'
      case 'Khá': return 'warning'
      default: return 'urgent'
    }
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[20px] font-semibold text-[#1A1A1A]">
            Báo cáo tuần
          </h2>
          <p className="text-[14px] text-[#6B6B6B] mt-1">
            {formatDate(report.period.start)} - {formatDate(report.period.end)}
          </p>
        </div>
        <div className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full",
          report.productivity.grade === 'Xuất sắc' && "bg-[#F0FDF4] text-[#16A34A]",
          report.productivity.grade === 'Tốt' && "bg-[#EFF6FF] text-[#2563EB]",
          report.productivity.grade === 'Khá' && "bg-[#FFFBEB] text-[#D97706]",
          report.productivity.grade === 'Cần cải thiện' && "bg-[#FEF2F2] text-[#DC2626]"
        )}>
          <span className="text-[24px] font-semibold">{report.productivity.score}</span>
          <div className="text-left">
            <p className="text-[11px] uppercase tracking-wide opacity-70">Điểm</p>
            <p className="text-[13px] font-medium">{report.productivity.grade}</p>
          </div>
          <TrendIcon className={cn(
            "w-5 h-5 ml-2",
            report.productivity.trend === 'up' && "text-[#16A34A]",
            report.productivity.trend === 'down' && "text-[#DC2626]",
            report.productivity.trend === 'stable' && "text-[#9B9B9B]"
          )} strokeWidth={1.5} />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<Mail className="w-4 h-4" strokeWidth={1.5} />}
          label="Email nhận"
          value={report.stats.totalReceived}
          subtext={`${report.stats.processRate}% đã xử lý`}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" strokeWidth={1.5} />}
          label="Phản hồi TB"
          value={`${report.stats.avgResponseTime}h`}
          subtext="Thời gian trung bình"
        />
        <StatCard
          icon={<Inbox className="w-4 h-4" strokeWidth={1.5} />}
          label="Inbox Zero"
          value={`${report.stats.inboxZeroDays}/7`}
          subtext="ngày đạt được"
        />
        <StatCard
          icon={<Zap className="w-4 h-4" strokeWidth={1.5} />}
          label="Bận nhất"
          value={report.stats.busiestDay}
          subtext={`${report.stats.busiestHour}:00`}
        />
      </div>

      {/* Comparison */}
      <div className="bg-[#FAFAFA] rounded-xl p-5">
        <h3 className="text-[14px] font-medium text-[#1A1A1A] mb-4">
          So với tuần trước
        </h3>
        <div className="grid grid-cols-3 gap-6">
          {report.comparison.map((item, index) => (
            <div key={index}>
              <p className="text-[13px] text-[#6B6B6B] mb-1">{item.metric}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-[20px] font-semibold text-[#1A1A1A]">
                  {item.current}
                </span>
                <span className={cn(
                  "text-[13px] font-medium flex items-center",
                  item.change > 0 && "text-[#16A34A]",
                  item.change < 0 && "text-[#DC2626]",
                  item.change === 0 && "text-[#9B9B9B]"
                )}>
                  {item.change > 0 ? '+' : ''}{item.changePercent}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Senders */}
      <div>
        <h3 className="text-[14px] font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
          <Users className="w-4 h-4" strokeWidth={1.5} />
          Top người gửi
        </h3>
        <div className="space-y-2">
          {report.topSenders.slice(0, 5).map((sender, index) => (
            <div
              key={index}
              className="flex items-center gap-4 p-3 rounded-xl border border-[#EBEBEB] bg-white"
            >
              <div className="w-10 h-10 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[14px] font-medium text-[#6B6B6B]">
                {sender.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[#1A1A1A] truncate">
                  {sender.name}
                </p>
                <p className="text-[13px] text-[#6B6B6B]">
                  {sender.totalEmails} email · {sender.openRate}% mở
                </p>
              </div>
              {sender.suggestion !== 'none' && (
                <Badge
                  variant={sender.suggestion === 'vip' ? 'warning' : sender.suggestion === 'unsubscribe' ? 'urgent' : 'default'}
                  size="md"
                  className="flex items-center gap-1.5"
                >
                  {sender.suggestion === 'vip' && <Star className="w-3 h-3" strokeWidth={1.5} />}
                  {sender.suggestion === 'unsubscribe' && <UserX className="w-3 h-3" strokeWidth={1.5} />}
                  {sender.suggestion === 'mute' && <Bell className="w-3 h-3" strokeWidth={1.5} />}
                  {sender.suggestion === 'vip' ? 'Đánh dấu VIP' :
                   sender.suggestion === 'unsubscribe' ? 'Unsubscribe?' : 'Tắt thông báo'}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Suggestions */}
      {report.suggestions.length > 0 && (
        <div>
          <h3 className="text-[14px] font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" strokeWidth={1.5} />
            Gợi ý từ AI
          </h3>
          <div className="space-y-2">
            {report.suggestions.map((suggestion, index) => {
              const getVariant = () => {
                switch (suggestion.type) {
                  case 'unsubscribe': return 'red'
                  case 'vip': return 'amber'
                  case 'rule': return 'blue'
                  case 'habit': return 'emerald'
                  default: return 'default'
                }
              }
              return (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 rounded-xl border border-[#EBEBEB] bg-white hover:border-[#D4D4D4] transition-colors cursor-pointer"
                >
                  <IconBox variant={getVariant() as 'red' | 'amber' | 'blue' | 'emerald' | 'default'} size="md">
                    {suggestion.type === 'unsubscribe' && <UserX className="w-5 h-5" strokeWidth={1.5} />}
                    {suggestion.type === 'vip' && <Star className="w-5 h-5" strokeWidth={1.5} />}
                    {suggestion.type === 'rule' && <Zap className="w-5 h-5" strokeWidth={1.5} />}
                    {suggestion.type === 'habit' && <Clock className="w-5 h-5" strokeWidth={1.5} />}
                  </IconBox>
                  <div className="flex-1">
                    <p className="text-[14px] font-medium text-[#1A1A1A]">
                      {suggestion.title}
                    </p>
                    <p className="text-[13px] text-[#6B6B6B]">
                      {suggestion.description}
                    </p>
                  </div>
                  {suggestion.actionable && (
                    <ChevronRight className="w-5 h-5 text-[#D4D4D4]" strokeWidth={1.5} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Productivity Factors */}
      <div className="bg-[#FAFAFA] rounded-xl p-5">
        <h3 className="text-[14px] font-medium text-[#1A1A1A] mb-4">
          Phân tích điểm Productivity
        </h3>
        <div className="space-y-3">
          {report.productivity.factors.map((factor, index) => (
            <div key={index}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] text-[#6B6B6B]">{factor.name}</span>
                <span className="text-[13px] font-medium text-[#1A1A1A]">
                  {Math.round(factor.score)}/100
                </span>
              </div>
              <div className="h-2 bg-[#EBEBEB] rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    factor.score >= 70 ? "bg-[#16A34A]" :
                    factor.score >= 50 ? "bg-[#D97706]" : "bg-[#DC2626]"
                  )}
                  style={{ width: `${factor.score}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
