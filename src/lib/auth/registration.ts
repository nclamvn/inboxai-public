import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const registrationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
  fullName: z.string().trim().min(1).max(120),
}).strict()
export const registrationEmailSchema = registrationSchema.pick({ email: true })
export const registrationEnabled = () => process.env.SIGNUP_ENABLED === 'true'

export function registrationAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function registrationRateKeys(request: Request, email: string) {
  const key = process.env.SIGNUP_RATE_LIMIT_KEY
  if (!key || key.length < 32) throw new Error('Registration rate key is not configured')
  // Only explicitly trusted, overwritten single-IP headers. Never trust X-Forwarded-For.
  const header = process.env.SIGNUP_TRUSTED_IP_HEADER
  const candidate = header === 'cf-connecting-ip' || header === 'x-real-ip'
    ? request.headers.get(header)?.trim() : undefined
  const ip = candidate && isIP(candidate) ? candidate : 'shared'
  const hash = (value: string) => createHmac('sha256', key).update(value).digest('hex')
  return { p_ip_key: hash(`ip:${ip}`), p_email_key: hash(`email:${email}`) }
}

export async function registrationAdmission(request: Request, email: string) {
  const admin = registrationAdmin()
  const { data: permitted, error: rateError } = await admin.rpc('consume_registration_attempt', registrationRateKeys(request, email))
  if (rateError || typeof permitted !== 'boolean') throw new Error('Registration throttle unavailable')
  if (!permitted) return NextResponse.json({ error: 'Vui lòng thử lại sau.' }, {
    status: 429, headers: { 'Retry-After': '3600', 'Cache-Control': 'no-store' },
  })
  const { data, error } = await admin.rpc('registration_admission', { p_email: email })
  if (error || !data || typeof data.allowed !== 'boolean' || typeof data.enabled !== 'boolean') {
    throw new Error('Registration policy unavailable')
  }
  if (!data.enabled) return NextResponse.json({ error: 'Đăng ký hiện chưa được mở.' }, { status: 503 })
  if (!data.allowed) return NextResponse.json({ error: 'Đăng ký hiện chưa khả dụng. Vui lòng đăng ký danh sách chờ.' }, { status: 403 })
  return null
}

/** Check Auth server configuration before signUp, not a deployment assertion. */
export async function requireEmailConfirmation(): Promise<boolean> {
  const response = await fetch(new URL('/auth/v1/settings', process.env.NEXT_PUBLIC_SUPABASE_URL), {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    cache: 'no-store', signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) return false
  const settings = await response.json()
  return settings.mailer_autoconfirm === false && settings.disable_signup === false && settings.external?.email === true
}
