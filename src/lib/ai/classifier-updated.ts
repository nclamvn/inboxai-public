/**
 * Updated Email Classifier with Vietnamese Integration
 *
 * This file shows how to integrate Vietnamese classification into existing classifier.
 * Merge vao file classifier.ts hien tai.
 */

import {
  analyzeEmailContext,
  buildVietnameseClassificationPrompt,
  parseClassificationResponse,
  tryRuleBasedClassification,
  classifyVietnameseEmail,
  type VietnameseClassificationInput,
  type VietnameseClassificationResult,
} from './vietnamese-classifier-integration';

import { getLanguageConfidence } from './vietnamese-utils';

// ===========================================
// INTEGRATION POINTS
// ===========================================

/**
 * Integration point 1: Before calling GPT
 * Add this to the beginning of your classify function
 */
export function preprocessForClassification(
  subject: string,
  body: string,
  senderEmail: string,
  senderName?: string
) {
  // Extract domain from sender email
  const senderDomain = senderEmail.split('@')[1] || '';

  // Create input
  const input: VietnameseClassificationInput = {
    subject,
    body,
    senderEmail,
    senderName,
    senderDomain,
  };

  // Analyze context
  const context = analyzeEmailContext(input);

  return { input, context };
}

/**
 * Integration point 2: Classification with Vietnamese support
 * Replace or enhance your existing GPT call
 */
export async function classifyEmailWithVietnamese(
  subject: string,
  body: string,
  senderEmail: string,
  senderName: string | undefined,
  callGPT: (systemPrompt: string, userPrompt: string) => Promise<string>
): Promise<{
  category: string;
  priority: number;
  confidence: number;
  reasoning: string;
  isVietnamese: boolean;
  detectedEntities: string[];
  classificationSource: 'rule_based' | 'gpt_vietnamese' | 'gpt_english';
}> {
  const senderDomain = senderEmail.split('@')[1] || '';

  // Check language
  const langInfo = getLanguageConfidence(`${subject} ${body}`);
  const isVietnamese = langInfo.language === 'vi' || langInfo.language === 'mixed';

  if (isVietnamese) {
    // Use Vietnamese classification pipeline
    const input: VietnameseClassificationInput = {
      subject,
      body,
      senderEmail,
      senderName,
      senderDomain,
    };

    const context = analyzeEmailContext(input);

    // Try rule-based first
    const ruleBasedResult = tryRuleBasedClassification(context);
    if (ruleBasedResult) {
      return {
        category: ruleBasedResult.category,
        priority: ruleBasedResult.priority,
        confidence: ruleBasedResult.confidence,
        reasoning: ruleBasedResult.reasoning,
        isVietnamese: true,
        detectedEntities: ruleBasedResult.detectedEntities,
        classificationSource: 'rule_based',
      };
    }

    // Use GPT with Vietnamese prompts
    const { systemPrompt, userPrompt } = buildVietnameseClassificationPrompt(input, context);
    const gptResponse = await callGPT(systemPrompt, userPrompt);
    const result = parseClassificationResponse(gptResponse, context);

    return {
      category: result.category,
      priority: result.priority,
      confidence: result.confidence,
      reasoning: result.reasoning,
      isVietnamese: true,
      detectedEntities: result.detectedEntities,
      classificationSource: 'gpt_vietnamese',
    };
  } else {
    // Use existing English classification (or basic Vietnamese prompts)
    // Keep existing logic for English emails
    const { systemPrompt, userPrompt } = buildVietnameseClassificationPrompt(
      {
        subject,
        body,
        senderEmail,
        senderName,
        senderDomain,
      },
      analyzeEmailContext({
        subject,
        body,
        senderEmail,
        senderName,
        senderDomain,
      }),
      { useFewShot: false } // Less examples for English
    );

    const gptResponse = await callGPT(systemPrompt, userPrompt);
    const context = analyzeEmailContext({
      subject,
      body,
      senderEmail,
      senderName,
      senderDomain,
    });
    const result = parseClassificationResponse(gptResponse, context);

    return {
      category: result.category,
      priority: result.priority,
      confidence: result.confidence,
      reasoning: result.reasoning,
      isVietnamese: false,
      detectedEntities: result.detectedEntities,
      classificationSource: 'gpt_english',
    };
  }
}

// ===========================================
// EXAMPLE: HOW TO UPDATE classifier.ts
// ===========================================

/*
Trong file classifier.ts hien tai, thay doi function classifyEmail nhu sau:

TRUOC:
```
export async function classifyEmail(email: EmailInput): Promise<Classification> {
  // ... existing code calling GPT directly
}
```

SAU:
```
import { classifyEmailWithVietnamese } from './classifier-updated';

export async function classifyEmail(email: EmailInput): Promise<Classification> {
  const result = await classifyEmailWithVietnamese(
    email.subject,
    email.body,
    email.senderEmail,
    email.senderName,
    async (systemPrompt, userPrompt) => {
      // Your existing GPT call
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });
      return response.choices[0].message.content || '';
    }
  );

  return {
    category: result.category,
    priority: result.priority,
    confidence: result.confidence,
    reasoning: result.reasoning,
    // ... map to your existing Classification type
  };
}
```
*/

// ===========================================
// EXPORTS
// ===========================================

export {
  analyzeEmailContext,
  buildVietnameseClassificationPrompt,
  parseClassificationResponse,
  tryRuleBasedClassification,
  classifyVietnameseEmail,
};
