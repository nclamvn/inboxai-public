import { expect, it, vi } from 'vitest'
import { registrationRateKeys } from '@/lib/auth/registration'

it('ignores caller-supplied forwarding chains by default', () => {
  vi.stubEnv('SIGNUP_RATE_LIMIT_KEY', 'synthetic-32-character-key-for-rate-limiting')
  vi.stubEnv('SIGNUP_TRUSTED_IP_HEADER', '')
  const a = registrationRateKeys(new Request('http://localhost', { headers: { 'x-forwarded-for': '1.2.3.4' } }), 'alice@example.test')
  const b = registrationRateKeys(new Request('http://localhost', { headers: { 'x-forwarded-for': '5.6.7.8' } }), 'alice@example.test')
  expect(a).toEqual(b)
  expect(JSON.stringify(a)).not.toContain('alice@example.test')
})
it('accepts only a configured single-IP trusted header', () => {
  vi.stubEnv('SIGNUP_RATE_LIMIT_KEY', 'synthetic-32-character-key-for-rate-limiting')
  vi.stubEnv('SIGNUP_TRUSTED_IP_HEADER', 'cf-connecting-ip')
  const a = registrationRateKeys(new Request('http://localhost', { headers: { 'cf-connecting-ip': '1.2.3.4' } }), 'alice@example.test')
  const b = registrationRateKeys(new Request('http://localhost', { headers: { 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' } }), 'alice@example.test')
  expect(a.p_ip_key).not.toBe(b.p_ip_key)
})
