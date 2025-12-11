'use client'

import { useState } from 'react'
import { Sparkles, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

export function AISection() {
  const [classifying, setClassifying] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number; total: number } | null>(null)

  const handleClassifyAll = async () => {
    setClassifying(true)
    setResult(null)

    try {
      const res = await fetch('/api/ai/classify-all', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setResult({
          total: data.total,
          success: data.success,
          failed: data.failed
        })
      } else {
        setResult({ total: 0, success: 0, failed: 1 })
      }
    } catch (err) {
      console.error('Classification failed:', err)
      setResult({ total: 0, success: 0, failed: 1 })
    } finally {
      setClassifying(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-[#EBEBEB] p-6 mb-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-[#F5F5F5] rounded-lg flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-[#1A1A1A]" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-[18px] font-semibold text-[#1A1A1A]">AI Classification</h2>
          <p className="text-[14px] text-[#6B6B6B]">Phân tích và phân loại email bằng AI</p>
        </div>
      </div>

      <div className="bg-[#FAFAFA] rounded-lg p-4 mb-4">
        <p className="text-[14px] text-[#1A1A1A] mb-2">
          AI sẽ tự động phân tích email để:
        </p>
        <ul className="text-[14px] text-[#6B6B6B] space-y-1 ml-4 list-disc">
          <li>Xác định độ ưu tiên (1-5)</li>
          <li>Phân loại (công việc, cá nhân, khuyến mãi...)</li>
          <li>Tạo tóm tắt ngắn gọn</li>
          <li>Phát hiện deadline và việc cần làm</li>
        </ul>
      </div>

      {result && (
        <div className={`rounded-lg p-3 mb-4 flex items-center gap-2 ${result.failed > 0 ? 'bg-[#FFFBEB] text-[#D97706]' : 'bg-[#F0FDF4] text-[#16A34A]'}`}>
          {result.failed > 0 ? (
            <AlertCircle className="w-5 h-5" strokeWidth={1.5} />
          ) : (
            <CheckCircle className="w-5 h-5" strokeWidth={1.5} />
          )}
          <span className="text-[14px]">
            Đã phân tích {result.success}/{result.total} email
            {result.failed > 0 && ` (${result.failed} lỗi)`}
          </span>
        </div>
      )}

      <button
        onClick={handleClassifyAll}
        disabled={classifying}
        className="w-full bg-[#1A1A1A] text-white px-4 py-2.5 rounded-lg hover:bg-[#2D2D2D] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {classifying ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" strokeWidth={1.5} />
            Đang phân tích...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" strokeWidth={1.5} />
            Phân tích tất cả email
          </>
        )}
      </button>
    </section>
  )
}
