/**
 * GET /api/dashboard/stats
 * Consolidated dashboard statistics
 * Replaces multiple API calls with single request
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Execute all queries in parallel for maximum performance
    const [
      emailCountsResult,
      categoryCounts,
      recentActivity,
      aiUsageResult,
      unreadByPriority,
      sourceAccountsResult,
      followUpsResult,
    ] = await Promise.all([
      // Total email counts
      supabase
        .from('emails')
        .select('id, is_read, is_starred, is_archived, is_deleted')
        .eq('user_id', user.id),

      // Emails by category (active only)
      supabase
        .from('emails')
        .select('category')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .eq('is_archived', false),

      // Recent activity (last 7 days)
      supabase
        .from('emails')
        .select('id, received_at')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .gte('received_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('received_at', { ascending: false }),

      // AI usage this month
      supabase
        .from('ai_feature_usage')
        .select('feature_key, cost_usd')
        .eq('user_id', user.id)
        .gte('created_at', new Date(new Date().setDate(1)).toISOString()),

      // Unread by priority
      supabase
        .from('emails')
        .select('priority')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .eq('is_deleted', false)
        .eq('is_archived', false),

      // Source accounts summary
      supabase
        .from('source_accounts')
        .select('id, email_address, provider, is_active, last_sync_at, total_emails_synced')
        .eq('user_id', user.id),

      // Pending follow-ups
      supabase
        .from('follow_ups')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('status', 'pending'),
    ]);

    // Process email counts
    const emails = emailCountsResult.data || [];
    const emailStats = {
      total: emails.filter(e => !e.is_deleted).length,
      unread: emails.filter(e => !e.is_read && !e.is_deleted && !e.is_archived).length,
      starred: emails.filter(e => e.is_starred && !e.is_deleted).length,
      archived: emails.filter(e => e.is_archived && !e.is_deleted).length,
      trash: emails.filter(e => e.is_deleted).length,
    };

    // Process category counts
    const categoryData = categoryCounts.data || [];
    const categoryStats: Record<string, number> = {};
    categoryData.forEach(e => {
      const cat = e.category || 'uncategorized';
      categoryStats[cat] = (categoryStats[cat] || 0) + 1;
    });

    // Process recent activity (group by day)
    const activityData = recentActivity.data || [];
    const dailyActivity: Record<string, number> = {};
    activityData.forEach(e => {
      const day = new Date(e.received_at).toISOString().split('T')[0];
      dailyActivity[day] = (dailyActivity[day] || 0) + 1;
    });

    // Process AI usage
    const aiData = aiUsageResult.data || [];
    const aiStats = {
      totalRequests: aiData.length,
      totalCost: Math.round(aiData.reduce((sum, u) => sum + (u.cost_usd || 0), 0) * 100) / 100,
      byFeature: aiData.reduce((acc, u) => {
        acc[u.feature_key] = (acc[u.feature_key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    // Process priority stats
    const priorityData = unreadByPriority.data || [];
    const priorityStats = {
      urgent: priorityData.filter(e => (e.priority || 0) >= 4).length,
      high: priorityData.filter(e => (e.priority || 0) === 3).length,
      normal: priorityData.filter(e => (e.priority || 0) === 2).length,
      low: priorityData.filter(e => (e.priority || 0) <= 1).length,
    };

    // Process source accounts
    const accountsData = sourceAccountsResult.data || [];
    const accountStats = {
      total: accountsData.length,
      active: accountsData.filter(a => a.is_active).length,
      totalSynced: accountsData.reduce((sum, a) => sum + (a.total_emails_synced || 0), 0),
      accounts: accountsData.map(a => ({
        email: a.email_address,
        provider: a.provider,
        isActive: a.is_active,
        lastSync: a.last_sync_at,
        emailsSynced: a.total_emails_synced || 0,
      })),
    };

    // Process follow-ups
    const followUpsData = followUpsResult.data || [];
    const followUpStats = {
      pending: followUpsData.length,
    };

    const duration = Date.now() - startTime;

    // Set cache headers - short cache for real-time feel
    const response = NextResponse.json({
      emails: emailStats,
      categories: categoryStats,
      activity: dailyActivity,
      ai: aiStats,
      priority: priorityStats,
      accounts: accountStats,
      followUps: followUpStats,
      meta: {
        generatedAt: new Date().toISOString(),
        duration: `${duration}ms`,
      },
    });

    response.headers.set(
      'Cache-Control',
      'private, s-maxage=30, stale-while-revalidate=60'
    );

    return response;

  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
