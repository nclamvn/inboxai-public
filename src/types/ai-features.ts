/**
 * AI Features Type Definitions
 */

export type AIFeatureKey =
  | 'classification'
  | 'summary'
  | 'smart_reply'
  | 'action_items'
  | 'follow_up'
  | 'sentiment'
  | 'translate';

export type EmailCategory =
  | 'work'
  | 'personal'
  | 'transaction'
  | 'newsletter'
  | 'promotion'
  | 'social'
  | 'spam';

export type TriggerType =
  | 'auto_default'
  | 'manual'
  | 'vip_sender'
  | 'content_trigger'
  | 'priority_override'
  | 'long_email'
  | 'has_attachment'
  | 'has_money'
  | 'has_deadline';

export interface AIFeatureConfig {
  featureKey: AIFeatureKey;
  featureName: string;
  featureNameVi: string;
  description: string;
  descriptionVi: string;
  estimatedCost: number;
  isAutoEnabled: boolean;
  isButtonVisible: boolean;
}

export interface AIFeatureUIState {
  featureKey: AIFeatureKey;
  status: 'idle' | 'loading' | 'success' | 'error';
  data: unknown;
  error?: string;
  isAutoTriggered: boolean;
  triggerReason?: TriggerType;
}

export interface AIFeaturesForEmail {
  emailId: string;
  category: EmailCategory;
  priority: number;
  features: AIFeatureUIState[];
  isVipSender: boolean;
  contentTriggers: string[];
}

// Feature display names
export const AI_FEATURE_NAMES: Record<AIFeatureKey, { en: string; vi: string }> = {
  classification: { en: 'Classification', vi: 'Phân loại' },
  summary: { en: 'AI Summary', vi: 'Tóm tắt AI' },
  smart_reply: { en: 'Smart Reply', vi: 'Gợi ý trả lời' },
  action_items: { en: 'Action Items', vi: 'Công việc cần làm' },
  follow_up: { en: 'Follow-up', vi: 'Theo dõi' },
  sentiment: { en: 'Sentiment', vi: 'Cảm xúc' },
  translate: { en: 'Translate', vi: 'Dịch' },
};

// Feature icons (for UI)
export const AI_FEATURE_ICONS: Record<AIFeatureKey, string> = {
  classification: 'tag',
  summary: 'file-text',
  smart_reply: 'message-square',
  action_items: 'check-square',
  follow_up: 'clock',
  sentiment: 'smile',
  translate: 'globe',
};

// Trigger type display names
export const TRIGGER_TYPE_NAMES: Record<TriggerType, { en: string; vi: string }> = {
  auto_default: { en: 'Auto (Default)', vi: 'Tự động (Mặc định)' },
  manual: { en: 'Manual', vi: 'Thủ công' },
  vip_sender: { en: 'VIP Sender', vi: 'Người gửi VIP' },
  content_trigger: { en: 'Content Match', vi: 'Nội dung khớp' },
  priority_override: { en: 'High Priority', vi: 'Ưu tiên cao' },
  long_email: { en: 'Long Email', vi: 'Email dài' },
  has_attachment: { en: 'Has Attachment', vi: 'Có đính kèm' },
  has_money: { en: 'Money Detected', vi: 'Phát hiện tiền' },
  has_deadline: { en: 'Deadline Detected', vi: 'Phát hiện deadline' },
};

// Feature info for API/UI
export interface AIFeatureInfo {
  key: AIFeatureKey;
  name: string;
  nameVi: string;
  description: string;
  descriptionVi: string;
  icon: string;
  estimatedCost: number;
}

export const AI_FEATURES_INFO: AIFeatureInfo[] = [
  {
    key: 'summary',
    name: 'AI Summary',
    nameVi: 'Tóm tắt AI',
    description: 'Summarize email content',
    descriptionVi: 'Tóm tắt nội dung email',
    icon: 'FileText',
    estimatedCost: 0.002,
  },
  {
    key: 'smart_reply',
    name: 'Smart Reply',
    nameVi: 'Gợi ý trả lời',
    description: 'Generate reply suggestions',
    descriptionVi: 'Tạo gợi ý câu trả lời',
    icon: 'MessageSquare',
    estimatedCost: 0.005,
  },
  {
    key: 'action_items',
    name: 'Action Items',
    nameVi: 'Công việc cần làm',
    description: 'Extract tasks and deadlines',
    descriptionVi: 'Trích xuất công việc và deadline',
    icon: 'CheckSquare',
    estimatedCost: 0.002,
  },
  {
    key: 'follow_up',
    name: 'Follow-up',
    nameVi: 'Theo dõi',
    description: 'Detect follow-up needs',
    descriptionVi: 'Phát hiện cần theo dõi',
    icon: 'Bell',
    estimatedCost: 0.001,
  },
  {
    key: 'sentiment',
    name: 'Sentiment',
    nameVi: 'Cảm xúc',
    description: 'Analyze email tone',
    descriptionVi: 'Phân tích tone email',
    icon: 'Heart',
    estimatedCost: 0.001,
  },
  {
    key: 'translate',
    name: 'Translate',
    nameVi: 'Dịch thuật',
    description: 'Translate email content',
    descriptionVi: 'Dịch nội dung email',
    icon: 'Languages',
    estimatedCost: 0.003,
  },
];

// Category info for UI
export interface CategoryInfo {
  key: EmailCategory;
  name: string;
  nameVi: string;
  color: string;
  icon: string;
}

export const CATEGORIES_INFO: CategoryInfo[] = [
  { key: 'work', name: 'Work', nameVi: 'Công việc', color: 'blue', icon: 'Briefcase' },
  { key: 'personal', name: 'Personal', nameVi: 'Cá nhân', color: 'green', icon: 'User' },
  { key: 'transaction', name: 'Transaction', nameVi: 'Giao dịch', color: 'yellow', icon: 'CreditCard' },
  { key: 'newsletter', name: 'Newsletter', nameVi: 'Bản tin', color: 'purple', icon: 'Newspaper' },
  { key: 'promotion', name: 'Promotion', nameVi: 'Khuyến mãi', color: 'orange', icon: 'Tag' },
  { key: 'social', name: 'Social', nameVi: 'Mạng xã hội', color: 'pink', icon: 'Users' },
  { key: 'spam', name: 'Spam', nameVi: 'Spam', color: 'red', icon: 'AlertTriangle' },
];

// Trigger type display info with colors
export const TRIGGER_DISPLAY: Record<TriggerType, { label: string; labelVi: string; color: string }> = {
  auto_default: { label: 'Auto', labelVi: 'Tự động', color: 'gray' },
  manual: { label: 'Manual', labelVi: 'Thủ công', color: 'blue' },
  vip_sender: { label: 'VIP Sender', labelVi: 'Sender VIP', color: 'gold' },
  content_trigger: { label: 'Content', labelVi: 'Nội dung', color: 'purple' },
  priority_override: { label: 'Priority', labelVi: 'Ưu tiên', color: 'red' },
  long_email: { label: 'Long Email', labelVi: 'Email dài', color: 'cyan' },
  has_attachment: { label: 'Attachment', labelVi: 'Đính kèm', color: 'orange' },
  has_money: { label: 'Money', labelVi: 'Tiền', color: 'green' },
  has_deadline: { label: 'Deadline', labelVi: 'Deadline', color: 'red' },
};
