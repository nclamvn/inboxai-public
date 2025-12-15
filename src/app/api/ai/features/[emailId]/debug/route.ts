/**
 * GET /api/ai/features/[emailId]/debug
 * Debug endpoint to check AI feature status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params;

  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get email with AI-related fields
    const { data: email, error } = await supabase
      .from('emails')
      .select(`
        id,
        subject,
        category,
        priority,
        from_address,
        from_name,
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

    if (error || !email) {
      return NextResponse.json({
        error: 'Email not found',
        emailId,
        dbError: error?.message,
      }, { status: 404 });
    }

    // Check environment
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

    return NextResponse.json({
      status: 'ok',
      emailId,
      email: {
        id: email.id,
        subject: email.subject,
        category: email.category,
        priority: email.priority,
        from: email.from_address,
        fromName: email.from_name,
        bodyTextLength: email.body_text?.length || 0,
        bodyHtmlLength: email.body_html?.length || 0,
        hasSummary: !!email.summary,
        hasAiSuggestions: !!email.ai_suggestions,
        aiFeatures: email.ai_features_used || [],
        aiCost: email.ai_total_cost_usd || 0,
      },
      aiData: {
        summary: email.summary,
        suggestions: email.ai_suggestions,
      },
      config: {
        hasOpenAIKey,
        hasAnthropicKey,
        nodeEnv: process.env.NODE_ENV,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
