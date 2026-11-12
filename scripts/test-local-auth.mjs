import { createHmac, randomUUID } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { seedLegacySync,rehearseSync } from '../tests/local-auth/sync.mjs'
import { startSmtpWire } from '../tests/local-auth/smtp-wire.mjs'
import { startMailProvider, rehearseMailSend } from '../tests/local-auth/mail-send.mjs'
import { seedLegacyVault, rehearseVault, vaultKeys } from '../tests/local-auth/vault.mjs'

// Real local Auth/PostgREST/Next integration; fixed synthetic credentials only.
// Containers have no internet route and SMTP goes only to an internal capture sink.
const actionInbox = process.argv.includes('--action-inbox')
const design = actionInbox || process.argv.includes('--design')
const commitments = process.argv.includes('--commitment-ledger')
const commitmentUi = process.argv.includes('--commitment-ui')
const commitmentDetection = process.argv.includes('--commitment-detection')
const askInbox = process.argv.includes('--ask-inbox')
const askAnswer = process.argv.includes('--ask-answer')
const operator = process.argv.includes('--operator')
const operatorOutcomes = process.argv.includes('--operator-outcomes')
const m6Baseline = process.argv.includes('--m6a-baseline')
const m6 = m6Baseline || process.argv.includes('--m6a')
const m6Native = m6 && process.argv.includes('--native-shells')
const staging = process.argv.includes('--m6b')
const productionMode = m6 || staging
const evidenceFile = staging ? 'docs/phase-2/evidence/m6b-run.json'
  : m6 ? `docs/phase-2/evidence/m6a-${m6Baseline ? 'baseline' : m6Native ? 'native-run' : 'browser-run'}.json`
  : operatorOutcomes ? 'docs/phase-2/evidence/m5b-browser-run.json'
  : operator ? 'docs/phase-2/evidence/m5a-browser-run.json'
  : askAnswer ? 'docs/phase-2/evidence/m4b-browser-run.json'
  : askInbox ? 'docs/phase-2/evidence/m4a-browser-run.json'
  : commitmentDetection ? 'docs/phase-2/evidence/m3c-browser-run.json'
  : commitmentUi ? 'docs/phase-2/evidence/m3b-browser-run.json'
  : commitments ? 'docs/phase-2/evidence/m3a-local-auth.json'
  : actionInbox ? 'docs/phase-2/evidence/m2b-browser-run.json'
  : design ? 'docs/phase-2/evidence/m2a-browser-run.json' : 'docs/phase-2/evidence/m1c-local-auth.json'
const compose = ['compose', '-p', staging ? 'inboxai-m6b-local' : 'inboxai-m0e-local', '-f', 'tests/local-auth/compose.yml',
  ...(staging ? ['-f', 'tests/local-auth/staging.compose.yml'] : [])]
let dockerContext = []
const dockerEnv = staging ? Object.fromEntries(['PATH','HOME','LANG','TMPDIR'].filter(key => process.env[key]).map(key => [key,process.env[key]])) : process.env
const docker = (args, options) => execFileSync('docker', [...dockerContext, ...compose, ...args],
  { env: dockerEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 90_000, ...options })
const sql = source => docker(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'inboxai_security_test',
  '-X', '-v', 'ON_ERROR_STOP=1', '-At'], { input: source })
const secret = staging ? 'inboxai-m6b-synthetic-only-jwt-secret' : 'synthetic-local-jwt-secret-at-least-32-characters'
const token = role => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`
}
const anon = token('anon'), service = token('service_role')
const ports = staging ? { proxy: 56321, app: 56300, auth: 56999, rest: 56400, mail: 56825 }
  : { proxy: 55321, app: 55300, auth: 55999, rest: 55400, mail: 55825 }
const base = 'http://127.0.0.1:' + ports.proxy, app = 'http://127.0.0.1:' + ports.app
const loopbackFetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input)
  assert.equal(url.hostname, '127.0.0.1', 'test attempted non-loopback fetch')
  return fetch(input, { ...init, ...(staging && { redirect: 'manual' }), signal: init?.signal ?? AbortSignal.timeout(10_000) })
}
const admin = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: loopbackFetch } })
const outcomes = []
const record = (name, condition) => { assert.ok(condition, name); outcomes.push({ name, status: 'PASS' }); console.log(`PASS: ${name}`) }
let started = false, next, proxy, nativeFixture, mailProvider, smtpWire, rehearsal
let useRecovery = false
const briefingReads = []
const cookies = new Map()
const appFetch = async (path, init = {}) => {
  const headers = new Headers(init.headers)
  if (cookies.size) headers.set('cookie', [...cookies].map(([k,v]) => `${k}=${v}`).join('; '))
  const response = await loopbackFetch(`${app}${path}`, { ...init, headers, redirect: 'manual' })
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0], index = pair.indexOf('=')
    cookies.set(pair.slice(0,index), pair.slice(index+1))
  }
  return response
}
async function waitFor(url, predicate = r => r.ok) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    try { const response = await loopbackFetch(url); if (await predicate(response)) return } catch {}
    await delay(500)
  }
  throw new Error(`Local service did not become ready: ${new URL(url).port}`)
}
try {
  // A failed future run must never leave a stale success report behind.
  rmSync(evidenceFile, { force:true })
  if (commitments) rmSync('docs/phase-2/evidence/m3a-sample-ledger.json', { force: true })
  const freeKB = Number(execFileSync('df', ['-Pk', '/'], { encoding: 'utf8' }).trim().split('\n').at(-1).split(/\s+/)[3])
  assert.ok(freeKB >= 10 * 1024 * 1024, 'less than 10 GiB free')
  if (staging) {
    assert.ok(['.env', '.env.local', '.env.production', '.env.production.local'].every(path => !existsSync(path)),
      'Staging requires a checkout without Next.js environment files')
    const context = execFileSync('docker', ['context','show'], { env: dockerEnv, encoding: 'utf8' }).trim()
    const endpoint = execFileSync('docker', ['context','inspect',context,'--format','{{.Endpoints.docker.Host}}'],
      { env: dockerEnv, encoding: 'utf8' }).trim()
    assert.match(endpoint, /^unix:\/\/\//, 'Staging requires a local Docker Unix socket')
    dockerContext = ['--context', context]
    const { createStagingRehearsal } = await import('../tests/local-auth/staging.mjs')
    rehearsal = createStagingRehearsal({ docker, sql, record, loopbackFetch })
  }
  assert.equal(docker([...(staging ? ['--profile','recovery'] : []), 'ps', '-aq']).trim(), '', 'existing test project found; will not replace it')
  // Assert no unexpected external SMTP configuration can enter this fixture.
  const config = JSON.parse(docker([...(staging ? ['--profile','recovery'] : []), 'config', '--format', 'json']))
  assert.equal(config.services.auth.environment.GOTRUE_SMTP_HOST, 'mail')
  if (staging) rehearsal.assertIsolation(config)
  started = true
  docker(['up', '-d', '--pull', 'never', ...(staging ? ['--wait','--wait-timeout','60'] : [])])
  await waitFor(`http://127.0.0.1:${ports.auth}/health`)
  // Current Supabase helper contract; GoTrue's historical bootstrap migration
  // defines the legacy GUC-only uid helper. PostgREST 14 supplies JSON claims.
  sql(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;`)
  proxy = createServer((req,res) => {
    const auth = req.url.startsWith('/auth/v1/')
    const rest = req.url.startsWith('/rest/v1/')
    if (!auth && !rest) { res.writeHead(404); res.end(); return }
    const localCors = m6 && req.headers.origin === app
    const cors = { 'access-control-allow-origin': app, 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? '',
      'access-control-expose-headers': 'content-range, location', vary: 'Origin' }
    if (localCors && req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return }
    const upstream = httpRequest({ hostname: '127.0.0.1', port: useRecovery ? (auth ? 56998 : 56401) : (auth ? ports.auth : ports.rest),
      path: req.url.replace(auth ? '/auth/v1' : '/rest/v1', ''), method: req.method, headers: req.headers }, response => {
      if (m6 && rest && req.method === 'GET') {
        const url = new URL(req.url, base)
        if (url.pathname === '/rest/v1/emails' && url.searchParams.get('order') === 'received_at.desc'
          && url.searchParams.get('is_archived') === 'eq.false' && !url.searchParams.has('limit')) {
          const read = { bytes: 0, status: response.statusCode }
          briefingReads.push(read)
          response.on('data', chunk => { read.bytes += chunk.length })
        }
      }
      res.writeHead(response.statusCode, localCors ? { ...response.headers, ...cors } : response.headers); response.pipe(res)
    })
    upstream.on('error', () => { res.writeHead(502); res.end() })
    req.pipe(upstream)
  })
  await new Promise((resolve, reject) => proxy.once('error', reject).listen(ports.proxy, '127.0.0.1', resolve))
  const migrations = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
  for (const file of migrations.filter(f => f < '20261111010000')) sql(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  const { data: seed, error: seedError } = await admin.auth.admin.createUser({ email: 'preupgrade@example.test', password: 'Synthetic-passphrase-123', email_confirm: true })
  assert.equal(seedError, null)
  const previousId = seed.user.id
  if (staging) {
    seedLegacyVault(sql, previousId)
    seedLegacySync(sql, previousId)
    sql('UPDATE public.source_accounts SET is_active=false;')
    rehearsal.beforeUpgrade()
  }
  for (const file of migrations.filter(f => f >= '20261111010000')) {
    if (!staging && file === '20261111020000_credential_vault.sql') seedLegacyVault(sql,previousId)
    if (!staging && file === '20261111030000_sync_contracts.sql') seedLegacySync(sql,previousId)
    if (actionInbox && file === '20261111050000_action_inbox.sql') {
      sql(`INSERT INTO public.emails(user_id,from_address,subject,body_text) VALUES('${previousId}','legacy@example.test','Priority before upgrade','Legacy body');`)
    }
    if (commitments && file === '20261111060000_commitment_ledger.sql') {
      sql(`INSERT INTO public.action_items(user_id,title) VALUES('${previousId}','Legacy task before ledger');`)
    }
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
  if (staging) rehearsal.checkUpgrade(migrations)
  record('upgrade preserves existing profile', Number(sql("SELECT count(*) FROM public.profiles WHERE email='preupgrade@example.test'")) === 1)
  const { error: blocked } = await createClient(base, anon).auth.signUp({ email: 'blocked@example.test', password: 'Synthetic-passphrase-123' })
  record('direct Auth API cannot bypass closed registration policy', Boolean(blocked))
  sql("UPDATE public.registration_policy SET enabled=true, max_users=100; NOTIFY pgrst, 'reload schema';")
  await delay(1000)
  if (!staging) {
    mailProvider = await startMailProvider()
    smtpWire = await startSmtpWire()
  }
  const nextEnv = { ...Object.fromEntries(['PATH','HOME','LANG','TMPDIR', ...(askInbox ? ['ASK_INBOX_MODEL_DIR'] : [])]
        .filter(key => process.env[key]).map(key => [key,process.env[key]])),
      ...(staging ? { CRON_SECRET: rehearsal.cronSecret } : { INBOXAI_TEST_GMAIL_URL: mailProvider.url, NODE_EXTRA_CA_CERTS: smtpWire.cert }),
      NODE_ENV: productionMode ? 'production' : 'development', NEXT_PUBLIC_SUPABASE_URL: base, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service, NEXT_PUBLIC_APP_URL: app, SIGNUP_ENABLED: 'true',
      SIGNUP_RATE_LIMIT_KEY: 'synthetic-local-registration-key-at-least-32-characters',
      CREDENTIAL_VAULT_KEYS:vaultKeys,CREDENTIAL_VAULT_ACTIVE_KEY:'local1',
      OPENAI_API_KEY: 'sk-synthetic', RESEND_API_KEY: 're_synthetic', NEXT_TELEMETRY_DISABLED: '1' }
  const nextCommand = ['--import', staging ? './tests/local-auth/staging-network.mjs' : './tests/local-auth/mail-network.mjs', 'node_modules/next/dist/bin/next']
  if (productionMode) execFileSync(process.execPath, [...nextCommand, 'build'], { env: nextEnv, stdio: 'inherit' })
  if (m6Native) {
    const { startNativeFixture } = await import('../tests/local-auth/native-shell.mjs')
    nativeFixture = await startNativeFixture(cookies)
  }
  next = spawn(process.execPath, [...nextCommand, productionMode ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', String(m6Native ? 55301 : ports.app)], {
    env: nextEnv,
    stdio: ['ignore','pipe','pipe'],
  })
  let output = ''
  next.stdout.on('data', chunk => { output = (output + chunk).slice(-10000) })
  next.stderr.on('data', chunk => { output = (output + chunk).slice(-10000) })
  await waitFor(`${app}/login`)
  const email = 'verified@example.test', password = 'Synthetic-passphrase-123'
  const response = await appFetch('/api/signup-whitelist', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ email,password,fullName:'Synthetic Verified' }) })
  if (response.status !== 202) throw new Error(`Next signup returned ${response.status}: ${await response.text()}\n${output}`)
  record('Next signup requires email verification', (await response.json()).requires_email_verification === true)
  record('signup sets no authenticated access-token cookie', ![...cookies].some(([k,v]) => k.includes('auth-token') && !k.includes('code-verifier') && v))
  const unauthenticated = await appFetch('/api/admin/whitelist')
  record('unverified signup has no admin access', unauthenticated.status === 403)
  const login = createClient(base, anon, { auth: { persistSession:false,autoRefreshToken:false } })
  record('password login rejected before verification', Boolean((await login.auth.signInWithPassword({ email,password })).error))
  let link
  for (let attempt = 0; attempt < 30 && !link; attempt++) {
    const listing = await (await loopbackFetch(`http://127.0.0.1:${ports.mail}/api/v1/messages`)).json()
    for (const message of listing.messages ?? []) {
      const content = await (await loopbackFetch(`http://127.0.0.1:${ports.mail}/api/v1/message/${message.ID}`)).json()
      if (!(content.To ?? []).some(to => to.Address === email)) continue
      link = content.HTML?.match(new RegExp(`href="(${base.replaceAll('.', '\\.')}[^"<>]+)"`))?.[1]?.replaceAll('&amp;','&')
    }
    if (!link) await delay(200)
  }
  assert.ok(link, 'verification message absent from internal mail sink')
  assert.equal(new URL(link).pathname, '/auth/v1/verify', 'unexpected verification path')
  const confirmation = await loopbackFetch(link, { redirect:'manual' })
  assert.ok(confirmation.headers.get('location'), `confirmation returned ${confirmation.status} without redirect`)
  const callback = new URL(confirmation.headers.get('location'))
  assert.equal(callback.origin, app)
  assert.equal(callback.pathname, '/auth/callback', 'confirmation has unexpected callback path')
  const sessionResponse = await appFetch(`${callback.pathname}${callback.search}`)
  if (sessionResponse.status !== 307 || sessionResponse.headers.get('location') !== `${app}/inbox`) {
    const location = sessionResponse.headers.get('location')
    console.log('Callback diagnostic:', { status: sessionResponse.status, destination: location ? new URL(location).pathname : null,
      cookieNames: [...cookies.keys()], authErrors: output.split('\n').filter(line => line.includes('Auth callback exchange failed')) })
  }
  record('PKCE email callback creates a verified session', sessionResponse.status === 307 && sessionResponse.headers.get('location') === `${app}/inbox`)
  record('verified admitted user can open the inbox page', (await appFetch('/inbox')).status === 200)
  const signedIn = await login.auth.signInWithPassword({ email,password })
  assert.equal(signedIn.error, null)
  const userId = signedIn.data.user.id
  record('non-admin verified user cannot access global whitelist', (await appFetch('/api/admin/whitelist')).status === 403)
  const ownEmailId = randomUUID(), otherEmailId = randomUUID()
  sql(`INSERT INTO public.emails(id,user_id,from_address) VALUES('${ownEmailId}','${userId}','synthetic@example.test'),('${otherEmailId}','${previousId}','synthetic@example.test');`)
  const own = await login.from('emails').select('id')
  record('real PostgREST JWT/RLS returns only own email', !own.error && own.data.length === 1 && own.data[0].id === ownEmailId)
  const anonymousClient = createClient(base, anon, { auth: { persistSession:false,autoRefreshToken:false }, global: { fetch: loopbackFetch } })
  const anonymous = await anonymousClient.from('emails').select('id')
  record('anonymous PostgREST cannot read tenant email', !anonymous.error && anonymous.data.length === 0)
  assert.equal((await admin.auth.admin.updateUserById(userId, { app_metadata: { role:'admin' } })).error, null)
  record('server-provisioned admin role grants whitelist access', (await appFetch('/api/admin/whitelist')).status === 200)
  assert.equal((await admin.auth.admin.updateUserById(userId, { app_metadata: { role:'user' } })).error, null)
  record('admin revocation is enforced on the next request', (await appFetch('/api/admin/whitelist')).status === 403)
  sql("UPDATE public.registration_policy SET enabled=false;")
  record('closed policy rejects subsequent Next signups', (await appFetch('/api/signup-whitelist', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:'later@example.test',password,fullName:'Later'}) })).status === 503)
  if (staging) {
    await rehearsal.verify({ app, appFetch, admin, login, anonymous: anonymousClient, userId, previousId, ownEmailId, otherEmailId, email, password,
      selectRecovery: () => { useRecovery = true }, appLog: () => output })
  } else if (m6) {
    sql(`DELETE FROM public.emails WHERE id='${ownEmailId}' AND user_id='${userId}';`)
    const { rehearsePlatform } = await import('../tests/design/platform.mjs')
    await rehearsePlatform({ app, appFetch, cookies, admin, userId, record, briefingReads, baseline: m6Baseline, nativeFixture })
  } else if (operatorOutcomes || operator) {
    const foreignLogin = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const foreignSession = await foreignLogin.auth.signInWithPassword({ email: 'preupgrade@example.test', password })
    assert.equal(foreignSession.error, null)
    const { rehearseOperator } = operatorOutcomes ? await import('../tests/design/operator-outcomes.mjs') : await import('../tests/design/operator.mjs')
    await rehearseOperator({ app, appFetch, cookies, admin, userId, foreignId: previousId,
      foreignToken: foreignSession.data.session.access_token, loopbackFetch, record })
  } else if (askAnswer) {
    const foreignLogin = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const foreignSession = await foreignLogin.auth.signInWithPassword({ email: 'preupgrade@example.test', password })
    assert.equal(foreignSession.error, null)
    const { rehearseAskAnswer } = await import('../tests/design/ask-answer.mjs')
    await rehearseAskAnswer({ app, appFetch, cookies, admin, login, userId, foreignId: previousId,
      foreignToken: foreignSession.data.session.access_token, loopbackFetch, record })
  } else if (askInbox) {
    const foreignLogin = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const foreignSession = await foreignLogin.auth.signInWithPassword({ email: 'preupgrade@example.test', password })
    assert.equal(foreignSession.error, null)
    const { rehearseAskInbox } = await import('../tests/design/ask-inbox.mjs')
    await rehearseAskInbox({ app, appFetch, cookies, admin, userId, foreignId: previousId,
      foreignToken: foreignSession.data.session.access_token, loopbackFetch, record })
  } else if (commitmentDetection) {
    const legacyLogin = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const foreignSession = await legacyLogin.auth.signInWithPassword({ email: 'preupgrade@example.test', password })
    assert.equal(foreignSession.error, null)
    const { rehearseCommitmentDetection } = await import('../tests/design/detections.mjs')
    await rehearseCommitmentDetection({ app, appFetch, cookies, admin, userId, foreignId: previousId,
      foreignToken: foreignSession.data.session.access_token, loopbackFetch, record })
  } else if (commitmentUi) {
    const { rehearseCommitmentUi } = await import('../tests/design/commitments.mjs')
    await rehearseCommitmentUi({ app, appFetch, cookies, admin, userId, record })
  } else if (commitments) {
    const legacyLogin = createClient(base, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const legacySession = await legacyLogin.auth.signInWithPassword({ email: 'preupgrade@example.test', password })
    assert.equal(legacySession.error, null)
    const { rehearseCommitments } = await import('../tests/local-auth/commitment-ledger.mjs')
    const sample = await rehearseCommitments({ app, appFetch, loopbackFetch, admin, sql, login, anonymous: createClient(base, anon),
      foreignToken: legacySession.data.session.access_token, userId, ownEmailId, otherEmailId, record })
    writeFileSync('docs/phase-2/evidence/m3a-sample-ledger.json', JSON.stringify(sample, null, 2) + '\n')
  } else if (design) {
    if (actionInbox) {
      const { rehearsePriorityRpc } = await import('../tests/local-auth/action-inbox.mjs')
      await rehearsePriorityRpc({ login, anonymous: createClient(base, anon), sql, appFetch, ownEmailId, otherEmailId, record })
    }
    sql(`DELETE FROM public.emails WHERE id='${ownEmailId}' AND user_id='${userId}';`)
    const { rehearseDesign } = await import('../tests/design/browser.mjs')
    await rehearseDesign({ app, cookies, admin, userId, record, actionInbox })
  } else {
    const legacyLogin = createClient(base, anon, { auth:{persistSession:false,autoRefreshToken:false} })
    assert.equal((await legacyLogin.auth.signInWithPassword({email:'preupgrade@example.test',password})).error,null)
    await rehearseVault({sql,admin,login:legacyLogin,anonymous:createClient(base,anon),userId:previousId,otherUserId:userId,base,service,record})
    await rehearseSync({sql,admin,login:legacyLogin,anonymous:createClient(base,anon),userId:previousId,otherUserId:userId,record})
    await rehearseMailSend({ sql, admin, login, anonymous:createClient(base,anon), userId, otherUserId:previousId, record, appFetch, fixture:mailProvider, smtpWire })
  }
  const provenance = staging ? 'Local staging and independent PostgreSQL recovery, GoTrue, PostgREST and production-mode Next on synthetic data'
    : m6Native ? 'Native simulator WebViews against production-mode local Next, GoTrue and PostgREST on synthetic mail'
    : m6 ? 'Production-mode Next locally with Chromium, GoTrue, PostgREST and PostgreSQL on synthetic mail'
    : operatorOutcomes ? 'Local Chromium, authenticated Next/PostgREST/PostgreSQL, real local state verification and undo on synthetic mail'
    : operator ? 'Local Chromium and authenticated Next/PostgREST/PostgreSQL with actual in-database Operator actions on synthetic mail'
    : askAnswer ? 'Local Chromium and authenticated Next/PostgREST/PostgreSQL with deterministic synthesis of synthetic mail'
    : askInbox ? 'Local Chromium and authenticated Next/PostgREST/PostgreSQL with real local E5 embeddings and synthetic mail'
    : commitmentDetection ? 'Local Chromium, Next, GoTrue, PostgREST and PostgreSQL with synthetic commitment sources'
    : commitmentUi ? 'Authenticated local Chromium and real ledger API with synthetic mail only'
    : commitments ? 'Local Next/GoTrue/PostgREST/PostgreSQL, synthetic mail and .test accounts'
    : design ? 'Authenticated local Chromium with synthetic mail, loopback only'
    : 'Real local GoTrue/PostgREST/Next; synthetic Gmail/IMAP readers and loopback Gmail HTTP/SMTP TLS send; internal verification SMTP sink; .test identities; not hosted/provider interoperability'
  writeFileSync(evidenceFile, JSON.stringify({ date: new Date().toISOString(), provenance, images:{ auth:'supabase/gotrue:v2.197.0',rest:'postgrest/postgrest:v14.18',mail:'axllent/mailpit:v1.28.1',db:'postgres:16' }, ...rehearsal?.evidence, outcomes },null,2)+'\n')
} finally {
  if (next && next.exitCode === null) {
    next.kill('SIGTERM')
    await Promise.race([new Promise(resolve => next.once('exit', resolve)), delay(5000).then(() => next.kill('SIGKILL'))])
  }
  if (mailProvider) await mailProvider.close()
  if (smtpWire) await smtpWire.close()
  if (nativeFixture) await nativeFixture.close()
  if (proxy) await new Promise(resolve => { proxy.close(resolve); proxy.closeAllConnections() })
  rehearsal?.close()
  if (started) docker([...(staging ? ['--profile','recovery'] : []), 'down'])
}
