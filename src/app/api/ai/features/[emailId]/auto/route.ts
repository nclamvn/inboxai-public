/**
 * POST /api/ai/features/[emailId]/auto
 * Batch run all auto-enabled AI features in PARALLEL
 * Optimized for single API call instead of multiple sequential calls
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getFeatureAllocationForEmail,
  getAIFeatureAllocationService,
  AIFeatureKey,
  FEATURE_COSTS,
} from '@/lib/ai/feature-allocation';
import { getAIFeatureRunner } from '@/lib/ai/feature-runner';
import { ensureAIModuleInitialized } from '@/lib/ai/setup';
import { aiLogger } from '@/lib/logger';

interface FeatureResultWithMeta {
  status: 'success' | 'error';
  data?: unknown;
  error?: string;
  cost: number;
  timeMs: number;
  cached?: boolean;
}

/**
 * Strip HTML tags and decode entities to get plain text
 * Used for existing emails that have body_html but empty body_text
 */
function stripHtmlTags(html: string): string {
  // Remove script and style tags with their content
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Replace block elements with newlines
  text = text.replace(/<\/(p|div|tr|li|h[1-6]|br)>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&rsquo;/gi, "'");
  text = text.replace(/&lsquo;/gi, "'");
  text = text.replace(/&rdquo;/gi, '"');
  text = text.replace(/&ldquo;/gi, '"');
  text = text.replace(/&mdash;/gi, '—');
  text = text.replace(/&ndash;/gi, '–');

  // Clean up whitespace
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.trim();

  return text;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const startTime = Date.now();
  aiLogger.debug('[BatchAPI] === START ===');

  try {
    // Step 1: Get params
    const { emailId } = await params;
    aiLogger.debug('[BatchAPI] Step 1 - emailId:', emailId);

    if (!emailId) {
      aiLogger.debug('[BatchAPI] ERROR: No emailId');
      return NextResponse.json({ error: 'emailId is required' }, { status: 400 });
    }

    // Step 2: Ensure AI module is initialized
    aiLogger.debug('[BatchAPI] Step 2 - Initializing AI module...');
    await ensureAIModuleInitialized();
    aiLogger.debug('[BatchAPI] Step 2 - AI module initialized');

    // Step 3: Create Supabase client
    aiLogger.debug('[BatchAPI] Step 3 - Creating Supabase client...');
    const supabase = await createClient();
    aiLogger.debug('[BatchAPI] Step 3 - Supabase client created');

    // Step 4: Get current user
    aiLogger.debug('[BatchAPI] Step 4 - Getting user...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    aiLogger.debug('[BatchAPI] Step 4 - User:', user?.id, 'AuthError:', authError?.message);

    if (authError || !user) {
      aiLogger.debug('[BatchAPI] ERROR: Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 5: Get email data
    aiLogger.debug('[BatchAPI] Step 5 - Fetching email:', emailId);
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .select(`
        id,
        category,
        priority,
        from_address,
        from_name,
        subject,
        body_text,
        body_html,
        summary,
        ai_suggestions,
        ai_features_used,
        ai_total_cost_usd
      `)
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single();

    aiLogger.debug('[BatchAPI] Step 5 - Email found:', !!email, 'Error:', emailError?.message);

    if (emailError || !email) {
      aiLogger.debug('[BatchAPI] ERROR: Email not found');
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // FIX: If body_text is empty but body_html exists, extract text from HTML
    let bodyText = email.body_text as string | null;
    const bodyHtml = email.body_html as string | null;

    aiLogger.debug('[BatchAPI] DEBUG body_text length:', bodyText?.length || 0);
    aiLogger.debug('[BatchAPI] DEBUG body_html length:', bodyHtml?.length || 0);

    if ((!bodyText || bodyText.trim().length < 20) && bodyHtml && bodyHtml.length > 0) {
      aiLogger.debug('[BatchAPI] body_text empty/short, extracting from HTML...');
      bodyText = stripHtmlTags(bodyHtml);
      aiLogger.debug('[BatchAPI] Extracted text length:', bodyText.length);
      aiLogger.debug('[BatchAPI] Extracted text preview:', bodyText.slice(0, 200));

      // Update email object for processing (don't save to DB here, just for this request)
      (email as Record<string, unknown>).body_text = bodyText;
    }

    aiLogger.debug('[BatchAPI] Final word count:', bodyText?.split(/\s+/).filter(w => w.length > 0).length || 0);

    // Step 6: Get allocation
    aiLogger.debug('[BatchAPI] Step 6 - Getting allocation...');
    const allocation = await getFeatureAllocationForEmail(user.id, email);
    aiLogger.debug('[BatchAPI] Step 6 - Allocation category:', allocation.category);
    aiLogger.debug('[BatchAPI] Step 6 - Auto features:', allocation.autoEnabledFeatures);
    aiLogger.debug('[BatchAPI] Step 6 - Available buttons:', allocation.availableButtons);

    // Collect existing results from database (cached)
    const existingResults: Record<string, FeatureResultWithMeta> = {};

    if (email.summary) {
      existingResults.summary = {
        status: 'success',
        data: email.summary,
        cost: 0,
        timeMs: 0,
        cached: true
      };
    }

    if (email.ai_suggestions) {
      const suggestions = email.ai_suggestions as Record<string, unknown>;

      if (suggestions.smart_replies || suggestions.smart_reply) {
        existingResults.smart_reply = {
          status: 'success',
          data: suggestions.smart_replies || suggestions.smart_reply,
          cost: 0,
          timeMs: 0,
          cached: true
        };
      }
      if (suggestions.action_items) {
        existingResults.action_items = {
          status: 'success',
          data: suggestions.action_items,
          cost: 0,
          timeMs: 0,
          cached: true
        };
      }
      if (suggestions.follow_up) {
        existingResults.follow_up = {
          status: 'success',
          data: suggestions.follow_up,
          cost: 0,
          timeMs: 0,
          cached: true
        };
      }
      if (suggestions.sentiment) {
        existingResults.sentiment = {
          status: 'success',
          data: suggestions.sentiment,
          cost: 0,
          timeMs: 0,
          cached: true
        };
      }
    }

    // Filter features that need to run (auto-enabled and not already cached)
    const featuresToRun = allocation.features
      .filter(f => f.isAutoEnabled && !existingResults[f.featureKey])
      .map(f => f.featureKey);

    // DEBUG: Log features to run
    aiLogger.debug('[BatchAPI] featuresToRun:', featuresToRun);
    aiLogger.debug('[BatchAPI] existingResults keys:', Object.keys(existingResults));

    // Run features in PARALLEL using Promise.allSettled
    const newResults: Record<string, FeatureResultWithMeta> = {};

    if (featuresToRun.length > 0) {
      const runner = getAIFeatureRunner();
      const service = getAIFeatureAllocationService();

      // DEBUG: Log registered executors
      aiLogger.debug('[BatchAPI] Registered executors:', runner.getRegisteredFeatures());

      // Create parallel promises
      const featurePromises = featuresToRun.map(async (featureKey): Promise<[AIFeatureKey, FeatureResultWithMeta]> => {
        const featureStartTime = Date.now();

        try {
          // Run the feature
          const result = await runner.runManualFeature(
            user.id,
            emailId,
            email as Record<string, unknown>,
            featureKey
          );

          const timeMs = Date.now() - featureStartTime;

          return [featureKey, {
            status: result.success ? 'success' : 'error',
            data: result.data,
            error: result.error,
            cost: result.cost,
            timeMs,
          }];
        } catch (error) {
          aiLogger.error(`Error running feature ${featureKey}:`, error);
          return [featureKey, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            cost: 0,
            timeMs: Date.now() - featureStartTime,
          }];
        }
      });

      // Wait for all features to complete (parallel)
      const settledResults = await Promise.allSettled(featurePromises);

      // Collect results
      for (const result of settledResults) {
        if (result.status === 'fulfilled') {
          const [key, value] = result.value;
          newResults[key] = value;
          aiLogger.debug(`[BatchAPI] Feature ${key} result:`, value.status, value.error || 'OK');
        } else {
          aiLogger.error('[BatchAPI] Promise rejected:', result.reason);
        }
      }

      // Save results to database
      const updateData: Record<string, unknown> = {};
      const aiSuggestions = (email.ai_suggestions as Record<string, unknown>) || {};

      for (const [featureKey, result] of Object.entries(newResults)) {
        if (result.status === 'success' && result.data) {
          if (featureKey === 'summary') {
            updateData.summary = result.data;
          } else {
            aiSuggestions[featureKey === 'smart_reply' ? 'smart_replies' : featureKey] = result.data;
          }
        }
      }

      if (Object.keys(aiSuggestions).length > 0) {
        updateData.ai_suggestions = aiSuggestions;
      }

      // Update features used
      const featuresUsed = [
        ...((email.ai_features_used as string[]) || []),
        ...Object.entries(newResults)
          .filter(([, r]) => r.status === 'success')
          .map(([k]) => k)
      ];
      updateData.ai_features_used = [...new Set(featuresUsed)];

      // Calculate total cost from new results
      const newCost = Object.values(newResults)
        .filter(r => r.status === 'success')
        .reduce((sum, r) => sum + (r.cost || 0), 0);

      if (newCost > 0) {
        updateData.ai_total_cost_usd = ((email.ai_total_cost_usd as number) || 0) + newCost;
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('emails')
          .update(updateData)
          .eq('id', emailId);
      }
    }

    // Merge existing + new results
    const allResults = { ...existingResults, ...newResults };

    // Get buttons that can still be triggered manually
    const availableButtons = allocation.features
      .filter(f => f.isButtonVisible && !f.isAutoEnabled && !allResults[f.featureKey])
      .map(f => f.featureKey);

    // Calculate totals
    const totalCost = Object.values(newResults)
      .reduce((sum, r) => sum + (r.cost || 0), 0);

    const totalTimeMs = Date.now() - startTime;

    const response = {
      emailId,
      allocation: {
        category: allocation.category,
        priority: allocation.priority,
        isVipSender: allocation.isVipSender,
        contentTriggers: allocation.contentTriggers,
      },
      results: allResults,
      availableButtons,
      totalCost,
      totalTimeMs,
      cached: featuresToRun.length === 0,
    };

    // Step 7: Return response
    aiLogger.debug('[BatchAPI] Step 7 - Success! Results count:', Object.keys(allResults).length);
    aiLogger.debug('[BatchAPI] === END (success) ===');

    return NextResponse.json(response);

  } catch (error) {
    aiLogger.error('[BatchAPI] === ERROR ===');
    aiLogger.error('[BatchAPI] Error type:', error?.constructor?.name);
    aiLogger.error('[BatchAPI] Error message:', error instanceof Error ? error.message : String(error));
    aiLogger.error('[BatchAPI] Error stack:', error instanceof Error ? error.stack : 'N/A');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
