'use client'

import { useState, useEffect } from 'react'
import {
  Sparkles,
  Zap,
  FileText,
  Search,
  ChevronDown,
  Copy,
  Check,
  RefreshCw,
  Send,
  Loader2,
  MessageSquare,
  Clock,
  AlertCircle,
  X
} from 'lucide-react'
import type { Email } from '@/types'
import type { EmailAnalysis } from '@/lib/ai/email-analyzer'
import type { GeneratedDraft } from '@/lib/ai/draft-generator'
import type { ResearchResult } from '@/lib/ai/research-service'

interface ReplyAssistantProps {
  email: Email
  onUseDraft: (subject: string, body: string) => void
  onClose?: () => void
}

type TabType = 'quick' | 'draft' | 'research'

export function ReplyAssistant({ email, onUseDraft, onClose }: ReplyAssistantProps) {
  const [activeTab, setActiveTab] = useState<TabType>('quick')
  const [analysis, setAnalysis] = useState<EmailAnalysis | null>(null)
  const [draft, setDraft] = useState<GeneratedDraft | null>(null)
  const [research, setResearch] = useState<ResearchResult | null>(null)
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Draft options
  const [draftOptions, setDraftOptions] = useState({
    tone: 'neutral' as 'formal' | 'friendly' | 'neutral',
    length: 'medium' as 'short' | 'medium' | 'long',
    includeGreeting: true,
    includeSignature: true,
    customInstructions: ''
  })

  useEffect(() => {
    analyzeEmail()
  }, [email.id])

  const analyzeEmail = async () => {
    setLoading(prev => ({ ...prev, analyze: true }))
    setError(null)

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id })
      })

      if (!res.ok) throw new Error('Failed to analyze')

      const data = await res.json()
      setAnalysis(data)
    } catch (err) {
      setError('Không thể phân tích email')
    } finally {
      setLoading(prev => ({ ...prev, analyze: false }))
    }
  }

  const generateDraft = async () => {
    if (!analysis) return

    setLoading(prev => ({ ...prev, draft: true }))
    setError(null)

    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailId: email.id,
          analysis,
          options: draftOptions,
          relatedEmails: research?.relatedEmails
        })
      })

      if (!res.ok) throw new Error('Failed to generate draft')

      const data = await res.json()
      setDraft(data)
    } catch (err) {
      setError('Không thể tạo bản nháp')
    } finally {
      setLoading(prev => ({ ...prev, draft: false }))
    }
  }

  const fetchResearch = async () => {
    setLoading(prev => ({ ...prev, research: true }))
    setError(null)

    try {
      const res = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: email.id })
      })

      if (!res.ok) throw new Error('Failed to research')

      const data = await res.json()
      setResearch(data)
    } catch (err) {
      setError('Không thể tìm thông tin liên quan')
    } finally {
      setLoading(prev => ({ ...prev, research: false }))
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleQuickReply = (content: string) => {
    onUseDraft(`Re: ${email.subject}`, content)
  }

  const intentLabels: Record<string, string> = {
    question: 'Câu hỏi',
    request: 'Yêu cầu',
    information: 'Thông tin',
    complaint: 'Khiếu nại',
    followup: 'Theo dõi',
    introduction: 'Giới thiệu',
    other: 'Khác'
  }

  const urgencyLabels: Record<string, { label: string; color: string }> = {
    high: { label: 'Khẩn cấp', color: 'bg-[#FEF2F2] text-[#DC2626]' },
    medium: { label: 'Trung bình', color: 'bg-[#FFFBEB] text-[#D97706]' },
    low: { label: 'Thấp', color: 'bg-[#F5F5F5] text-[#6B6B6B]' }
  }

  return (
    <div className="bg-white border border-[#EBEBEB] rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#EBEBEB] bg-[#FAFAFA]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#1A1A1A] rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="font-semibold text-[#1A1A1A]">Trợ lý phản hồi AI</h3>
            <p className="text-[12px] text-[#6B6B6B]">Phân tích và gợi ý phản hồi thông minh</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F5F5F5] rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#EBEBEB]">
        {[
          { id: 'quick' as const, label: 'Trả lời nhanh', icon: Zap },
          { id: 'draft' as const, label: 'Soạn thảo', icon: FileText },
          { id: 'research' as const, label: 'Nghiên cứu', icon: Search }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id === 'research' && !research) {
                fetchResearch()
              }
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-[14px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[#1A1A1A] border-b-2 border-[#1A1A1A]'
                : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
            }`}
          >
            <tab.icon className="w-4 h-4" strokeWidth={1.5} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className="flex items-center gap-2 p-3 bg-[#FEF2F2] border border-[#FEE2E2] rounded-lg text-[#DC2626] text-[14px] mb-4">
            <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
            {error}
          </div>
        )}

        {/* Analysis Summary (shown in all tabs) */}
        {loading.analyze ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#6B6B6B]" strokeWidth={1.5} />
          </div>
        ) : analysis && (
          <div className="mb-4 p-3 bg-[#FAFAFA] rounded-lg border border-[#EBEBEB]">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="px-2 py-1 bg-[#F5F5F5] rounded text-[12px] text-[#1A1A1A]">
                {intentLabels[analysis.intent] || analysis.intent}
              </span>
              <span className={`px-2 py-1 rounded text-[12px] ${urgencyLabels[analysis.urgency]?.color || 'bg-[#F5F5F5] text-[#6B6B6B]'}`}>
                {urgencyLabels[analysis.urgency]?.label || analysis.urgency}
              </span>
            </div>
            <p className="text-[13px] text-[#6B6B6B]">
              <strong>Điểm chính:</strong> {analysis.keyPoints.join(', ')}
            </p>
          </div>
        )}

        {/* Quick Reply Tab */}
        {activeTab === 'quick' && analysis && (
          <div className="space-y-3">
            <h4 className="text-[14px] font-medium text-[#1A1A1A]">Phản hồi gợi ý</h4>
            {analysis.quickReplies.map((reply, index) => (
              <button
                key={index}
                onClick={() => handleQuickReply(reply.content)}
                className="w-full p-3 text-left bg-white border border-[#EBEBEB] rounded-lg hover:border-[#1A1A1A] hover:shadow-sm transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[14px] font-medium text-[#1A1A1A]">{reply.label}</span>
                  <span className="text-[12px] text-[#9B9B9B] capitalize">{reply.tone}</span>
                </div>
                <p className="text-[13px] text-[#6B6B6B] line-clamp-2">{reply.content}</p>
                <div className="flex items-center gap-1 mt-2 text-[12px] text-[#1A1A1A] opacity-0 group-hover:opacity-100 transition-opacity">
                  <Send className="w-3 h-3" strokeWidth={1.5} />
                  Sử dụng
                </div>
              </button>
            ))}

            {analysis.suggestedActions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#EBEBEB]">
                <h4 className="text-[14px] font-medium text-[#1A1A1A] mb-2">Hành động gợi ý</h4>
                <ul className="space-y-1">
                  {analysis.suggestedActions.map((action, index) => (
                    <li key={index} className="flex items-center gap-2 text-[13px] text-[#6B6B6B]">
                      <Check className="w-3 h-3 text-[#16A34A]" strokeWidth={2} />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Draft Tab */}
        {activeTab === 'draft' && (
          <div className="space-y-4">
            {/* Options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B6B] mb-1">
                  Giọng điệu
                </label>
                <select
                  value={draftOptions.tone}
                  onChange={(e) => setDraftOptions(prev => ({ ...prev, tone: e.target.value as 'formal' | 'friendly' | 'neutral' }))}
                  className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
                >
                  <option value="formal">Trang trọng</option>
                  <option value="friendly">Thân thiện</option>
                  <option value="neutral">Trung tính</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#6B6B6B] mb-1">
                  Độ dài
                </label>
                <select
                  value={draftOptions.length}
                  onChange={(e) => setDraftOptions(prev => ({ ...prev, length: e.target.value as 'short' | 'medium' | 'long' }))}
                  className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
                >
                  <option value="short">Ngắn</option>
                  <option value="medium">Trung bình</option>
                  <option value="long">Dài</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[13px] text-[#6B6B6B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftOptions.includeGreeting}
                  onChange={(e) => setDraftOptions(prev => ({ ...prev, includeGreeting: e.target.checked }))}
                  className="w-4 h-4 rounded border-[#EBEBEB] text-[#1A1A1A] focus:ring-[#1A1A1A]"
                />
                Lời chào
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[#6B6B6B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftOptions.includeSignature}
                  onChange={(e) => setDraftOptions(prev => ({ ...prev, includeSignature: e.target.checked }))}
                  className="w-4 h-4 rounded border-[#EBEBEB] text-[#1A1A1A] focus:ring-[#1A1A1A]"
                />
                Chữ ký
              </label>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#6B6B6B] mb-1">
                Yêu cầu thêm (tùy chọn)
              </label>
              <input
                type="text"
                value={draftOptions.customInstructions}
                onChange={(e) => setDraftOptions(prev => ({ ...prev, customInstructions: e.target.value }))}
                placeholder="VD: Nhấn mạnh deadline, đề cập đến cuộc họp..."
                className="w-full px-3 py-2 border border-[#EBEBEB] rounded-lg text-[14px] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent"
              />
            </div>

            <button
              onClick={generateDraft}
              disabled={loading.draft || !analysis}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1A1A1A] text-white rounded-lg font-medium hover:bg-[#2D2D2D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading.draft ? (
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                  Tạo bản nháp
                </>
              )}
            </button>

            {/* Generated Draft */}
            {draft && (
              <div className="mt-4 p-4 bg-[#FAFAFA] rounded-lg border border-[#EBEBEB]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[14px] font-medium text-[#1A1A1A]">{draft.subject}</h4>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopy(draft.body)}
                      className="p-1.5 hover:bg-[#F5F5F5] rounded transition-colors"
                      title="Sao chép"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-[#16A34A]" strokeWidth={1.5} />
                      ) : (
                        <Copy className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />
                      )}
                    </button>
                    <button
                      onClick={generateDraft}
                      className="p-1.5 hover:bg-[#F5F5F5] rounded transition-colors"
                      title="Tạo lại"
                    >
                      <RefreshCw className="w-4 h-4 text-[#6B6B6B]" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                <pre className="text-[13px] text-[#1A1A1A] whitespace-pre-wrap font-sans mb-3">
                  {draft.body}
                </pre>
                <button
                  onClick={() => onUseDraft(draft.subject, draft.body)}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-[#1A1A1A] text-white rounded-lg text-[14px] font-medium hover:bg-[#2D2D2D] transition-colors"
                >
                  <Send className="w-4 h-4" strokeWidth={1.5} />
                  Sử dụng bản nháp này
                </button>

                {/* Alternative versions */}
                {draft.alternativeVersions && draft.alternativeVersions.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#EBEBEB]">
                    <h5 className="text-[13px] font-medium text-[#6B6B6B] mb-2">Phiên bản khác</h5>
                    {draft.alternativeVersions.map((alt, index) => (
                      <div key={index} className="p-3 bg-white rounded-lg border border-[#EBEBEB] mb-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] text-[#9B9B9B] capitalize">{alt.tone}</span>
                          <button
                            onClick={() => onUseDraft(draft.subject, alt.body)}
                            className="text-[12px] text-[#1A1A1A] font-medium hover:underline"
                          >
                            Sử dụng
                          </button>
                        </div>
                        <p className="text-[13px] text-[#6B6B6B] line-clamp-3">{alt.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Research Tab */}
        {activeTab === 'research' && (
          <div className="space-y-4">
            {loading.research ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-[#6B6B6B]" strokeWidth={1.5} />
              </div>
            ) : research ? (
              <>
                {/* Sender History */}
                <div className="p-4 bg-[#FAFAFA] rounded-lg border border-[#EBEBEB]">
                  <h4 className="text-[14px] font-medium text-[#1A1A1A] mb-3">Lịch sử với người gửi</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[12px] text-[#9B9B9B]">Tổng email</p>
                      <p className="text-[16px] font-semibold text-[#1A1A1A]">{research.senderHistory.totalEmails}</p>
                    </div>
                    <div>
                      <p className="text-[12px] text-[#9B9B9B]">Liên hệ gần nhất</p>
                      <p className="text-[14px] text-[#1A1A1A]">
                        {research.senderHistory.lastContact
                          ? new Date(research.senderHistory.lastContact).toLocaleDateString('vi-VN')
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  {research.senderHistory.commonTopics.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[12px] text-[#9B9B9B] mb-1">Chủ đề thường gặp</p>
                      <div className="flex flex-wrap gap-1">
                        {research.senderHistory.commonTopics.map((topic, index) => (
                          <span key={index} className="px-2 py-0.5 bg-[#F5F5F5] rounded text-[12px] text-[#6B6B6B]">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Thread Context */}
                {research.threadContext.length > 0 && (
                  <div>
                    <h4 className="text-[14px] font-medium text-[#1A1A1A] mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
                      Chuỗi email ({research.threadContext.length})
                    </h4>
                    <div className="space-y-2">
                      {research.threadContext.map(threadEmail => (
                        <div key={threadEmail.id} className="p-3 bg-[#FAFAFA] rounded-lg border border-[#EBEBEB]">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[13px] font-medium text-[#1A1A1A] truncate">
                              {threadEmail.from_name || threadEmail.from_address}
                            </span>
                            <span className="text-[12px] text-[#9B9B9B]">
                              {threadEmail.received_at ? new Date(threadEmail.received_at).toLocaleDateString('vi-VN') : ''}
                            </span>
                          </div>
                          <p className="text-[12px] text-[#6B6B6B] line-clamp-2">{threadEmail.snippet}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related Emails */}
                {research.relatedEmails.length > 0 && (
                  <div>
                    <h4 className="text-[14px] font-medium text-[#1A1A1A] mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" strokeWidth={1.5} />
                      Email liên quan ({research.relatedEmails.length})
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-auto">
                      {research.relatedEmails.map(relatedEmail => (
                        <div key={relatedEmail.id} className="p-3 bg-[#FAFAFA] rounded-lg border border-[#EBEBEB]">
                          <p className="text-[13px] font-medium text-[#1A1A1A] truncate mb-1">
                            {relatedEmail.subject || '(Không có tiêu đề)'}
                          </p>
                          <p className="text-[12px] text-[#9B9B9B]">
                            {relatedEmail.from_name || relatedEmail.from_address} • {relatedEmail.received_at ? new Date(relatedEmail.received_at).toLocaleDateString('vi-VN') : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {research.relatedEmails.length === 0 && research.threadContext.length === 0 && (
                  <div className="text-center py-8 text-[#6B6B6B]">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" strokeWidth={1.5} />
                    <p className="text-[14px]">Không tìm thấy email liên quan</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <button
                  onClick={fetchResearch}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#F5F5F5] rounded-lg text-[14px] text-[#1A1A1A] font-medium hover:bg-[#EBEBEB] transition-colors"
                >
                  <Search className="w-4 h-4" strokeWidth={1.5} />
                  Tìm kiếm thông tin
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
