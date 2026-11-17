import { Resolver } from 'node:dns/promises'
import tls from 'node:tls'

// Loaded only by the disposable Next test process. Gmail requests go to the local fixture.
const nativeFetch = globalThis.fetch
const journey = process.env.INBOXAI_TEST_JOURNEY === '1'
const fixture = journey ? null : new URL(process.env.INBOXAI_TEST_GMAIL_URL)
if (fixture && (fixture.hostname !== '127.0.0.1' || fixture.protocol !== 'http:')) throw new Error('Expected loopback Gmail fixture')
const database = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
const oauthFixture = process.env.INBOXAI_TEST_GOOGLE_OAUTH_URL && new URL(process.env.INBOXAI_TEST_GOOGLE_OAUTH_URL)
const pilotDatabase = process.env.INBOXAI_TEST_LOCAL_PILOT === '1' && database.origin === 'http://127.0.0.1:55321'
if (oauthFixture && ((!pilotDatabase && database.origin !== 'http://127.0.0.1:57321') || oauthFixture.hostname !== '127.0.0.1' ||
  oauthFixture.protocol !== 'http:')) throw new Error('Expected an isolated Google OAuth fixture')
if (journey && !['http://127.0.0.1:55321', 'http://127.0.0.1:57321'].includes(database.origin)) {
  throw new Error('Expected the journey database gateway')
}
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input)
  if(process.env.INBOXAI_LIVING_LOCAL==='1'&&url.origin==='http://127.0.0.1:57340'&&url.pathname==='/v1/chat/completions') {
    return nativeFetch(input,{...init,redirect:'error'})
  }
  if (oauthFixture && ((url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/token') ||
    (url.origin === 'https://www.googleapis.com' && url.pathname === '/oauth2/v2/userinfo') ||
    (url.origin === 'https://gmail.googleapis.com' && url.pathname.startsWith('/gmail/v1/users/me/')))) {
    const local = new URL(url.pathname + url.search, oauthFixture)
    return nativeFetch(input instanceof Request ? new Request(local, input) : local, { ...init, redirect: 'error' })
  }
  if (fixture && url.origin === 'https://gmail.googleapis.com' && url.pathname.startsWith('/gmail/v1/users/me/messages')) {
    const local = new URL(url.pathname + url.search, fixture)
    const request = input instanceof Request ? new Request(local, input) : local
    return nativeFetch(request, { ...init, redirect: 'error' })
  }
  if (journey && url.origin !== database.origin) throw new Error('Outbound fetch blocked in the local journey')
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') throw new Error('Non-loopback fetch blocked by local test')
  return nativeFetch(input, { ...init, redirect: 'error' })
}

// Simulate public DNS and route the exact validated TLS endpoint to the loopback fixture.
// The application keeps its production IP policy and verifies the original DNS name.
const smtpHost = 'smtp-wire.example.test'
const smtpIp = '93.184.216.34'
const smtpPort = Number(process.env.INBOXAI_TEST_SMTP_PORT)
if (!Number.isInteger(smtpPort) || smtpPort < 1024 || smtpPort > 65535) throw new Error('Expected a loopback SMTP fixture port')
Resolver.prototype.resolve4 = async host => {
  if (host !== smtpHost) throw new Error('DNS outside the SMTP fixture blocked')
  return [smtpIp]
}
Resolver.prototype.resolve6 = async () => { throw Object.assign(new Error('No fixture AAAA'), { code: 'ENODATA' }) }
const connectTls = tls.connect
tls.connect = (options, ...args) => {
  if (options?.host !== smtpIp || options.port !== 465 || options.servername !== smtpHost) {
    throw new Error('Unexpected TLS socket in the SMTP fixture')
  }
  return connectTls({ ...options, host: '127.0.0.1', port: smtpPort }, ...args)
}
