import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface AISettings {
  sender_reputation_threshold: number
  sender_reputation_enabled: boolean
  phishing_score_threshold: number
  phishing_auto_spam: boolean
  low_confidence_threshold: number
  domain_weight_open: number
  domain_weight_reply: number
  domain_weight_archive: number
  domain_weight_delete: number
  domain_weight_spam: number
  domain_weight_phishing: number
}

/**
 * GET /api/admin/ai-settings
 * Get AI settings for the current user
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user-specific settings or global default
    const { data: settings } = await supabaseAdmin
      .from('ai_settings')
      .select('*')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()

    if (!settings) {
      // Return default settings
      return NextResponse.json({
        sender_reputation_threshold: 0.85,
        sender_reputation_enabled: true,
        phishing_score_threshold: 70,
        phishing_auto_spam: true,
        low_confidence_threshold: 0.6,
        domain_weight_open: 2,
        domain_weight_reply: 5,
        domain_weight_archive: 1,
        domain_weight_delete: -2,
        domain_weight_spam: -10,
        domain_weight_phishing: -20,
        is_default: true
      })
    }

    return NextResponse.json({
      ...settings,
      is_default: settings.user_id === null
    })
  } catch (error) {
    console.error('AI settings error:', error)
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 })
  }
}

/**
 * POST /api/admin/ai-settings
 * Update AI settings for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: Partial<AISettings> = await request.json()

    // Validate settings
    if (body.sender_reputation_threshold !== undefined) {
      if (body.sender_reputation_threshold < 0 || body.sender_reputation_threshold > 1) {
        return NextResponse.json({ error: 'sender_reputation_threshold must be between 0 and 1' }, { status: 400 })
      }
    }
    if (body.phishing_score_threshold !== undefined) {
      if (body.phishing_score_threshold < 0 || body.phishing_score_threshold > 100) {
        return NextResponse.json({ error: 'phishing_score_threshold must be between 0 and 100' }, { status: 400 })
      }
    }
    if (body.low_confidence_threshold !== undefined) {
      if (body.low_confidence_threshold < 0 || body.low_confidence_threshold > 1) {
        return NextResponse.json({ error: 'low_confidence_threshold must be between 0 and 1' }, { status: 400 })
      }
    }

    // Upsert user settings
    const { data, error } = await supabaseAdmin
      .from('ai_settings')
      .upsert({
        user_id: user.id,
        ...body,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to update settings:', error)
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      settings: data
    })
  } catch (error) {
    console.error('AI settings update error:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}

/**
 * DELETE /api/admin/ai-settings
 * Reset to global defaults (delete user-specific settings)
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await supabaseAdmin
      .from('ai_settings')
      .delete()
      .eq('user_id', user.id)

    return NextResponse.json({
      success: true,
      message: 'Settings reset to defaults'
    })
  } catch (error) {
    console.error('AI settings delete error:', error)
    return NextResponse.json({ error: 'Failed to reset settings' }, { status: 500 })
  }
}
