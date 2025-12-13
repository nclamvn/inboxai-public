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
  classification: { en: 'Classification', vi: 'Phan loai' },
  summary: { en: 'AI Summary', vi: 'Tom tat AI' },
  smart_reply: { en: 'Smart Reply', vi: 'Goi y tra loi' },
  action_items: { en: 'Action Items', vi: 'Cong viec can lam' },
  follow_up: { en: 'Follow-up', vi: 'Theo doi' },
  sentiment: { en: 'Sentiment', vi: 'Cam xuc' },
  translate: { en: 'Translate', vi: 'Dich' },
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
  auto_default: { en: 'Auto (Default)', vi: 'Tu dong (Mac dinh)' },
  manual: { en: 'Manual', vi: 'Thu cong' },
  vip_sender: { en: 'VIP Sender', vi: 'Nguoi gui VIP' },
  content_trigger: { en: 'Content Match', vi: 'Noi dung khop' },
  priority_override: { en: 'High Priority', vi: 'Uu tien cao' },
  long_email: { en: 'Long Email', vi: 'Email dai' },
  has_attachment: { en: 'Has Attachment', vi: 'Co dinh kem' },
  has_money: { en: 'Money Detected', vi: 'Phat hien tien' },
  has_deadline: { en: 'Deadline Detected', vi: 'Phat hien deadline' },
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
    nameVi: 'Tom tat AI',
    description: 'Summarize email content',
    descriptionVi: 'Tom tat noi dung email',
    icon: 'FileText',
    estimatedCost: 0.002,
  },
  {
    key: 'smart_reply',
    name: 'Smart Reply',
    nameVi: 'Goi y tra loi',
    description: 'Generate reply suggestions',
    descriptionVi: 'Tao goi y cau tra loi',
    icon: 'MessageSquare',
    estimatedCost: 0.005,
  },
  {
    key: 'action_items',
    name: 'Action Items',
    nameVi: 'Cong viec can lam',
    description: 'Extract tasks and deadlines',
    descriptionVi: 'Trich xuat cong viec va deadline',
    icon: 'CheckSquare',
    estimatedCost: 0.002,
  },
  {
    key: 'follow_up',
    name: 'Follow-up',
    nameVi: 'Theo doi',
    description: 'Detect follow-up needs',
    descriptionVi: 'Phat hien can theo doi',
    icon: 'Bell',
    estimatedCost: 0.001,
  },
  {
    key: 'sentiment',
    name: 'Sentiment',
    nameVi: 'Cam xuc',
    description: 'Analyze email tone',
    descriptionVi: 'Phan tich tone email',
    icon: 'Heart',
    estimatedCost: 0.001,
  },
  {
    key: 'translate',
    name: 'Translate',
    nameVi: 'Dich thuat',
    description: 'Translate email content',
    descriptionVi: 'Dich noi dung email',
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
  { key: 'work', name: 'Work', nameVi: 'Cong viec', color: 'blue', icon: 'Briefcase' },
  { key: 'personal', name: 'Personal', nameVi: 'Ca nhan', color: 'green', icon: 'User' },
  { key: 'transaction', name: 'Transaction', nameVi: 'Giao dich', color: 'yellow', icon: 'CreditCard' },
  { key: 'newsletter', name: 'Newsletter', nameVi: 'Tin tuc', color: 'purple', icon: 'Newspaper' },
  { key: 'promotion', name: 'Promotion', nameVi: 'Khuyen mai', color: 'orange', icon: 'Tag' },
  { key: 'social', name: 'Social', nameVi: 'Mang xa hoi', color: 'pink', icon: 'Users' },
  { key: 'spam', name: 'Spam', nameVi: 'Spam', color: 'red', icon: 'AlertTriangle' },
];

// Trigger type display info with colors
export const TRIGGER_DISPLAY: Record<TriggerType, { label: string; labelVi: string; color: string }> = {
  auto_default: { label: 'Auto', labelVi: 'Tu dong', color: 'gray' },
  manual: { label: 'Manual', labelVi: 'Thu cong', color: 'blue' },
  vip_sender: { label: 'VIP Sender', labelVi: 'Sender VIP', color: 'gold' },
  content_trigger: { label: 'Content', labelVi: 'Noi dung', color: 'purple' },
  priority_override: { label: 'Priority', labelVi: 'Uu tien', color: 'red' },
  long_email: { label: 'Long Email', labelVi: 'Email dai', color: 'cyan' },
  has_attachment: { label: 'Attachment', labelVi: 'Dinh kem', color: 'orange' },
  has_money: { label: 'Money', labelVi: 'Tien', color: 'green' },
  has_deadline: { label: 'Deadline', labelVi: 'Deadline', color: 'red' },
};
