'use client'

import { memo, useState, useCallback } from 'react'
import { BarChart3, Zap, TrendingUp, Target, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AIMetrics {
  totalClassifications: number
  averageConfidence: number
  accuracyRate: number
  feedbackCount: number
  positiveRate: number
  bySource: Record<string, number>
  accuracyByCategory: Record<string, { total: number; accurate: number; accuracy: number }>
}

interface AdminAIMetricsTabProps {
  metrics: AIMetrics | null
  metricsDays: number
  onDaysChange: (days: number) => void
}

export const AdminAIMetricsTab = memo(function AdminAIMetricsTab({
  metrics,
  metricsDays,
  onDaysChange,
}: AdminAIMetricsTabProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategory(prev => prev === category ? null : category)
  }, [])

  return (
    <div className="p-6">
      {/* Time Range Selector */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-[13px] text-[var(--muted)]">Khoảng thời gian:</span>
        {[7, 14, 30].map(days => (
          <button
            key={days}
            onClick={() => onDaysChange(days)}
            className={cn(
              'px-3 py-1 text-[13px] rounded-lg transition-colors',
              metricsDays === days
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                : 'bg-[var(--secondary)] text-[var(--muted)] hover:bg-[var(--hover)]'
            )}
          >
            {days} ngày
          </button>
        ))}
      </div>

      {metrics ? (
        <div className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[var(--background)] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
                <Zap className="w-4 h-4" />
                <span className="text-[12px]">Tổng phân loại</span>
              </div>
              <p className="text-2xl font-semibold text-[var(--foreground)]">
                {metrics.totalClassifications}
              </p>
            </div>
            <div className="bg-[var(--background)] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-[12px]">Độ tin cậy TB</span>
              </div>
              <p className="text-2xl font-semibold text-[var(--foreground)]">
                {metrics.averageConfidence ? `${(metrics.averageConfidence * 100).toFixed(1)}%` : '-'}
              </p>
            </div>
            <div className="bg-[var(--background)] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
                <Target className="w-4 h-4" />
                <span className="text-[12px]">Độ chính xác</span>
              </div>
              <p className="text-2xl font-semibold text-[var(--foreground)]">
                {metrics.accuracyRate ? `${(metrics.accuracyRate * 100).toFixed(1)}%` : '-'}
              </p>
            </div>
            <div className="bg-[var(--background)] rounded-lg p-4">
              <div className="flex items-center gap-2 text-[var(--muted)] mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[12px]">Phản hồi tốt</span>
              </div>
              <p className="text-2xl font-semibold text-[var(--foreground)]">
                {metrics.positiveRate ? `${(metrics.positiveRate * 100).toFixed(0)}%` : '-'}
              </p>
            </div>
          </div>

          {/* Classification Sources */}
          {metrics.bySource && Object.keys(metrics.bySource).length > 0 && (
            <div>
              <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-3">
                Nguồn phân loại
              </h3>
              <div className="space-y-2">
                {Object.entries(metrics.bySource).map(([source, count]) => (
                  <div key={source} className="flex items-center gap-3">
                    <span className="text-[13px] text-[var(--muted)] w-24">{source}</span>
                    <div className="flex-1 h-6 bg-[var(--background)] rounded overflow-hidden">
                      <div
                        className="h-full bg-[var(--primary)] rounded"
                        style={{
                          width: `${(count / metrics.totalClassifications) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-[13px] text-[var(--foreground)] w-12 text-right">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Accuracy by Category */}
          {metrics.accuracyByCategory && Object.keys(metrics.accuracyByCategory).length > 0 && (
            <div>
              <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-3">
                Độ chính xác theo danh mục
              </h3>
              <div className="space-y-2">
                {Object.entries(metrics.accuracyByCategory).map(([category, data]) => (
                  <div
                    key={category}
                    className="bg-[var(--background)] rounded-lg p-3 cursor-pointer hover:bg-[var(--hover)] transition-colors"
                    onClick={() => toggleCategory(category)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {expandedCategory === category ? (
                          <ChevronUp className="w-4 h-4 text-[var(--muted)]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[var(--muted)]" />
                        )}
                        <span className="text-[13px] font-medium text-[var(--foreground)] capitalize">
                          {category}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[12px] text-[var(--muted)]">
                          {data.accurate}/{data.total}
                        </span>
                        <span className={cn(
                          'text-[13px] font-medium',
                          data.accuracy >= 0.8 ? 'text-green-600 dark:text-green-400' :
                          data.accuracy >= 0.6 ? 'text-orange-600 dark:text-orange-400' :
                          'text-red-600 dark:text-red-400'
                        )}>
                          {(data.accuracy * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    {expandedCategory === category && (
                      <div className="mt-3 pt-3 border-t border-[var(--border)]">
                        <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          <span>Chính xác: {data.accurate}</span>
                          <XCircle className="w-3 h-3 text-red-500 ml-4" />
                          <span>Không chính xác: {data.total - data.accurate}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-[var(--muted)] py-8">
          <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>Không có dữ liệu thống kê</p>
        </div>
      )}
    </div>
  )
})

export default AdminAIMetricsTab
