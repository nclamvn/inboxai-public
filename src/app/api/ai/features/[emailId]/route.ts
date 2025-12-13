/**
 * GET /api/ai/features/[emailId]
 * Get AI feature allocation for a specific email
 *
 * POST /api/ai/features/[emailId]
 * Trigger a specific AI feature manually
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getFeatureAllocationForEmail,
  AIFeatureKey,
} from '@/lib/ai/feature-allocation';
import { getAIFeatureRunner } from '@/lib/ai/feature-runner';

// GET: Get feature allocation for email
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  try {
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
        ai_features_enabled,
        ai_features_available,
        ai_features_used
      `)
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single();

    if (emailError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Get allocation
    const allocation = await getFeatureAllocationForEmail(user.id, email);

    // Get existing AI results if already processed
    const existingResults: Record<string, unknown> = {};

    if (email.summary) {
      existingResults.summary = email.summary;
    }
    if (email.ai_suggestions) {
      const suggestions = email.ai_suggestions as Record<string, unknown>;
      if (suggestions.smart_replies) {
        existingResults.smart_reply = suggestions.smart_replies;
      }
      if (suggestions.action_items) {
        existingResults.action_items = suggestions.action_items;
      }
      if (suggestions.follow_up) {
        existingResults.follow_up = suggestions.follow_up;
      }
      if (suggestions.sentiment) {
        existingResults.sentiment = suggestions.sentiment;
      }
    }

    return NextResponse.json({
      emailId,
      allocation,
      existingResults,
      featuresUsed: email.ai_features_used || [],
    });

  } catch (error) {
    console.error('Error getting AI features:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Trigger a specific AI feature
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emailId } = await params;
    const body = await request.json();
    const { featureKey } = body as { featureKey: AIFeatureKey };

    if (!featureKey) {
      return NextResponse.json(
        { error: 'featureKey is required' },
        { status: 400 }
      );
    }

    // Validate feature key
    const validFeatures: AIFeatureKey[] = [
      'summary', 'smart_reply', 'action_items', 'follow_up', 'sentiment', 'translate'
    ];
    if (!validFeatures.includes(featureKey)) {
      return NextResponse.json(
        { error: 'Invalid feature key' },
        { status: 400 }
      );
    }

    // Get email data
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single();

    if (emailError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    // Run the feature
    const runner = getAIFeatureRunner();
    const result = await runner.runManualFeature(
      user.id,
      emailId,
      email,
      featureKey
    );

    // Update email with new AI result if successful
    if (result.success && result.data) {
      const updateData: Record<string, unknown> = {};

      if (featureKey === 'summary') {
        updateData.summary = result.data;
      } else {
        // Update ai_suggestions JSONB
        const currentSuggestions = (email.ai_suggestions as Record<string, unknown>) || {};
        updateData.ai_suggestions = {
          ...currentSuggestions,
          [featureKey]: result.data,
        };
      }

      // Add to features_used array
      const featuresUsed = (email.ai_features_used as string[]) || [];
      if (!featuresUsed.includes(featureKey)) {
        updateData.ai_features_used = [...featuresUsed, featureKey];
      }

      await supabase
        .from('emails')
        .update(updateData)
        .eq('id', emailId);
    }

    return NextResponse.json({
      featureKey,
      result,
    });

  } catch (error) {
    console.error('Error running AI feature:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
