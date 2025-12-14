/**
 * AI Feature Allocation Service
 * Determines which AI features to enable for each email
 * Optimizes cost while maintaining UX quality
 */

import { createClient } from '@/lib/supabase/server';

// ===========================================
// TYPES
// ===========================================

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
  | 'spam'
  | 'uncategorized';

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

export interface FeatureAllocation {
  featureKey: AIFeatureKey;
  isAutoEnabled: boolean;
  isButtonVisible: boolean;
  triggerReason: TriggerType | null;
  estimatedCost: number;
}

export interface EmailContext {
  userId: string;
  emailId: string;
  category: EmailCategory;
  priority: number;
  senderEmail: string;
  senderDomain: string;
  subject: string;
  bodyText: string;
  wordCount: number;
  hasAttachment: boolean;
  detectedMoney: boolean;
  detectedDeadline: boolean;
  isRead: boolean;
}

export interface AllocationResult {
  emailId: string;
  category: EmailCategory;
  priority: number;
  features: FeatureAllocation[];
  autoEnabledFeatures: AIFeatureKey[];
  availableButtons: AIFeatureKey[];
  estimatedTotalCost: number;
  isVipSender: boolean;
  contentTriggers: string[];
}

// ===========================================
// FEATURE COST ESTIMATES (USD)
// ===========================================

export const FEATURE_COSTS: Record<AIFeatureKey, number> = {
  classification: 0.001,
  summary: 0.002,
  smart_reply: 0.005,
  action_items: 0.002,
  follow_up: 0.001,
  sentiment: 0.001,
  translate: 0.003,
};

// ===========================================
// DEFAULT ALLOCATIONS (Fallback if DB unavailable)
// ===========================================

const DEFAULT_ALLOCATIONS: Record<EmailCategory, Record<AIFeatureKey, { auto: boolean; button: boolean }>> = {
  work: {
    classification: { auto: true, button: false },
    summary: { auto: true, button: true },
    smart_reply: { auto: true, button: true },
    action_items: { auto: true, button: true },
    follow_up: { auto: true, button: true },
    sentiment: { auto: false, button: true },
    translate: { auto: false, button: true },
  },
  personal: {
    classification: { auto: true, button: false },
    summary: { auto: false, button: true },
    smart_reply: { auto: false, button: true },
    action_items: { auto: false, button: false },
    follow_up: { auto: false, button: true },
    sentiment: { auto: false, button: true },
    translate: { auto: false, button: true },
  },
  transaction: {
    classification: { auto: true, button: false },
    summary: { auto: true, button: true },
    smart_reply: { auto: false, button: false },
    action_items: { auto: true, button: true },
    follow_up: { auto: false, button: false },
    sentiment: { auto: false, button: false },
    translate: { auto: false, button: true },
  },
  newsletter: {
    classification: { auto: true, button: false },
    summary: { auto: true, button: true },
    smart_reply: { auto: false, button: false },
    action_items: { auto: false, button: false },
    follow_up: { auto: false, button: false },
    sentiment: { auto: false, button: false },
    translate: { auto: false, button: true },
  },
  promotion: {
    classification: { auto: true, button: false },
    summary: { auto: false, button: true },
    smart_reply: { auto: false, button: false },
    action_items: { auto: false, button: false },
    follow_up: { auto: false, button: false },
    sentiment: { auto: false, button: false },
    translate: { auto: false, button: true },
  },
  social: {
    classification: { auto: true, button: false },
    summary: { auto: false, button: true },
    smart_reply: { auto: false, button: false },
    action_items: { auto: false, button: false },
    follow_up: { auto: false, button: false },
    sentiment: { auto: false, button: false },
    translate: { auto: false, button: true },
  },
  spam: {
    classification: { auto: true, button: false },
    summary: { auto: false, button: false },
    smart_reply: { auto: false, button: false },
    action_items: { auto: false, button: false },
    follow_up: { auto: false, button: false },
    sentiment: { auto: false, button: false },
    translate: { auto: false, button: false },
  },
  uncategorized: {
    classification: { auto: true, button: false },
    summary: { auto: false, button: true },
    smart_reply: { auto: false, button: true },
    action_items: { auto: false, button: true },
    follow_up: { auto: false, button: true },
    sentiment: { auto: false, button: true },
    translate: { auto: false, button: true },
  },
};

// ===========================================
// CONTENT TRIGGERS (Keywords)
// ===========================================

interface ContentTrigger {
  name: string;
  type: 'keyword' | 'regex';
  patterns: string[];
  enableFeatures: AIFeatureKey[];
  priorityBoost: number;
}

const CONTENT_TRIGGERS: ContentTrigger[] = [
  {
    name: 'deadline',
    type: 'keyword',
    patterns: ['deadline', 'han chot', 'truoc ngay', 'due date', 'het han', 'den han', 'before', 'by friday', 'by monday', 'cuoi tuan', 'end of day', 'eod', 'asap'],
    enableFeatures: ['action_items', 'follow_up'],
    priorityBoost: 1,
  },
  {
    name: 'urgent',
    type: 'keyword',
    patterns: ['gap', 'khan', 'urgent', 'asap', 'ngay lap tuc', 'khan cap', 'immediately', 'right away', 'can gap', 'rat gap'],
    enableFeatures: ['summary', 'action_items', 'smart_reply'],
    priorityBoost: 2,
  },
  {
    name: 'meeting',
    type: 'keyword',
    patterns: ['hop', 'meeting', 'call', 'zoom', 'google meet', 'teams', 'cuoc hop', 'lich hop', 'schedule', 'calendar invite'],
    enableFeatures: ['action_items', 'follow_up'],
    priorityBoost: 1,
  },
  {
    name: 'question',
    type: 'keyword',
    patterns: ['?', 'khong biet', 'co the', 'xin hoi', 'cho hoi', 'could you', 'can you', 'would you', 'please advise', 'let me know'],
    enableFeatures: ['smart_reply'],
    priorityBoost: 0,
  },
  {
    name: 'contract',
    type: 'keyword',
    patterns: ['hop dong', 'contract', 'agreement', 'ky ket', 'signing', 'nda', 'mou', 'thoa thuan'],
    enableFeatures: ['summary', 'action_items'],
    priorityBoost: 1,
  },
  {
    name: 'invoice',
    type: 'keyword',
    patterns: ['hoa don', 'invoice', 'thanh toan', 'payment', 'billing', 'receipt', 'bien lai'],
    enableFeatures: ['action_items'],
    priorityBoost: 0,
  },
  {
    name: 'report',
    type: 'keyword',
    patterns: ['bao cao', 'report', 'review', 'danh gia', 'summary', 'tong ket', 'ket qua'],
    enableFeatures: ['summary'],
    priorityBoost: 0,
  },
];

// ===========================================
// MAIN SERVICE CLASS
// ===========================================

export class AIFeatureAllocationService {
  constructor() {
    // Stateless - each method creates its own client
  }

  private async getSupabase() {
    return await createClient();
  }

  /**
   * Main method: Get feature allocation for an email
   */
  async getAllocation(context: EmailContext): Promise<AllocationResult> {
    const {
      userId,
      emailId,
      category,
      priority,
      senderEmail,
      senderDomain,
      subject,
      bodyText,
      wordCount,
      hasAttachment,
      detectedMoney,
      detectedDeadline,
    } = context;

    // Check VIP sender
    const isVipSender = await this.checkVipSender(userId, senderEmail, senderDomain);

    // Detect content triggers
    const contentTriggers = this.detectContentTriggers(subject, bodyText);

    // Calculate effective priority (with boosts)
    const priorityBoost = contentTriggers.reduce((sum, t) => sum + t.priorityBoost, 0);
    const effectivePriority = Math.min(5, priority + priorityBoost + (isVipSender ? 1 : 0));

    // Get base allocations from DB or defaults
    const baseAllocations = await this.getBaseAllocations(userId, category);

    // Build final allocations with overrides
    const features = this.buildFeatureAllocations(
      baseAllocations,
      {
        category,
        priority: effectivePriority,
        isVipSender,
        wordCount,
        hasAttachment,
        detectedMoney,
        detectedDeadline,
        contentTriggers,
      }
    );

    // Calculate costs
    const autoEnabledFeatures = features
      .filter(f => f.isAutoEnabled)
      .map(f => f.featureKey);

    const availableButtons = features
      .filter(f => f.isButtonVisible && !f.isAutoEnabled)
      .map(f => f.featureKey);

    const estimatedTotalCost = features
      .filter(f => f.isAutoEnabled)
      .reduce((sum, f) => sum + f.estimatedCost, 0);

    return {
      emailId,
      category,
      priority: effectivePriority,
      features,
      autoEnabledFeatures,
      availableButtons,
      estimatedTotalCost,
      isVipSender,
      contentTriggers: contentTriggers.map(t => t.name),
    };
  }

  /**
   * Check if sender is VIP
   */
  private async checkVipSender(
    userId: string,
    senderEmail: string,
    senderDomain: string
  ): Promise<boolean> {
    try {
      const supabase = await this.getSupabase();

      const { data } = await supabase
        .from('ai_vip_senders')
        .select('id')
        .eq('user_id', userId)
        .or(`sender_email.eq.${senderEmail},sender_domain.eq.${senderDomain}`)
        .limit(1)
        .single();

      return !!data;
    } catch {
      return false;
    }
  }

  /**
   * Detect content triggers in email
   */
  private detectContentTriggers(subject: string, body: string): ContentTrigger[] {
    const text = `${subject} ${body}`.toLowerCase();
    const triggered: ContentTrigger[] = [];

    for (const trigger of CONTENT_TRIGGERS) {
      const hasMatch = trigger.patterns.some(pattern =>
        text.includes(pattern.toLowerCase())
      );

      if (hasMatch) {
        triggered.push(trigger);
      }
    }

    return triggered;
  }

  /**
   * Get base allocations from database
   */
  private async getBaseAllocations(
    userId: string,
    category: EmailCategory
  ): Promise<Map<AIFeatureKey, { auto: boolean; button: boolean; minPriority: number }>> {
    const allocations = new Map<AIFeatureKey, { auto: boolean; button: boolean; minPriority: number }>();

    try {
      const supabase = await this.getSupabase();

      // Get defaults for category
      const { data: defaults } = await supabase
        .from('ai_feature_defaults')
        .select('feature_key, auto_enabled, button_visible, min_priority_for_auto')
        .eq('category', category);

      // Get user overrides
      const { data: overrides } = await supabase
        .from('ai_feature_user_config')
        .select('feature_key, auto_enabled, button_visible')
        .eq('user_id', userId)
        .or(`category.eq.${category},category.is.null`);

      // Build map with defaults from DB
      if (defaults && defaults.length > 0) {
        for (const d of defaults) {
          allocations.set(d.feature_key as AIFeatureKey, {
            auto: d.auto_enabled ?? false,
            button: d.button_visible ?? true,
            minPriority: d.min_priority_for_auto ?? 5,
          });
        }
      } else {
        // No DB defaults found, use hardcoded defaults
        const categoryDefaults = DEFAULT_ALLOCATIONS[category] || DEFAULT_ALLOCATIONS.personal;
        for (const [key, value] of Object.entries(categoryDefaults)) {
          allocations.set(key as AIFeatureKey, {
            auto: value.auto,
            button: value.button,
            minPriority: 5,
          });
        }
      }

      // Apply user overrides
      if (overrides && overrides.length > 0) {
        for (const o of overrides) {
          const existing = allocations.get(o.feature_key as AIFeatureKey);
          if (existing) {
            if (o.auto_enabled !== null) existing.auto = o.auto_enabled;
            if (o.button_visible !== null) existing.button = o.button_visible;
          }
        }
      }

    } catch (error) {
      console.error('Error fetching allocations from DB, using defaults:', error);

      // Fallback to hardcoded defaults
      const categoryDefaults = DEFAULT_ALLOCATIONS[category] || DEFAULT_ALLOCATIONS.personal;
      for (const [key, value] of Object.entries(categoryDefaults)) {
        allocations.set(key as AIFeatureKey, {
          auto: value.auto,
          button: value.button,
          minPriority: 5,
        });
      }
    }

    return allocations;
  }

  /**
   * Build final feature allocations with all overrides
   */
  private buildFeatureAllocations(
    baseAllocations: Map<AIFeatureKey, { auto: boolean; button: boolean; minPriority: number }>,
    context: {
      category: EmailCategory;
      priority: number;
      isVipSender: boolean;
      wordCount: number;
      hasAttachment: boolean;
      detectedMoney: boolean;
      detectedDeadline: boolean;
      contentTriggers: ContentTrigger[];
    }
  ): FeatureAllocation[] {
    const features: FeatureAllocation[] = [];
    const allFeatures: AIFeatureKey[] = [
      'summary', 'smart_reply', 'action_items', 'follow_up', 'sentiment', 'translate'
    ];

    // Collect features enabled by content triggers
    const triggerEnabledFeatures = new Set<AIFeatureKey>();
    for (const trigger of context.contentTriggers) {
      for (const feature of trigger.enableFeatures) {
        triggerEnabledFeatures.add(feature);
      }
    }

    for (const featureKey of allFeatures) {
      const base = baseAllocations.get(featureKey) || { auto: false, button: true, minPriority: 5 };

      let isAutoEnabled = base.auto;
      let triggerReason: TriggerType | null = base.auto ? 'auto_default' : null;

      // VIP sender override: enable all
      if (context.isVipSender) {
        isAutoEnabled = true;
        triggerReason = 'vip_sender';
      }
      // Priority override
      else if (context.priority >= base.minPriority) {
        isAutoEnabled = true;
        triggerReason = 'priority_override';
      }
      // Content trigger override
      else if (triggerEnabledFeatures.has(featureKey)) {
        isAutoEnabled = true;
        triggerReason = 'content_trigger';
      }
      // Long email: enable summary
      else if (featureKey === 'summary' && context.wordCount >= 500) {
        isAutoEnabled = true;
        triggerReason = 'long_email';
      }
      // Has attachment: enable summary + action_items
      else if (context.hasAttachment && (featureKey === 'summary' || featureKey === 'action_items')) {
        isAutoEnabled = true;
        triggerReason = 'has_attachment';
      }
      // Has money: enable action_items
      else if (context.detectedMoney && featureKey === 'action_items') {
        isAutoEnabled = true;
        triggerReason = 'has_money';
      }
      // Has deadline: enable action_items + follow_up
      else if (context.detectedDeadline && (featureKey === 'action_items' || featureKey === 'follow_up')) {
        isAutoEnabled = true;
        triggerReason = 'has_deadline';
      }

      // Spam: never auto-enable anything (except classification)
      if (context.category === 'spam' && featureKey !== 'classification') {
        isAutoEnabled = false;
        triggerReason = null;
      }

      features.push({
        featureKey,
        isAutoEnabled,
        isButtonVisible: base.button && !isAutoEnabled,
        triggerReason,
        estimatedCost: FEATURE_COSTS[featureKey],
      });
    }

    return features;
  }

  /**
   * Log feature usage
   */
  async logFeatureUsage(
    userId: string,
    emailId: string,
    featureKey: AIFeatureKey,
    triggerType: TriggerType,
    triggerReason: string | null,
    cost: number,
    tokensUsed: number = 0,
    processingTimeMs: number = 0
  ): Promise<void> {
    try {
      const supabase = await this.getSupabase();

      await supabase.from('ai_feature_usage').insert({
        user_id: userId,
        email_id: emailId,
        feature_key: featureKey,
        trigger_type: triggerType,
        trigger_reason: triggerReason,
        api_cost_usd: cost,
        tokens_used: tokensUsed,
        processing_time_ms: processingTimeMs,
      });

      // Update email's ai_features_used array
      const { data: email } = await supabase
        .from('emails')
        .select('ai_features_used')
        .eq('id', emailId)
        .single();

      if (email) {
        const currentFeatures = email.ai_features_used || [];
        if (!currentFeatures.includes(featureKey)) {
          await supabase
            .from('emails')
            .update({
              ai_features_used: [...currentFeatures, featureKey],
            })
            .eq('id', emailId);
        }
      }

    } catch (error) {
      console.error('Error logging feature usage:', error);
    }
  }

  /**
   * Get user's AI settings
   */
  async getUserSettings(userId: string): Promise<{
    categoryConfigs: Record<EmailCategory, Record<AIFeatureKey, { auto: boolean; button: boolean }>>;
    vipSenders: Array<{ email?: string; domain?: string }>;
    customTriggers: Array<{ name: string; patterns: string[]; features: AIFeatureKey[] }>;
  }> {
    const supabase = await this.getSupabase();

    // Get user overrides grouped by category
    const { data: configs } = await supabase
      .from('ai_feature_user_config')
      .select('category, feature_key, auto_enabled, button_visible')
      .eq('user_id', userId);

    // Get VIP senders
    const { data: vips } = await supabase
      .from('ai_vip_senders')
      .select('sender_email, sender_domain')
      .eq('user_id', userId);

    // Get custom triggers
    const { data: triggers } = await supabase
      .from('ai_content_triggers')
      .select('trigger_name, trigger_value, enable_features')
      .eq('user_id', userId);

    // Build category configs
    const categoryConfigs: Record<string, Record<string, { auto: boolean; button: boolean }>> = {};
    if (configs) {
      for (const config of configs) {
        const cat = config.category || 'global';
        if (!categoryConfigs[cat]) categoryConfigs[cat] = {};
        categoryConfigs[cat][config.feature_key] = {
          auto: config.auto_enabled ?? false,
          button: config.button_visible ?? true,
        };
      }
    }

    return {
      categoryConfigs: categoryConfigs as Record<EmailCategory, Record<AIFeatureKey, { auto: boolean; button: boolean }>>,
      vipSenders: (vips || []).map(v => ({ email: v.sender_email, domain: v.sender_domain })),
      customTriggers: (triggers || []).map(t => ({
        name: t.trigger_name,
        patterns: t.trigger_value?.split(',') || [],
        features: t.enable_features || [],
      })),
    };
  }

  /**
   * Update user's feature config
   */
  async updateUserConfig(
    userId: string,
    category: EmailCategory | null,
    featureKey: AIFeatureKey,
    autoEnabled: boolean | null,
    buttonVisible: boolean | null
  ): Promise<void> {
    const supabase = await this.getSupabase();

    await supabase.from('ai_feature_user_config').upsert({
      user_id: userId,
      category,
      feature_key: featureKey,
      auto_enabled: autoEnabled,
      button_visible: buttonVisible,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,category,feature_key',
    });
  }

  /**
   * Add VIP sender
   */
  async addVipSender(
    userId: string,
    senderEmail?: string,
    senderDomain?: string,
    options: { enableAllAi?: boolean; priorityBoost?: number; notify?: boolean } = {}
  ): Promise<void> {
    const supabase = await this.getSupabase();

    await supabase.from('ai_vip_senders').insert({
      user_id: userId,
      sender_email: senderEmail,
      sender_domain: senderDomain,
      enable_all_ai: options.enableAllAi ?? true,
      priority_boost: options.priorityBoost ?? 1,
      notify_on_receive: options.notify ?? false,
    });
  }

  /**
   * Remove VIP sender
   */
  async removeVipSender(userId: string, senderEmail?: string, senderDomain?: string): Promise<void> {
    const supabase = await this.getSupabase();

    let query = supabase.from('ai_vip_senders').delete().eq('user_id', userId);

    if (senderEmail) {
      query = query.eq('sender_email', senderEmail);
    } else if (senderDomain) {
      query = query.eq('sender_domain', senderDomain);
    }

    await query;
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(userId: string, days: number = 30): Promise<{
    totalEmails: number;
    totalCost: number;
    costByFeature: Record<AIFeatureKey, number>;
    costByCategory: Record<EmailCategory, number>;
    savingsEstimate: number;
  }> {
    const supabase = await this.getSupabase();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data } = await supabase
      .from('ai_cost_daily')
      .select('*')
      .eq('user_id', userId)
      .gte('cost_date', startDate.toISOString().split('T')[0]);

    if (!data || data.length === 0) {
      return {
        totalEmails: 0,
        totalCost: 0,
        costByFeature: {} as Record<AIFeatureKey, number>,
        costByCategory: {} as Record<EmailCategory, number>,
        savingsEstimate: 0,
      };
    }

    const totalEmails = data.reduce((sum, d) => sum + (d.total_emails_processed || 0), 0);
    const totalCost = data.reduce((sum, d) => sum + parseFloat(d.total_cost_usd || '0'), 0);
    const estimatedFullCost = data.reduce((sum, d) => sum + parseFloat(d.estimated_full_cost_usd || '0'), 0);

    // Aggregate cost by feature
    const costByFeature: Record<string, number> = {};
    for (const d of data) {
      if (d.cost_by_feature) {
        for (const [feature, cost] of Object.entries(d.cost_by_feature)) {
          costByFeature[feature] = (costByFeature[feature] || 0) + (cost as number);
        }
      }
    }

    // Aggregate cost by category
    const costByCategory: Record<string, number> = {};
    for (const d of data) {
      if (d.cost_by_category) {
        for (const [cat, cost] of Object.entries(d.cost_by_category)) {
          costByCategory[cat] = (costByCategory[cat] || 0) + (cost as number);
        }
      }
    }

    return {
      totalEmails,
      totalCost,
      costByFeature: costByFeature as Record<AIFeatureKey, number>,
      costByCategory: costByCategory as Record<EmailCategory, number>,
      savingsEstimate: Math.max(0, estimatedFullCost - totalCost),
    };
  }
}

// ===========================================
// SINGLETON INSTANCE
// ===========================================

let instance: AIFeatureAllocationService | null = null;

export function getAIFeatureAllocationService(): AIFeatureAllocationService {
  if (!instance) {
    instance = new AIFeatureAllocationService();
  }
  return instance;
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Quick helper to get allocation for an email
 */
export async function getFeatureAllocationForEmail(
  userId: string,
  email: {
    id: string;
    category: string;
    priority: number;
    from_address: string;
    subject: string;
    body_text?: string;
    body_html?: string;
    has_attachments?: boolean;
  }
): Promise<AllocationResult> {
  const service = getAIFeatureAllocationService();

  const bodyText = email.body_text || email.body_html || '';
  const wordCount = bodyText.split(/\s+/).length;
  const senderDomain = email.from_address.split('@')[1] || '';

  // Quick detection for money and deadline
  const detectedMoney = /\d+[.,]?\d*\s*(vnd|dong|trieu|tr|k|\$|usd)/i.test(bodyText);
  const detectedDeadline = /deadline|han chot|truoc ngay|due date|by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(bodyText);

  return service.getAllocation({
    userId,
    emailId: email.id,
    category: email.category as EmailCategory,
    priority: email.priority,
    senderEmail: email.from_address,
    senderDomain,
    subject: email.subject,
    bodyText,
    wordCount,
    hasAttachment: email.has_attachments ?? false,
    detectedMoney,
    detectedDeadline,
    isRead: false,
  });
}

/**
 * Check if a specific feature should be auto-enabled
 */
export async function shouldAutoEnableFeature(
  userId: string,
  email: {
    id: string;
    category: string;
    priority: number;
    from_address: string;
    subject: string;
    body_text?: string;
  },
  featureKey: AIFeatureKey
): Promise<boolean> {
  const allocation = await getFeatureAllocationForEmail(userId, email);
  const feature = allocation.features.find(f => f.featureKey === featureKey);
  return feature?.isAutoEnabled ?? false;
}

// ===========================================
// EXPORTS
// ===========================================

export default {
  AIFeatureAllocationService,
  getAIFeatureAllocationService,
  getFeatureAllocationForEmail,
  shouldAutoEnableFeature,
  FEATURE_COSTS,
  DEFAULT_ALLOCATIONS,
};
