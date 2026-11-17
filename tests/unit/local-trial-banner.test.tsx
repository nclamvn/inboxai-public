// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LocalTrialBanner } from '@/components/layout/local-trial-banner'

afterEach(()=>{cleanup();vi.unstubAllEnvs()})
function fixture() {
  vi.stubEnv('INBOXAI_TEST_LOCAL_PILOT','1')
  vi.stubEnv('NEXT_PUBLIC_APP_URL','http://127.0.0.1:57300')
  vi.stubEnv('INBOXAI_LOCAL_PILOT_GUIDE','http://127.0.0.1:57343')
  vi.stubEnv('INBOXAI_LOCAL_PILOT_VERSION',JSON.stringify({commit:'38c4767',fingerprint:'123456abcdef'}))
}
it('identifies the built fixture without exposing fixture credentials',()=>{
  fixture();render(<LocalTrialBanner />)
  expect(screen.getByLabelText('Bản dùng thử local').getAttribute('data-pilot-version')).toBe('123456abcdef')
  expect(screen.getByRole('link').getAttribute('href')).toBe('http://127.0.0.1:57343')
  expect(screen.queryByText(/password|service_role|Synthetic-passphrase/i)).toBeNull()
})
it.each(['https://inbox.example.test','http://127.0.0.1.evil.example:57300'])('stays absent on non-fixture origins: %s',url=>{
  fixture();vi.stubEnv('NEXT_PUBLIC_APP_URL',url);const {container}=render(<LocalTrialBanner />);expect(container.textContent).toBe('')
})
it.each(['{broken','null','{"commit":"<script>","fingerprint":"123456abcdef"}'])('rejects malformed build metadata: %s',version=>{
  fixture();vi.stubEnv('INBOXAI_LOCAL_PILOT_VERSION',version);const {container}=render(<LocalTrialBanner />);expect(container.textContent).toBe('')
})
it('does not enable the trial banner in the normal app',()=>{
  fixture();vi.stubEnv('INBOXAI_TEST_LOCAL_PILOT','0');const {container}=render(<LocalTrialBanner />);expect(container.textContent).toBe('')
})
