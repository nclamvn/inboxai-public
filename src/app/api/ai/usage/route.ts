/**
 * GET /api/ai/usage
 * Get AI usage statistics and costs
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAIFeatureAllocationService } from '@/lib/ai/feature-allocation';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    const service = getAIFeatureAllocationService();
    const stats = await service.getUsageStats(user.id, days);

    // Get daily breakdown
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: dailyData } = await supabase
      .from('ai_cost_daily')
      .select('*')
      .eq('user_id', user.id)
      .gte('cost_date', startDate.toISOString().split('T')[0])
      .order('cost_date', { ascending: true });

    // Get recent feature usage
    const { data: recentUsage } = await supabase
      .from('ai_feature_usage')
      .select(`
        feature_key,
        trigger_type,
        api_cost_usd,
        created_at
      `)
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })
      .limit(100);

    return NextResponse.json({
      summary: stats,
      daily: dailyData || [],
      recentUsage: recentUsage || [],
    });

  } catch (error) {
    console.error('Error getting AI usage:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
