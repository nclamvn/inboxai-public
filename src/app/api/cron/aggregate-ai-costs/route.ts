/**
 * POST /api/cron/aggregate-ai-costs
 * Cron job to aggregate daily AI costs
 * Run daily at midnight
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret (optional security)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    // Get all users with AI usage yesterday
    const { data: users } = await supabase
      .from('ai_feature_usage')
      .select('user_id')
      .gte('created_at', `${dateStr}T00:00:00Z`)
      .lt('created_at', `${dateStr}T23:59:59Z`);

    if (!users || users.length === 0) {
      return NextResponse.json({
        message: 'No usage to aggregate',
        date: dateStr,
      });
    }

    // Get unique user IDs
    const userIds = [...new Set(users.map(u => u.user_id))];

    // Aggregate for each user
    const results = [];
    for (const userId of userIds) {
      // Get usage data
      const { data: usage } = await supabase
        .from('ai_feature_usage')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', `${dateStr}T00:00:00Z`)
        .lt('created_at', `${dateStr}T23:59:59Z`);

      if (!usage || usage.length === 0) continue;

      // Calculate stats
      const totalEmails = new Set(usage.map(u => u.email_id)).size;
      const totalCost = usage.reduce((sum, u) => sum + parseFloat(u.api_cost_usd || '0'), 0);

      // Count by feature and trigger type
      const featureCounts: Record<string, { auto: number; manual: number; cost: number }> = {};
      for (const u of usage) {
        if (!featureCounts[u.feature_key]) {
          featureCounts[u.feature_key] = { auto: 0, manual: 0, cost: 0 };
        }
        if (u.trigger_type === 'manual') {
          featureCounts[u.feature_key].manual++;
        } else {
          featureCounts[u.feature_key].auto++;
        }
        featureCounts[u.feature_key].cost += parseFloat(u.api_cost_usd || '0');
      }

      // Estimate full cost (if all features were auto)
      const estimatedFullCost = totalEmails * 0.015; // ~$0.015 per email if all features

      // Upsert daily record
      await supabase.from('ai_cost_daily').upsert({
        user_id: userId,
        cost_date: dateStr,
        total_emails_processed: totalEmails,
        total_cost_usd: totalCost,
        estimated_full_cost_usd: estimatedFullCost,
        savings_usd: Math.max(0, estimatedFullCost - totalCost),
        summary_auto_count: featureCounts['summary']?.auto || 0,
        summary_manual_count: featureCounts['summary']?.manual || 0,
        smart_reply_auto_count: featureCounts['smart_reply']?.auto || 0,
        smart_reply_manual_count: featureCounts['smart_reply']?.manual || 0,
        action_items_auto_count: featureCounts['action_items']?.auto || 0,
        action_items_manual_count: featureCounts['action_items']?.manual || 0,
        follow_up_auto_count: featureCounts['follow_up']?.auto || 0,
        follow_up_manual_count: featureCounts['follow_up']?.manual || 0,
        sentiment_count: (featureCounts['sentiment']?.auto || 0) + (featureCounts['sentiment']?.manual || 0),
        translate_count: (featureCounts['translate']?.auto || 0) + (featureCounts['translate']?.manual || 0),
        cost_by_feature: featureCounts,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,cost_date',
      });

      results.push({
        userId,
        totalEmails,
        totalCost,
        savings: Math.max(0, estimatedFullCost - totalCost),
      });
    }

    return NextResponse.json({
      date: dateStr,
      usersProcessed: results.length,
      results,
    });

  } catch (error) {
    console.error('Error aggregating AI costs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
