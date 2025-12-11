import { WeeklyReportView } from '@/components/insights/weekly-report'
import { BarChart3 } from 'lucide-react'

export default function InsightsPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto py-8 px-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold text-zinc-800">
              Email Insights
            </h1>
            <p className="text-[14px] text-zinc-500">
              Phân tích và báo cáo từ AI Thư Ký
            </p>
          </div>
        </div>

        {/* Weekly Report */}
        <div className="border border-zinc-200 rounded-xl bg-white overflow-hidden">
          <WeeklyReportView />
        </div>
      </div>
    </div>
  )
}
