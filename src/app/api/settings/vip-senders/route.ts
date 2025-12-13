/**
 * GET /api/settings/vip-senders
 * Get user's VIP senders list
 *
 * POST /api/settings/vip-senders
 * Add a VIP sender
 *
 * DELETE /api/settings/vip-senders
 * Remove a VIP sender
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAIFeatureAllocationService } from '@/lib/ai/feature-allocation';

// GET: Get VIP senders
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: vipSenders, error } = await supabase
      .from('ai_vip_senders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ vipSenders: vipSenders || [] });

  } catch (error) {
    console.error('Error getting VIP senders:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Add VIP sender
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      senderEmail,
      senderDomain,
      enableAllAi = true,
      priorityBoost = 1,
      notify = false,
    } = body;

    if (!senderEmail && !senderDomain) {
      return NextResponse.json(
        { error: 'Either senderEmail or senderDomain is required' },
        { status: 400 }
      );
    }

    const service = getAIFeatureAllocationService();
    await service.addVipSender(user.id, senderEmail, senderDomain, {
      enableAllAi,
      priorityBoost,
      notify,
    });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    // Handle duplicate key error
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json(
        { error: 'VIP sender already exists' },
        { status: 409 }
      );
    }

    console.error('Error adding VIP sender:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove VIP sender
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const senderEmail = url.searchParams.get('email');
    const senderDomain = url.searchParams.get('domain');
    const id = url.searchParams.get('id');

    if (!senderEmail && !senderDomain && !id) {
      return NextResponse.json(
        { error: 'email, domain, or id parameter is required' },
        { status: 400 }
      );
    }

    let query = supabase
      .from('ai_vip_senders')
      .delete()
      .eq('user_id', user.id);

    if (id) {
      query = query.eq('id', id);
    } else if (senderEmail) {
      query = query.eq('sender_email', senderEmail);
    } else if (senderDomain) {
      query = query.eq('sender_domain', senderDomain);
    }

    await query;

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error removing VIP sender:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
