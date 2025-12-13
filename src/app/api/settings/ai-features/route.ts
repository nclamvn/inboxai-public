/**
 * GET /api/settings/ai-features
 * Get user's AI feature settings
 *
 * PUT /api/settings/ai-features
 * Update user's AI feature settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAIFeatureAllocationService,
  AIFeatureKey,
  EmailCategory,
} from '@/lib/ai/feature-allocation';
import { AI_FEATURES_INFO } from '@/types/ai-features';

// GET: Get user's AI settings
export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getAIFeatureAllocationService();

    // Get user settings
    const settings = await service.getUserSettings(user.id);

    // Get default configs for all categories
    const { data: defaults } = await supabase
      .from('ai_feature_defaults')
      .select('category, feature_key, auto_enabled, button_visible, auto_condition, min_priority_for_auto')
      .order('category')
      .order('feature_key');

    // Get feature definitions
    const { data: features } = await supabase
      .from('ai_feature_definitions')
      .select('*')
      .eq('is_active', true);

    // Get usage stats (last 30 days)
    const usageStats = await service.getUsageStats(user.id, 30);

    return NextResponse.json({
      features: features || AI_FEATURES_INFO,
      defaults: defaults || [],
      userOverrides: settings.categoryConfigs,
      vipSenders: settings.vipSenders,
      customTriggers: settings.customTriggers,
      usageStats,
    });

  } catch (error) {
    console.error('Error getting AI settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: Update user's AI settings
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      category,
      featureKey,
      autoEnabled,
      buttonVisible
    } = body as {
      category?: EmailCategory | null;
      featureKey: AIFeatureKey;
      autoEnabled?: boolean | null;
      buttonVisible?: boolean | null;
    };

    if (!featureKey) {
      return NextResponse.json(
        { error: 'featureKey is required' },
        { status: 400 }
      );
    }

    const service = getAIFeatureAllocationService();
    await service.updateUserConfig(
      user.id,
      category || null,
      featureKey,
      autoEnabled ?? null,
      buttonVisible ?? null
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error updating AI settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Reset user's AI settings to defaults
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const category = url.searchParams.get('category') as EmailCategory | null;
    const featureKey = url.searchParams.get('featureKey') as AIFeatureKey | null;

    let query = supabase
      .from('ai_feature_user_config')
      .delete()
      .eq('user_id', user.id);

    if (category) {
      query = query.eq('category', category);
    }
    if (featureKey) {
      query = query.eq('feature_key', featureKey);
    }

    await query;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error resetting AI settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
