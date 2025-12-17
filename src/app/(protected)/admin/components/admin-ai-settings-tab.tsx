'use client'

import { memo } from 'react'
import { Settings, UserCheck, AlertTriangle, Target, Globe, Check, RotateCcw, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AISettings {
  sender_reputation_threshold: number
  sender_reputation_enabled: boolean
  phishing_score_threshold: number
  phishing_auto_spam: boolean
  low_confidence_threshold: number
  domain_weight_open: number
  domain_weight_reply: number
  domain_weight_archive: number
  domain_weight_delete: number
  domain_weight_spam: number
  domain_weight_phishing: number
  is_default?: boolean
}

interface AdminAISettingsTabProps {
  settings: AISettings | null
  saving: boolean
  onSettingsChange: (settings: AISettings) => void
  onSave: () => void
  onReset: () => void
}

export const AdminAISettingsTab = memo(function AdminAISettingsTab({
  settings,
  saving,
  onSettingsChange,
  onSave,
  onReset,
}: AdminAISettingsTabProps) {
  if (!settings) {
    return (
      <div className="p-6 text-center text-[var(--muted)] py-8">
        <Settings className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p>Đang tải cài đặt...</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="space-y-8">
        {settings.is_default && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-[13px] text-blue-700 dark:text-blue-300">
            <AlertTriangle className="w-4 h-4" />
            Đang sử dụng cài đặt mặc định. Thay đổi sẽ được lưu vào tài khoản của bạn.
          </div>
        )}

        {/* Sender Reputation Settings */}
        <div>
          <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            Độ uy tín người gửi
          </h3>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-[13px] text-[var(--muted)]">Bật độ uy tín người gửi</span>
              <button
                onClick={() => onSettingsChange({...settings, sender_reputation_enabled: !settings.sender_reputation_enabled})}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors relative',
                  settings.sender_reputation_enabled ? 'bg-[var(--primary)]' : 'bg-[var(--secondary)]'
                )}
              >
                <div className={cn(
                  'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                  settings.sender_reputation_enabled ? 'left-7' : 'left-1'
                )} />
              </button>
            </label>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] text-[var(--muted)]">Ngưỡng độ uy tín</span>
                <span className="text-[13px] text-[var(--foreground)]">{settings.sender_reputation_threshold}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.sender_reputation_threshold}
                onChange={(e) => onSettingsChange({...settings, sender_reputation_threshold: parseFloat(e.target.value)})}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Phishing Detection Settings */}
        <div>
          <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Phát hiện lừa đảo
          </h3>
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-[13px] text-[var(--muted)]">Tự động đánh dấu spam</span>
              <button
                onClick={() => onSettingsChange({...settings, phishing_auto_spam: !settings.phishing_auto_spam})}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors relative',
                  settings.phishing_auto_spam ? 'bg-[var(--primary)]' : 'bg-[var(--secondary)]'
                )}
              >
                <div className={cn(
                  'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                  settings.phishing_auto_spam ? 'left-7' : 'left-1'
                )} />
              </button>
            </label>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] text-[var(--muted)]">Ngưỡng điểm lừa đảo</span>
                <span className="text-[13px] text-[var(--foreground)]">{settings.phishing_score_threshold}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.phishing_score_threshold}
                onChange={(e) => onSettingsChange({...settings, phishing_score_threshold: parseInt(e.target.value)})}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Confidence Settings */}
        <div>
          <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Độ tin cậy phân loại
          </h3>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] text-[var(--muted)]">Ngưỡng độ tin cậy thấp</span>
              <span className="text-[13px] text-[var(--foreground)]">{settings.low_confidence_threshold}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.low_confidence_threshold}
              onChange={(e) => onSettingsChange({...settings, low_confidence_threshold: parseFloat(e.target.value)})}
              className="w-full"
            />
          </div>
        </div>

        {/* Domain Weights */}
        <div>
          <h3 className="text-[14px] font-medium text-[var(--foreground)] mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Trọng số uy tín tên miền
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { key: 'domain_weight_open', label: 'Mở' },
              { key: 'domain_weight_reply', label: 'Trả lời' },
              { key: 'domain_weight_archive', label: 'Lưu trữ' },
              { key: 'domain_weight_delete', label: 'Xoá' },
              { key: 'domain_weight_spam', label: 'Spam' },
              { key: 'domain_weight_phishing', label: 'Lừa đảo' }
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-[12px] text-[var(--muted)] block mb-1">{label}</label>
                <input
                  type="number"
                  value={settings[key as keyof AISettings] as number}
                  onChange={(e) => onSettingsChange({...settings, [key]: parseInt(e.target.value)})}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-[14px] bg-[var(--background)] text-[var(--foreground)]"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg text-[14px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Lưu cài đặt
          </button>
          <button
            onClick={onReset}
            className="flex items-center gap-2 px-4 py-2 border border-[var(--border)] text-[var(--muted)] rounded-lg text-[14px] font-medium hover:bg-[var(--hover)] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Khôi phục mặc định
          </button>
        </div>
      </div>
    </div>
  )
})

export default AdminAISettingsTab
