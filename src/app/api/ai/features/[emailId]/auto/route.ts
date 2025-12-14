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

interface FeatureResultWithMeta {
  status: 'success' | 'error';
  data?: unknown;
  error?: string;
  cost: number;
  timeMs: number;
  cached?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const startTime = Date.now();

  try {
    // Ensure AI module is initialized
    await ensureAIModuleInitialized();

    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emailId } = await params;

    // Get email data
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

    if (emailError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Get allocation
    const allocation = await getFeatureAllocationForEmail(user.id, email);

    // DEBUG: Log allocation
    console.log('[BatchAPI] email.category:', email.category);
    console.log('[BatchAPI] allocation:', JSON.stringify(allocation, null, 2));

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

    // Run features in PARALLEL using Promise.allSettled
    const newResults: Record<string, FeatureResultWithMeta> = {};

    if (featuresToRun.length > 0) {
      const runner = getAIFeatureRunner();
      const service = getAIFeatureAllocationService();

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
          console.error(`Error running feature ${featureKey}:`, error);
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

    // DEBUG: Log final response
    console.log('[BatchAPI] Final response:', JSON.stringify(response, null, 2));

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error running batch AI features:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
