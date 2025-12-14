import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getTopDomains,
  getDomainStats,
  getDomainReputation,
  whitelistDomain,
  blacklistDomain,
  rebuildDomainReputation
} from '@/lib/ai/domain-reputation'

/**
 * GET /api/admin/domain-reputation
 * Get domain reputation data for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (domain) {
      // Get specific domain reputation
      const reputation = await getDomainReputation(user.id, domain)
      return NextResponse.json({ domain, ...reputation })
    } else {
      // Get top domains and stats
      const [topDomains, stats] = await Promise.all([
        getTopDomains(user.id, limit),
        getDomainStats(user.id)
      ])

      return NextResponse.json({
        stats,
        topDomains
      })
    }
  } catch (error) {
    console.error('Domain reputation error:', error)
    return NextResponse.json({ error: 'Failed to get domain reputation' }, { status: 500 })
  }
}

/**
 * POST /api/admin/domain-reputation
 * Manage domain reputation (whitelist, blacklist, rebuild)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, domain } = body

    switch (action) {
      case 'whitelist':
        if (!domain) {
          return NextResponse.json({ error: 'Domain required' }, { status: 400 })
        }
        await whitelistDomain(user.id, domain)
        return NextResponse.json({
          success: true,
          message: `Domain ${domain} whitelisted`
        })

      case 'blacklist':
        if (!domain) {
          return NextResponse.json({ error: 'Domain required' }, { status: 400 })
        }
        await blacklistDomain(user.id, domain)
        return NextResponse.json({
          success: true,
          message: `Domain ${domain} blacklisted`
        })

      case 'rebuild':
        const result = await rebuildDomainReputation(user.id)
        return NextResponse.json({
          success: true,
          message: 'Domain reputation rebuilt',
          processed: result.processed,
          domains: result.domains
        })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Domain reputation update error:', error)
    return NextResponse.json({ error: 'Failed to update domain reputation' }, { status: 500 })
  }
}
