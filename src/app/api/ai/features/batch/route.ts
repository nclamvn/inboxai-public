/**
 * POST /api/ai/features/batch
 * Run auto-enabled AI features for multiple emails
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getFeatureAllocationForEmail,
} from '@/lib/ai/feature-allocation';
import { getAIFeatureRunner } from '@/lib/ai/feature-runner';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { emailIds } = body as { emailIds: string[] };

    if (!emailIds || !Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json(
        { error: 'emailIds array is required' },
        { status: 400 }
      );
    }

    // Limit batch size
    const maxBatchSize = 10;
    const idsToProcess = emailIds.slice(0, maxBatchSize);

    // Get emails
    const { data: emails, error: emailsError } = await supabase
      .from('emails')
      .select('*')
      .in('id', idsToProcess)
      .eq('user_id', user.id);

    if (emailsError || !emails) {
      return NextResponse.json({ error: 'Emails not found' }, { status: 404 });
    }

    const runner = getAIFeatureRunner();
    const results = [];

    for (const email of emails) {
      // Get allocation
      const allocation = await getFeatureAllocationForEmail(user.id, email);

      // Run auto features
      const runResult = await runner.runAutoFeatures(
        user.id,
        email.id,
        email,
        allocation
      );

      // Update email with results
      const updateData: Record<string, unknown> = {
        ai_features_enabled: allocation.autoEnabledFeatures,
        ai_features_available: allocation.availableButtons,
      };

      const currentSuggestions = (email.ai_suggestions as Record<string, unknown>) || {};

      for (const featureResult of runResult.results) {
        if (featureResult.success && featureResult.data) {
          if (featureResult.featureKey === 'summary') {
            updateData.summary = featureResult.data;
          } else {
            updateData.ai_suggestions = {
              ...currentSuggestions,
              ...(updateData.ai_suggestions as Record<string, unknown> || {}),
              [featureResult.featureKey]: featureResult.data,
            };
          }
        }
      }

      // Update features used
      const featuresUsed = runResult.results
        .filter(r => r.success)
        .map(r => r.featureKey);

      if (featuresUsed.length > 0) {
        updateData.ai_features_used = featuresUsed;
        updateData.ai_total_cost_usd = runResult.totalCost;
      }

      await supabase
        .from('emails')
        .update(updateData)
        .eq('id', email.id);

      results.push({
        emailId: email.id,
        allocation,
        runResult,
      });
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });

  } catch (error) {
    console.error('Error running batch AI features:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
