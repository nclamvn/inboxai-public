/**
 * Sender Reputation Service
 * Tracks sender classification history for consistent AI categorization
 */

import { createClient as createAdminClient } from '@supabase/supabase-js';

// Types
export interface SenderReputation {
  id: string;
  user_id: string;
  sender_email: string;
  sender_domain: string;
  primary_category: string;
  category_scores: Record<string, number>;
  total_emails: number;
  user_overrides: number;
  confidence: number;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface ReputationLookupResult {
  found: boolean;
  reputation: SenderReputation | null;
  shouldUseReputation: boolean; // true if confidence >= 0.85
  suggestedCategory: string | null;
}

// Confidence threshold for auto-classification
const CONFIDENCE_THRESHOLD = 0.85;

// Get admin client for server-side operations
function getSupabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  const parts = email.toLowerCase().split('@');
  return parts.length > 1 ? parts[1] : '';
}

/**
 * Normalize email address (lowercase, trim)
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Get sender reputation for a specific sender
 * PHASE 0: Called before classification pipeline
 */
export async function getReputation(
  userId: string,
  senderEmail: string
): Promise<ReputationLookupResult> {
  const supabase = getSupabaseAdmin();
  const normalizedEmail = normalizeEmail(senderEmail);

  try {
    const { data, error } = await supabase
      .from('sender_reputation')
      .select('*')
      .eq('user_id', userId)
      .eq('sender_email', normalizedEmail)
      .single();

    if (error || !data) {
      return {
        found: false,
        reputation: null,
        shouldUseReputation: false,
        suggestedCategory: null,
      };
    }

    const reputation = data as SenderReputation;
    const shouldUse = reputation.confidence >= CONFIDENCE_THRESHOLD;

    return {
      found: true,
      reputation,
      shouldUseReputation: shouldUse,
      suggestedCategory: shouldUse ? reputation.primary_category : null,
    };
  } catch {
    return {
      found: false,
      reputation: null,
      shouldUseReputation: false,
      suggestedCategory: null,
    };
  }
}

/**
 * Update sender reputation after classification
 * PHASE 5: Called after classification pipeline
 */
export async function updateReputation(
  userId: string,
  senderEmail: string,
  category: string,
  isUserFeedback: boolean = false
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const normalizedEmail = normalizeEmail(senderEmail);
  const domain = extractDomain(senderEmail);

  try {
    // Get existing reputation
    const { data: existing } = await supabase
      .from('sender_reputation')
      .select('*')
      .eq('user_id', userId)
      .eq('sender_email', normalizedEmail)
      .single();

    if (existing) {
      // Update existing reputation
      const reputation = existing as SenderReputation;
      const newCategoryScores = { ...reputation.category_scores };

      // Increment category count (user feedback counts more)
      const increment = isUserFeedback ? 3 : 1;
      newCategoryScores[category] = (newCategoryScores[category] || 0) + increment;

      // Find primary category (highest score)
      let maxScore = 0;
      let primaryCategory = category;
      for (const [cat, score] of Object.entries(newCategoryScores)) {
        if (score > maxScore) {
          maxScore = score;
          primaryCategory = cat;
        }
      }

      // Calculate new confidence
      const newTotalEmails = reputation.total_emails + 1;
      const newUserOverrides = isUserFeedback
        ? reputation.user_overrides + 1
        : reputation.user_overrides;

      const newConfidence = calculateConfidence(
        newTotalEmails,
        newUserOverrides,
        newCategoryScores
      );

      // Update record
      await supabase
        .from('sender_reputation')
        .update({
          category_scores: newCategoryScores,
          primary_category: primaryCategory,
          total_emails: newTotalEmails,
          user_overrides: newUserOverrides,
          confidence: newConfidence,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', reputation.id);

    } else {
      // Create new reputation record
      const categoryScores: Record<string, number> = {};
      categoryScores[category] = isUserFeedback ? 3 : 1;

      const confidence = calculateConfidence(
        1,
        isUserFeedback ? 1 : 0,
        categoryScores
      );

      await supabase
        .from('sender_reputation')
        .insert({
          user_id: userId,
          sender_email: normalizedEmail,
          sender_domain: domain,
          primary_category: category,
          category_scores: categoryScores,
          total_emails: 1,
          user_overrides: isUserFeedback ? 1 : 0,
          confidence,
        });

    }
  } catch {
    // Error updating reputation
  }
}

/**
 * Calculate confidence score
 * Same logic as PostgreSQL function but in TypeScript
 */
export function calculateConfidence(
  totalEmails: number,
  userOverrides: number,
  categoryScores: Record<string, number>
): number {
  // Base confidence from email count (max 0.5)
  // 20 emails = 0.5 confidence
  const baseConfidence = Math.min(totalEmails / 20.0, 0.5);

  // Boost from user overrides (each override +0.15, max 0.3)
  const overrideBoost = Math.min(userOverrides * 0.15, 0.3);

  // Consistency score: primary category percentage (max 0.2)
  let maxScore = 0;
  let totalScore = 0;
  for (const score of Object.values(categoryScores)) {
    totalScore += score;
    if (score > maxScore) {
      maxScore = score;
    }
  }

  const consistencyScore = totalScore > 0
    ? (maxScore / totalScore) * 0.2
    : 0;

  return Math.min(baseConfidence + overrideBoost + consistencyScore, 1.0);
}

/**
 * Get all high-confidence senders for a user
 * Useful for debugging and admin views
 */
export async function getHighConfidenceSenders(
  userId: string,
  limit: number = 50
): Promise<SenderReputation[]> {
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('sender_reputation')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', CONFIDENCE_THRESHOLD)
      .order('confidence', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[SenderReputation] Error getting high-confidence senders:', error);
      return [];
    }

    return (data || []) as SenderReputation[];
  } catch (error) {
    console.error('[SenderReputation] Error:', error);
    return [];
  }
}

/**
 * Get reputation stats for a user
 */
export async function getReputationStats(userId: string): Promise<{
  totalSenders: number;
  highConfidenceSenders: number;
  categoryBreakdown: Record<string, number>;
}> {
  const supabase = getSupabaseAdmin();

  try {
    // Get all reputations
    const { data, error } = await supabase
      .from('sender_reputation')
      .select('primary_category, confidence')
      .eq('user_id', userId);

    if (error || !data) {
      return {
        totalSenders: 0,
        highConfidenceSenders: 0,
        categoryBreakdown: {},
      };
    }

    const categoryBreakdown: Record<string, number> = {};
    let highConfidence = 0;

    for (const rep of data) {
      // Count by category
      categoryBreakdown[rep.primary_category] =
        (categoryBreakdown[rep.primary_category] || 0) + 1;

      // Count high confidence
      if (rep.confidence >= CONFIDENCE_THRESHOLD) {
        highConfidence++;
      }
    }

    return {
      totalSenders: data.length,
      highConfidenceSenders: highConfidence,
      categoryBreakdown,
    };
  } catch (error) {
    console.error('[SenderReputation] Error getting stats:', error);
    return {
      totalSenders: 0,
      highConfidenceSenders: 0,
      categoryBreakdown: {},
    };
  }
}

/**
 * Check consistency between pipeline result and reputation
 * Returns the category to use (reputation wins if high confidence)
 */
export function resolveCategory(
  pipelineCategory: string,
  reputationResult: ReputationLookupResult
): {
  finalCategory: string;
  source: 'pipeline' | 'reputation';
  confidence: number;
} {
  if (reputationResult.shouldUseReputation && reputationResult.suggestedCategory) {
    return {
      finalCategory: reputationResult.suggestedCategory,
      source: 'reputation',
      confidence: reputationResult.reputation?.confidence || 0,
    };
  }

  return {
    finalCategory: pipelineCategory,
    source: 'pipeline',
    confidence: reputationResult.reputation?.confidence || 0,
  };
}
