/**
 * Vietnamese Classifier Integration
 * Combines all Vietnamese NLP modules for email classification
 */

import {
  VIETNAMESE_SYSTEM_PROMPT,
  VIETNAMESE_EXAMPLES,
  buildClassificationPrompt,
  buildFewShotPrompt,
  type ClassificationExample
} from './prompts/vietnamese-classifier';

import {
  preprocessEmail,
  expandAbbreviations,
  isVietnamese,
  getLanguageConfidence,
  detectFormality,
  cleanEmailBody,
  type PreprocessedEmail,
} from './vietnamese-utils';

import {
  extractAllEntities,
  detectBanks,
  detectEWallets,
  detectECommerce,
  identifySenderEntity,
  detectMoneyAmounts,
  type ExtractedEntities,
  type DetectedEntity,
} from './vietnamese-entities';

// ===========================================
// TYPES
// ===========================================

export interface VietnameseClassificationInput {
  subject: string;
  body: string;
  senderEmail: string;
  senderName?: string;
  senderDomain: string;
}

export interface VietnameseClassificationContext {
  preprocessed: PreprocessedEmail;
  entities: ExtractedEntities;
  languageInfo: {
    isVietnamese: boolean;
    confidence: number;
    vietnameseRatio: number;
  };
  formalityInfo: {
    level: 'formal' | 'semi-formal' | 'informal';
    confidence: number;
  };
  senderContext: {
    isLegitimate: boolean;
    entityType: string | null;
    entityName: string | null;
  };
  suggestedCategory: string | null;
  categoryHints: Array<{ category: string; reason: string; confidence: number }>;
}

export interface VietnameseClassificationResult {
  category: string;
  priority: number;
  confidence: number;
  reasoning: string;
  isVietnamese: boolean;
  detectedEntities: string[];
  context: VietnameseClassificationContext;
}

// ===========================================
// PRE-CLASSIFICATION ANALYSIS
// ===========================================

/**
 * Analyze email before sending to GPT
 * Returns context and hints that can improve classification
 */
export function analyzeEmailContext(input: VietnameseClassificationInput): VietnameseClassificationContext {
  const { subject, body, senderEmail, senderDomain } = input;

  // Preprocess email
  const preprocessed = preprocessEmail(subject, body);

  // Extract entities
  const entities = extractAllEntities(subject, body, senderDomain);

  // Language detection
  const langInfo = getLanguageConfidence(`${subject} ${body}`);

  // Formality detection
  const formalityInfo = detectFormality(`${subject} ${body}`);

  // Sender context
  const senderEntity = identifySenderEntity(senderDomain);

  // Generate category hints based on entities and patterns
  const categoryHints = generateCategoryHints(entities, preprocessed, senderEntity, senderEmail);

  // Suggest category if high confidence
  const suggestedCategory = categoryHints.length > 0 && categoryHints[0].confidence >= 0.85
    ? categoryHints[0].category
    : null;

  return {
    preprocessed,
    entities,
    languageInfo: {
      isVietnamese: langInfo.language === 'vi' || langInfo.language === 'mixed',
      confidence: langInfo.confidence,
      vietnameseRatio: langInfo.vietnameseRatio,
    },
    formalityInfo: {
      level: formalityInfo.level,
      confidence: formalityInfo.confidence,
    },
    senderContext: {
      isLegitimate: senderEntity.isLegitimate,
      entityType: senderEntity.type !== 'unknown' ? senderEntity.type : null,
      entityName: senderEntity.name,
    },
    suggestedCategory,
    categoryHints,
  };
}

/**
 * Generate category hints based on detected entities and patterns
 */
function generateCategoryHints(
  entities: ExtractedEntities,
  preprocessed: PreprocessedEmail,
  senderEntity: { type: string; isLegitimate: boolean; name: string | null },
  senderEmail: string
): Array<{ category: string; reason: string; confidence: number }> {
  const hints: Array<{ category: string; reason: string; confidence: number }> = [];

  // Transaction hints
  if (entities.banks.length > 0 || entities.ewallets.length > 0) {
    const hasMoneyAmount = entities.moneyAmounts.length > 0;
    const bankNames = entities.banks.map(b => b.info.shortName).join(', ');
    const walletNames = entities.ewallets.map(w => w.info.name).join(', ');

    if (hasMoneyAmount) {
      hints.push({
        category: 'transaction',
        reason: `Phat hien ${bankNames || walletNames} voi so tien ${entities.moneyAmounts[0].originalText}`,
        confidence: 0.92,
      });
    } else if (senderEntity.type === 'bank' || senderEntity.type === 'ewallet') {
      hints.push({
        category: 'transaction',
        reason: `Email tu ${senderEntity.name}`,
        confidence: 0.88,
      });
    }
  }

  // E-commerce / Promotion hints
  if (entities.ecommerce.length > 0) {
    const ecomNames = entities.ecommerce.map(e => e.info.name).join(', ');
    const hasMoneyAmount = entities.moneyAmounts.length > 0;

    // Check for promotion keywords
    const promoKeywords = ['sale', 'giam', 'khuyen mai', 'voucher', 'ma giam', 'uu dai', 'flash sale', '%'];
    const hasPromoKeyword = promoKeywords.some(kw =>
      preprocessed.expandedSubject.toLowerCase().includes(kw) ||
      preprocessed.expandedBody.toLowerCase().includes(kw)
    );

    if (hasPromoKeyword) {
      hints.push({
        category: 'promotion',
        reason: `Khuyen mai tu ${ecomNames}`,
        confidence: 0.90,
      });
    } else if (hasMoneyAmount) {
      hints.push({
        category: 'transaction',
        reason: `Don hang tu ${ecomNames}`,
        confidence: 0.85,
      });
    }
  }

  // Social media hints
  const socialEntities = entities.entities.filter(e => e.type === 'social');
  if (socialEntities.length > 0 && senderEntity.type === 'social') {
    hints.push({
      category: 'social',
      reason: `Thong bao tu ${senderEntity.name}`,
      confidence: 0.92,
    });
  }

  // Government hints
  if (senderEntity.type === 'government') {
    hints.push({
      category: 'work',
      reason: `Email tu co quan nha nuoc: ${senderEntity.name}`,
      confidence: 0.85,
    });
  }

  // Newsletter hints (unsubscribe link)
  const hasUnsubscribe = /unsubscribe|huy dang ky|opt.out/i.test(preprocessed.cleanedBody);
  if (hasUnsubscribe && !hints.some(h => h.category === 'promotion')) {
    hints.push({
      category: 'newsletter',
      reason: 'Co link huy dang ky',
      confidence: 0.75,
    });
  }

  // Work hints based on formality and sender domain
  if (preprocessed.formality.level === 'formal') {
    const isCompanyDomain = !senderEmail.match(/@(gmail|yahoo|hotmail|outlook)\./i);
    if (isCompanyDomain) {
      hints.push({
        category: 'work',
        reason: `Email formal tu domain cong ty`,
        confidence: 0.70,
      });
    }
  }

  // Personal hints based on informality
  if (preprocessed.formality.level === 'informal') {
    const isPersonalDomain = senderEmail.match(/@(gmail|yahoo|hotmail|outlook)\./i);
    if (isPersonalDomain) {
      hints.push({
        category: 'personal',
        reason: 'Email than mat tu email ca nhan',
        confidence: 0.65,
      });
    }
  }

  // Sort by confidence
  hints.sort((a, b) => b.confidence - a.confidence);

  return hints;
}

// ===========================================
// PROMPT BUILDING
// ===========================================

/**
 * Build optimized prompt for Vietnamese email classification
 */
export function buildVietnameseClassificationPrompt(
  input: VietnameseClassificationInput,
  context: VietnameseClassificationContext,
  options: {
    useFewShot?: boolean;
    numExamples?: number;
    includeContext?: boolean;
  } = {}
): { systemPrompt: string; userPrompt: string } {
  const { useFewShot = true, numExamples = 3, includeContext = true } = options;

  // Build system prompt with context additions
  let systemPrompt = VIETNAMESE_SYSTEM_PROMPT;

  // Add context-specific instructions if available
  if (includeContext && context.categoryHints.length > 0) {
    const hintsText = context.categoryHints
      .slice(0, 3)
      .map(h => `- ${h.category}: ${h.reason} (${Math.round(h.confidence * 100)}%)`)
      .join('\n');

    systemPrompt += `\n\n## GOI Y TU HE THONG\nDua tren phan tich tu dong:\n${hintsText}\n\nHay xem xet cac goi y nay nhung dua ra quyet dinh cuoi cung dua tren noi dung email.`;
  }

  // Build user prompt
  let userPrompt: string;

  if (useFewShot) {
    userPrompt = buildFewShotPrompt(
      context.preprocessed.expandedSubject,
      context.preprocessed.expandedBody,
      input.senderEmail,
      input.senderName,
      numExamples
    );
  } else {
    userPrompt = buildClassificationPrompt(
      context.preprocessed.expandedSubject,
      context.preprocessed.expandedBody,
      input.senderEmail,
      input.senderName
    );
  }

  // Add entity information to prompt
  if (context.entities.entities.length > 0) {
    const entityList = context.entities.entities
      .slice(0, 5)
      .map(e => `${e.name} (${e.type})`)
      .join(', ');

    userPrompt += `\n\n**Entities phat hien:** ${entityList}`;
  }

  // Add money amounts if present
  if (context.entities.moneyAmounts.length > 0) {
    const amounts = context.entities.moneyAmounts
      .map(m => m.originalText)
      .join(', ');

    userPrompt += `\n**So tien:** ${amounts}`;
  }

  // Add sender context
  if (context.senderContext.isLegitimate) {
    userPrompt += `\n**Sender xac thuc:** ${context.senderContext.entityName} (${context.senderContext.entityType})`;
  }

  return { systemPrompt, userPrompt };
}

// ===========================================
// RESPONSE PARSING
// ===========================================

/**
 * Parse GPT response into classification result
 */
export function parseClassificationResponse(
  response: string,
  context: VietnameseClassificationContext
): VietnameseClassificationResult {
  // Default result
  const defaultResult: VietnameseClassificationResult = {
    category: 'personal',
    priority: 3,
    confidence: 0.5,
    reasoning: 'Khong the phan tich response',
    isVietnamese: context.languageInfo.isVietnamese,
    detectedEntities: context.entities.entities.map(e => e.name),
    context,
  };

  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in response:', response);
      return defaultResult;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate category
    const validCategories = ['work', 'personal', 'transaction', 'newsletter', 'promotion', 'social', 'spam'];
    const category = validCategories.includes(parsed.category) ? parsed.category : 'personal';

    // Validate priority
    const priority = typeof parsed.priority === 'number' && parsed.priority >= 1 && parsed.priority <= 5
      ? Math.round(parsed.priority)
      : 3;

    // Validate confidence
    const confidence = typeof parsed.confidence === 'number' && parsed.confidence >= 0 && parsed.confidence <= 1
      ? parsed.confidence
      : 0.7;

    return {
      category,
      priority,
      confidence,
      reasoning: parsed.reasoning || 'Khong co ly do',
      isVietnamese: parsed.is_vietnamese ?? context.languageInfo.isVietnamese,
      detectedEntities: parsed.detected_entities || context.entities.entities.map(e => e.name),
      context,
    };
  } catch (error) {
    console.error('Error parsing classification response:', error);
    return defaultResult;
  }
}

// ===========================================
// RULE-BASED PRE-CLASSIFICATION
// ===========================================

/**
 * Attempt rule-based classification before GPT
 * Returns null if GPT is needed
 */
export function tryRuleBasedClassification(
  context: VietnameseClassificationContext
): VietnameseClassificationResult | null {
  // If we have a high-confidence suggestion, use it
  if (context.suggestedCategory && context.categoryHints[0]?.confidence >= 0.90) {
    const hint = context.categoryHints[0];

    return {
      category: hint.category,
      priority: getPriorityForCategory(hint.category, context),
      confidence: hint.confidence,
      reasoning: hint.reason,
      isVietnamese: context.languageInfo.isVietnamese,
      detectedEntities: context.entities.entities.map(e => e.name),
      context,
    };
  }

  // Transaction with money amount from bank/ewallet
  if (
    context.senderContext.isLegitimate &&
    (context.senderContext.entityType === 'bank' || context.senderContext.entityType === 'ewallet') &&
    context.entities.moneyAmounts.length > 0
  ) {
    return {
      category: 'transaction',
      priority: 3,
      confidence: 0.95,
      reasoning: `Giao dich tu ${context.senderContext.entityName} voi so tien ${context.entities.moneyAmounts[0].originalText}`,
      isVietnamese: context.languageInfo.isVietnamese,
      detectedEntities: context.entities.entities.map(e => e.name),
      context,
    };
  }

  // Social media notification
  if (
    context.senderContext.isLegitimate &&
    context.senderContext.entityType === 'social'
  ) {
    return {
      category: 'social',
      priority: 2,
      confidence: 0.93,
      reasoning: `Thong bao tu ${context.senderContext.entityName}`,
      isVietnamese: context.languageInfo.isVietnamese,
      detectedEntities: context.entities.entities.map(e => e.name),
      context,
    };
  }

  // Need GPT for classification
  return null;
}

/**
 * Get default priority for category
 */
function getPriorityForCategory(category: string, context: VietnameseClassificationContext): number {
  switch (category) {
    case 'work':
      // Check for urgency keywords
      const urgentKeywords = ['gap', 'khan', 'urgent', 'asap', 'ngay'];
      const hasUrgent = urgentKeywords.some(kw =>
        context.preprocessed.expandedSubject.toLowerCase().includes(kw) ||
        context.preprocessed.expandedBody.toLowerCase().includes(kw)
      );
      return hasUrgent ? 5 : 3;

    case 'personal':
      return 3;

    case 'transaction':
      // High amount = higher priority
      if (context.entities.moneyAmounts.length > 0) {
        const maxAmount = Math.max(...context.entities.moneyAmounts.map(m => m.amount));
        if (maxAmount >= 10000000) return 4; // >= 10 trieu
        if (maxAmount >= 1000000) return 3; // >= 1 trieu
      }
      return 2;

    case 'newsletter':
      return 2;

    case 'promotion':
      return 2;

    case 'social':
      return 2;

    case 'spam':
      return 1;

    default:
      return 3;
  }
}

// ===========================================
// MAIN CLASSIFICATION FUNCTION
// ===========================================

/**
 * Complete Vietnamese email classification pipeline
 * This is the main entry point for classification
 */
export async function classifyVietnameseEmail(
  input: VietnameseClassificationInput,
  gptClassifier: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<VietnameseClassificationResult> {
  // Step 1: Analyze context
  const context = analyzeEmailContext(input);

  // Step 2: Try rule-based classification
  const ruleBasedResult = tryRuleBasedClassification(context);
  if (ruleBasedResult) {
    console.log('Used rule-based classification:', ruleBasedResult.category);
    return ruleBasedResult;
  }

  // Step 3: Build prompts for GPT
  const { systemPrompt, userPrompt } = buildVietnameseClassificationPrompt(input, context, {
    useFewShot: true,
    numExamples: 3,
    includeContext: true,
  });

  // Step 4: Call GPT
  const gptResponse = await gptClassifier(systemPrompt, userPrompt);

  // Step 5: Parse response
  const result = parseClassificationResponse(gptResponse, context);

  // Step 6: Apply post-processing adjustments
  return applyPostProcessing(result, context);
}

/**
 * Post-processing adjustments based on context
 */
function applyPostProcessing(
  result: VietnameseClassificationResult,
  context: VietnameseClassificationContext
): VietnameseClassificationResult {
  const adjusted = { ...result };

  // Boost confidence if context agrees with GPT result
  const matchingHint = context.categoryHints.find(h => h.category === result.category);
  if (matchingHint) {
    adjusted.confidence = Math.min(0.98, result.confidence + 0.05);
  }

  // Lower confidence if context strongly disagrees
  if (
    context.categoryHints.length > 0 &&
    context.categoryHints[0].confidence >= 0.85 &&
    context.categoryHints[0].category !== result.category
  ) {
    adjusted.confidence = Math.max(0.5, result.confidence - 0.1);
    adjusted.reasoning += ` (Luu y: He thong goi y ${context.categoryHints[0].category})`;
  }

  // Ensure spam/phishing from suspicious senders
  if (
    !context.senderContext.isLegitimate &&
    context.senderContext.entityType === null
  ) {
    // Check for bank/ewallet mentions without legitimate sender
    const mentionsBankOrWallet = context.entities.banks.length > 0 || context.entities.ewallets.length > 0;
    const mentionsMoney = context.entities.moneyAmounts.length > 0;
    const hasUrgency = /khan|gap|ngay|urgent|24h|bi khoa|dinh chi/i.test(
      context.preprocessed.expandedSubject + context.preprocessed.expandedBody
    );

    if (mentionsBankOrWallet && (mentionsMoney || hasUrgency) && result.category !== 'spam') {
      // Suspicious - might be phishing, but don't override GPT entirely
      adjusted.reasoning += ' (Canh bao: Sender khong xac thuc, co the la lua dao)';
    }
  }

  return adjusted;
}

// ===========================================
// EXPORTS
// ===========================================

export default {
  analyzeEmailContext,
  buildVietnameseClassificationPrompt,
  parseClassificationResponse,
  tryRuleBasedClassification,
  classifyVietnameseEmail,
};
