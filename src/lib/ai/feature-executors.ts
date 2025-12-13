/**
 * AI Feature Executors
 * Connects existing AI functions to the feature runner system
 */

import { getAIFeatureRunner, FeatureExecutor } from './feature-runner';
import { summarizeEmail, SummaryResult } from './summarizer';
import { generateSmartReplies, SmartReplyResult } from './smart-reply';
import { extractActions, ActionExtractionResult } from './action-extractor';
import { detectFollowUp, FollowUp } from './follow-up-detector';
import { AIFeatureKey } from '@/types/ai-features';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ===========================================
// SUMMARY EXECUTOR
// ===========================================

export const summaryExecutor: FeatureExecutor<SummaryResult | null> = {
  async execute(emailId: string, emailData: Record<string, unknown>) {
    return summarizeEmail({
      from_address: emailData.from_address as string,
      from_name: emailData.from_name as string | null,
      subject: emailData.subject as string | null,
      body_text: emailData.body_text as string | null,
      received_at: emailData.received_at as string | null,
    });
  }
};

// ===========================================
// SMART REPLY EXECUTOR
// ===========================================

export const smartReplyExecutor: FeatureExecutor<SmartReplyResult> = {
  async execute(emailId: string, emailData: Record<string, unknown>) {
    return generateSmartReplies({
      originalEmail: {
        from_name: emailData.from_name as string | null,
        from_address: emailData.from_address as string,
        subject: emailData.subject as string | null,
        body_text: emailData.body_text as string | null,
        received_at: emailData.received_at as string | null,
      },
      userEmail: emailData.user_email as string,
      userName: emailData.user_name as string | null,
      category: emailData.category as string | null,
    });
  }
};

// ===========================================
// ACTION ITEMS EXECUTOR
// ===========================================

export const actionItemsExecutor: FeatureExecutor<ActionExtractionResult> = {
  async execute(emailId: string, emailData: Record<string, unknown>) {
    return extractActions({
      id: emailId,
      from_name: emailData.from_name as string | null,
      from_address: emailData.from_address as string,
      subject: emailData.subject as string | null,
      body_text: emailData.body_text as string | null,
      received_at: emailData.received_at as string | null,
      category: emailData.category as string | null,
    });
  }
};

// ===========================================
// FOLLOW UP EXECUTOR
// ===========================================

export const followUpExecutor: FeatureExecutor<FollowUp | null> = {
  async execute(emailId: string, emailData: Record<string, unknown>) {
    const userEmail = emailData.user_email as string;
    const fromAddress = emailData.from_address as string;
    const isSent = fromAddress.toLowerCase() === userEmail.toLowerCase();

    return detectFollowUp(
      {
        id: emailId,
        from_address: fromAddress,
        from_name: emailData.from_name as string | undefined,
        to_addresses: emailData.to_addresses as Array<{ address: string; name?: string }> || [],
        subject: emailData.subject as string | undefined,
        body_text: emailData.body_text as string | undefined,
        received_at: emailData.received_at as string,
        is_read: emailData.is_read as boolean,
        category: emailData.category as string | undefined,
        thread_id: emailData.thread_id as string | undefined,
        user_email: userEmail,
      },
      isSent ? 'sent' : 'received'
    );
  }
};

// ===========================================
// SENTIMENT EXECUTOR
// ===========================================

interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  emotions?: string[];
}

export const sentimentExecutor: FeatureExecutor<SentimentResult> = {
  async execute(emailId: string, emailData: Record<string, unknown>) {
    const bodyText = emailData.body_text as string | null;

    if (!bodyText || bodyText.length < 30) {
      return {
        sentiment: 'neutral',
        confidence: 0.5,
        emotions: [],
      };
    }

    const prompt = `Phân tích sentiment của email sau:

"${bodyText.slice(0, 1000)}"

Trả về JSON:
{
  "sentiment": "positive|negative|neutral",
  "confidence": 0.0-1.0,
  "emotions": ["emotion1", "emotion2"]
}

Emotions có thể: happy, excited, grateful, frustrated, angry, worried, neutral, professional

CHỈ trả về JSON.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Phân tích sentiment email. Output JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 200,
      });

      const content = response.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          sentiment: ['positive', 'negative', 'neutral'].includes(parsed.sentiment)
            ? parsed.sentiment
            : 'neutral',
          confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
          emotions: parsed.emotions || [],
        };
      }
    } catch (error) {
      console.error('[SENTIMENT] Error:', error);
    }

    return {
      sentiment: 'neutral',
      confidence: 0.5,
      emotions: [],
    };
  }
};

// ===========================================
// TRANSLATOR EXECUTOR
// ===========================================

interface TranslationResult {
  originalLanguage: string;
  translatedTo: string;
  translatedSubject?: string;
  translatedBody: string;
}

export const translatorExecutor: FeatureExecutor<TranslationResult | null> = {
  async execute(emailId: string, emailData: Record<string, unknown>) {
    const subject = emailData.subject as string | null;
    const bodyText = emailData.body_text as string | null;

    if (!bodyText || bodyText.length < 50) {
      return null;
    }

    const prompt = `Dịch email sau sang tiếng Việt (nếu email tiếng nước ngoài) hoặc sang tiếng Anh (nếu email tiếng Việt).

Subject: ${subject || '(Không có tiêu đề)'}

Body (first 2000 chars):
${bodyText.slice(0, 2000)}

Trả về JSON:
{
  "originalLanguage": "en|vi|zh|ja|ko|fr|de|other",
  "translatedTo": "vi|en",
  "translatedSubject": "Translated subject",
  "translatedBody": "Translated body text"
}

Nếu email đã là tiếng Việt, dịch sang tiếng Anh.
Nếu email tiếng Anh hoặc ngôn ngữ khác, dịch sang tiếng Việt.

CHỈ trả về JSON.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Dịch email. Output JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          originalLanguage: parsed.originalLanguage || 'unknown',
          translatedTo: parsed.translatedTo || 'vi',
          translatedSubject: parsed.translatedSubject,
          translatedBody: parsed.translatedBody || '',
        };
      }
    } catch (error) {
      console.error('[TRANSLATOR] Error:', error);
    }

    return null;
  }
};

// ===========================================
// REGISTER ALL EXECUTORS
// ===========================================

export function registerAllExecutors(): void {
  const runner = getAIFeatureRunner();

  // Register each executor
  runner.registerExecutor('summary', summaryExecutor);
  runner.registerExecutor('smart_reply', smartReplyExecutor);
  runner.registerExecutor('action_items', actionItemsExecutor);
  runner.registerExecutor('follow_up', followUpExecutor);
  runner.registerExecutor('sentiment', sentimentExecutor);
  runner.registerExecutor('translate', translatorExecutor);

  console.log('[AI] Registered executors:', runner.getRegisteredFeatures());
}

// ===========================================
// EXECUTOR MAP FOR DYNAMIC ACCESS
// ===========================================

export const executorMap: Record<AIFeatureKey, FeatureExecutor> = {
  classification: { execute: async () => null }, // Handled separately
  summary: summaryExecutor,
  smart_reply: smartReplyExecutor,
  action_items: actionItemsExecutor,
  follow_up: followUpExecutor,
  sentiment: sentimentExecutor,
  translate: translatorExecutor,
};

export default {
  registerAllExecutors,
  executorMap,
  summaryExecutor,
  smartReplyExecutor,
  actionItemsExecutor,
  followUpExecutor,
  sentimentExecutor,
  translatorExecutor,
};
