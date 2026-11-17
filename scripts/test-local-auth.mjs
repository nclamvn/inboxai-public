import { createHmac, randomUUID } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { seedLegacySync,rehearseSync } from '../tests/local-auth/sync.mjs'
import { startSmtpWire } from '../tests/local-auth/smtp-wire.mjs'
import { startMailProvider, rehearseMailSend } from '../tests/local-auth/mail-send.mjs'
import { seedLegacyVault, rehearseVault, vaultKeys } from '../tests/local-auth/vault.mjs'
import { googleClientId, googleClientSecret, startGoogleOAuthFixture } from '../tests/local-auth/google-oauth.mjs'

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
const m6c = process.argv.includes('--m6c')
const journeyPreview = process.argv.includes('--m6d-preview')
const dayPreview = process.argv.includes('--day-preview')
const dayTest = process.argv.includes('--day-test')
const pilotPreview = process.argv.includes('--pilot-preview')
const pilotTest = process.argv.includes('--pilot-test')
const pilot = pilotPreview || pilotTest
const livingReview = process.argv.includes('--living-review') || process.argv.includes('--living-review-preview')
const livingCoverage = process.argv.includes('--living-coverage') || process.argv.includes('--living-coverage-preview')
const livingTest = process.argv.includes('--living-review') || process.argv.includes('--living-test') || process.argv.includes('--living-coverage')
const livingPreview = process.argv.includes('--living-review-preview') || process.argv.includes('--living-preview') || process.argv.includes('--living-coverage-preview')
const living = livingTest || livingPreview
const day = dayPreview || dayTest
const interactivePreview = journeyPreview || dayPreview || pilotPreview || livingPreview
const warehouseCorrection = process.argv.includes('--warehouse-correction')
const purchaseRelease = process.argv.includes('--purchase-release')
const purchaseHandoff = purchaseRelease || process.argv.includes('--purchase-handoff')
const purchaseSupplements = process.argv.includes('--purchase-supplements')
const purchaseFocus = purchaseSupplements || process.argv.includes('--purchase-focus')
const purchaseBatches = process.argv.includes('--purchase-batches')
const purchaseExceptions = purchaseFocus || purchaseBatches || process.argv.includes('--purchase-exceptions')
const purchaseDues = purchaseExceptions || process.argv.includes('--purchase-dues')
const purchaseReturn = purchaseDues || process.argv.includes('--purchase-return')
const purchaseSettlement = purchaseReturn || process.argv.includes('--purchase-settlement')
const purchaseInstallments = process.argv.includes('--purchase-installments')
const purchasePayment = process.argv.includes('--purchase-payment')
const purchaseCsv = process.argv.includes('--purchase-csv')
const multilinePurchase = process.argv.includes('--multiline-purchase')
const warehouseReconciliation = purchaseSettlement || purchaseHandoff || purchaseInstallments || purchasePayment || purchaseCsv || multilinePurchase || warehouseCorrection || process.argv.includes('--warehouse-reconciliation')
const deliveryCommitments = process.argv.includes('--delivery-commitments')
const dailyCommitments = process.argv.includes('--daily-commitments')
const catchup = process.argv.includes('--catchup')
const conversation = process.argv.includes('--inbox-conversation')
const replies = conversation || process.argv.includes('--reply-workflow')
const followups = process.argv.includes('--reply-followup')
const gmailReconnect = process.argv.includes('--gmail-reconnect')
const scheduledSend = process.argv.includes('--scheduled-send')
const scheduledCronSecret = 'inboxai-synthetic-scheduled-send-secret'
const emailSnoozes = process.argv.includes('--email-snoozes')
const gmailTriage = process.argv.includes('--gmail-triage')
const personalMailRules = process.argv.includes('--personal-mail-rules')
const mailLookup = process.argv.includes('--mail-lookup')
const offlineCompose = process.argv.includes('--offline-compose')
const offlineReply = process.argv.includes('--offline-reply')
const actionNotifications = process.argv.includes('--action-notifications')
const draftContinuity = process.argv.includes('--draft-continuity')
const composeRecipients = process.argv.includes('--compose-recipients')
const composeAttachments = process.argv.includes('--compose-attachments')
const journeyE2E = livingTest || pilotTest || warehouseReconciliation || deliveryCommitments || offlineCompose || draftContinuity || composeRecipients || actionNotifications || offlineReply || mailLookup || personalMailRules || gmailReconnect || scheduledSend || emailSnoozes || gmailTriage || composeAttachments || followups || replies || catchup || process.argv.includes('--m6d-e2e') || dailyCommitments || dayTest
const journey = interactivePreview || journeyE2E
const commitmentBenchmark = process.argv.includes('--m6g')
const isolatedCommitment = commitmentDetection && process.argv.includes('--isolated')
const isolatedCommitmentUi = commitmentUi && process.argv.includes('--isolated')
const isolatedAskAnswer = askAnswer && process.argv.includes('--isolated')
const commitmentOutput = commitmentBenchmark ? (await import('../tests/eval/commitments/benchmark.mjs')).output : null
const isolatedDesign = design && process.argv.includes('--isolated')
const isolatedPlatform = m6 && !m6Native && process.argv.includes('--isolated')
const isolatedStaging = staging && process.argv.includes('--isolated')
const isolatedAuth = process.argv.includes('--isolated-auth')
const platformOutput = isolatedPlatform ? 'test-results/commitment-attention/platform' : undefined
const isolated = journeyE2E || livingPreview || dayPreview || isolatedDesign || commitmentBenchmark || isolatedCommitment || isolatedCommitmentUi || isolatedAskAnswer || isolatedPlatform || isolatedAuth
const isolatedBuild = isolated || isolatedStaging
const productionMode = m6 || staging || journey || isolated
const journeyOutput = livingReview ? (livingPreview ? 'test-results/living-review/preview' : 'test-results/living-review') : livingCoverage ? (livingPreview ? 'test-results/living-coverage/preview' : 'test-results/living-coverage') : livingPreview ? 'test-results/living-commitments/preview' : livingTest ? 'test-results/living-commitments' : pilot ? 'test-results/local-pilot' : purchaseRelease ? 'test-results/purchase-release' : purchaseSupplements ? 'test-results/purchase-supplements' : purchaseFocus ? 'test-results/purchase-focus' : purchaseBatches ? 'test-results/purchase-batches' : purchaseExceptions ? 'test-results/purchase-exceptions' : purchaseDues ? 'test-results/purchase-dues' : purchaseReturn ? 'test-results/purchase-return' : purchaseSettlement ? 'test-results/purchase-settlement' : purchaseHandoff ? 'test-results/purchase-handoff' : purchaseInstallments ? 'test-results/purchase-installments' : purchasePayment ? 'test-results/purchase-payment' : purchaseCsv ? 'test-results/purchase-csv' : multilinePurchase ? 'test-results/multiline-purchase' : warehouseCorrection ? 'test-results/warehouse-correction' : warehouseReconciliation ? 'test-results/warehouse-reconciliation' : deliveryCommitments ? 'test-results/delivery-commitments' : offlineCompose ? 'test-results/offline-compose' : draftContinuity ? 'test-results/draft-continuity' : composeRecipients ? 'test-results/compose-recipients' : actionNotifications ? 'test-results/action-notifications' : offlineReply ? 'test-results/offline-reply' : mailLookup ? 'test-results/mail-lookup' : personalMailRules ? 'test-results/personal-mail-rules' : conversation ? 'test-results/inbox-conversation' : gmailReconnect ? 'test-results/gmail-reconnect' : scheduledSend ? 'test-results/scheduled-send' : emailSnoozes ? 'test-results/email-snoozes' : gmailTriage ? 'test-results/gmail-triage' : composeAttachments ? 'test-results/compose-attachments' : followups ? 'test-results/reply-followup' : replies ? 'test-results/reply-workflow' : catchup ? 'test-results/inbox-catchup' : day ? 'test-results/day-preview' : dailyCommitments ? 'test-results/commitment-attention' : 'test-results/m6d'
const previousEmail = journey ? 'huy.tran@example.test' : 'preupgrade@example.test'
const evidenceFile = journey ? `${journeyOutput}/report.json`
  : isolatedAuth ? 'test-results/local-auth/report.json'
  : commitmentOutput ? commitmentOutput + '/local-run.json'
  : isolatedCommitmentUi ? 'test-results/commitment-ui/run.json'
  : isolatedDesign ? `${journeyOutput}/design-run.json`
  : m6c ? `docs/phase-2/evidence/m6c-${staging ? 'staging' : 'auth'}-run.json`
  : staging ? (isolatedStaging ? 'test-results/staging/run.json' : 'docs/phase-2/evidence/m6b-run.json')
  : platformOutput ? platformOutput + '/run.json'
  : m6 ? `docs/phase-2/evidence/m6a-${m6Baseline ? 'baseline' : m6Native ? 'native-run' : 'browser-run'}.json`
  : operatorOutcomes ? 'docs/phase-2/evidence/m5b-browser-run.json'
  : operator ? 'docs/phase-2/evidence/m5a-browser-run.json'
  : askAnswer ? (isolatedAskAnswer ? 'test-results/purchase-payment/ask-answer-report.json' : 'docs/phase-2/evidence/m4b-browser-run.json')
  : askInbox ? 'docs/phase-2/evidence/m4a-browser-run.json'
  : commitmentDetection ? (isolatedCommitment ? 'test-results/commitment-lifecycle/browser-run.json' : 'docs/phase-2/evidence/m3c-browser-run.json')
  : commitmentUi ? 'docs/phase-2/evidence/m3b-browser-run.json'
  : commitments ? 'docs/phase-2/evidence/m3a-local-auth.json'
  : actionInbox ? 'docs/phase-2/evidence/m2b-browser-run.json'
  : design ? 'docs/phase-2/evidence/m2a-browser-run.json' : 'docs/phase-2/evidence/m1c-local-auth.json'
const compose = ['compose', '-p', pilotPreview ? 'inboxai-local-pilot' : isolated ? 'inboxai-m6d-e2e' : staging ? 'inboxai-m6b-local' : 'inboxai-m0e-local',
  '-f', 'tests/local-auth/compose.yml',
  ...(isolated ? ['-f', 'tests/local-auth/e2e.compose.yml'] : staging ? ['-f', 'tests/local-auth/staging.compose.yml'] : []),
  ...(purchaseRelease ? ['-f', 'tests/local-auth/purchase-release.compose.yml'] : [])]
let dockerContext = []
const dockerEnv = staging || m6c || journey || isolated ? Object.fromEntries(['PATH','HOME','LANG','TMPDIR'].filter(key => process.env[key]).map(key => [key,process.env[key]])) : process.env
const docker = (args, options) => execFileSync('docker', [...dockerContext, ...compose, ...args],
  { env: dockerEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 90_000, ...options })
const sql = source => docker(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'inboxai_security_test',
  '-X', '-v', 'ON_ERROR_STOP=1', '-At'], { input: source })
const secret = isolated ? 'inboxai-m6d-e2e-synthetic-only-jwt-secret'
  : staging ? 'inboxai-m6b-synthetic-only-jwt-secret' : 'synthetic-local-jwt-secret-at-least-32-characters'
const token = role => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  // Leave-running preview API keys outlive a one-hour test. User sessions still
  // use GoTrue's normal expiry. These keys belong only to the loopback fixture.
  const lifetime = interactivePreview ? 7 * 86_400 : 3600
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + lifetime })).toString('base64url')
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`
}
const anon = token('anon'), service = token('service_role')
const ports = isolated ? { proxy: 57321, app: 57300, auth: 57999, rest: 57400, mail: 57825 }
  : staging ? { proxy: 56321, app: 56300, auth: 56999, rest: 56400, mail: 56825 }
  : { proxy: 55321, app: 55300, auth: 55999, rest: 55400, mail: 55825 }
const base = 'http://127.0.0.1:' + ports.proxy, app = 'http://127.0.0.1:' + ports.app
// The live guide opens the app on localhost so its cookies are separate from the earlier 127.0.0.1 preview.
const dayApp = 'http://localhost:' + ports.app
const loopbackFetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input)
  assert.equal(url.hostname, '127.0.0.1', 'test attempted non-loopback fetch')
  try {
    return await fetch(input, { ...init, ...(staging && { redirect: 'manual' }), signal: init?.signal ?? AbortSignal.timeout(10_000) })
  } catch (cause) {
    // Diagnose transport loss without retrying a possibly committed write.
    throw new Error(`Loopback ${init?.method ?? 'GET'} ${url.pathname} failed`, { cause })
  }
}
const admin = createClient(base, service, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: loopbackFetch } })
const outcomes = []
const record = (name, condition) => { assert.ok(condition, name); outcomes.push({ name, status: 'PASS' }); console.log(`PASS: ${name}`) }
let started = false, next, proxy, nativeFixture, mailProvider, smtpWire, rehearsal, googleProvider, dayGuide
let useRecovery = false
const briefingReads = []
const cookies = new Map()
const shutdown = new AbortController()
const stop = () => shutdown.abort()
if (journey || commitmentBenchmark) {
  // The terminal and npm may both deliver the same signal during teardown.
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
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
    shutdown.signal.throwIfAborted()
    try { const response = await loopbackFetch(url); if (await predicate(response)) return } catch {}
    await delay(500)
  }
  throw new Error(`Local service did not become ready: ${new URL(url).port}`)
}
try {
  if (commitmentOutput) {
    mkdirSync(commitmentOutput, { recursive: true })
    rmSync(commitmentOutput + '/product.json', { force: true })
  }
  if (isolatedAskAnswer) mkdirSync('test-results/purchase-payment', { recursive: true })
  if (isolatedCommitment) mkdirSync('test-results/commitment-lifecycle', { recursive: true })
  if (isolatedAuth) mkdirSync('test-results/local-auth', { recursive: true })
  if (platformOutput) mkdirSync(platformOutput, { recursive: true })
  if (isolatedStaging) mkdirSync('test-results/staging', { recursive: true })
  // A failed future run must never leave a stale success report behind.
  if (!journey) rmSync(evidenceFile, { force:true })
  if (commitments) rmSync('docs/phase-2/evidence/m3a-sample-ledger.json', { force: true })
  const freeKB = Number(execFileSync('df', ['-Pk', '/'], { encoding: 'utf8' }).trim().split('\n').at(-1).split(/\s+/)[3])
  assert.ok(freeKB >= 10 * 1024 * 1024, 'less than 10 GiB free')
  if (staging || m6c || journey || isolated) {
    assert.ok(['.env', '.env.local', '.env.production', '.env.production.local', '.env.development', '.env.development.local']
      .every(path => !existsSync(path)), 'The isolated fixture requires a checkout without Next.js environment files')
    const context = execFileSync('docker', ['context','show'], { env: dockerEnv, encoding: 'utf8' }).trim()
    const endpoint = execFileSync('docker', ['context','inspect',context,'--format','{{.Endpoints.docker.Host}}'],
      { env: dockerEnv, encoding: 'utf8' }).trim()
    assert.match(endpoint, /^unix:\/\/\//, 'The isolated fixture requires a local Docker Unix socket')
    dockerContext = ['--context', context]
  }
  if (staging) {
    const { createStagingRehearsal } = await import('../tests/local-auth/staging.mjs')
    rehearsal = createStagingRehearsal({ docker, sql, record, loopbackFetch })
  }
  if (docker([...(staging ? ['--profile','recovery'] : []), 'ps', '-aq']).trim()) {
    throw new Error('Môi trường kiểm thử local đang tồn tại. Hãy dừng phiên đang chạy trước khi khởi động phiên mới.')
  }
  // Assert no unexpected external SMTP configuration can enter this fixture.
  const config = JSON.parse(docker([...(staging ? ['--profile','recovery'] : []), 'config', '--format', 'json']))
  assert.equal(config.services.auth.environment.GOTRUE_SMTP_HOST, 'mail')
  if (staging) rehearsal.assertIsolation(config)
  proxy = createServer((req,res) => {
    const auth = req.url.startsWith('/auth/v1/')
    const rest = req.url.startsWith('/rest/v1/')
    if (!auth && !rest) { res.writeHead(404); res.end(); return }
    const origin = req.headers.origin
    const localCors = (m6 || journey || isolatedDesign || isolatedCommitmentUi) && (origin === app || (day && origin === dayApp))
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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
  // Reserve the fixture gateway before touching Docker so simultaneous actions cannot share it.
  await new Promise((resolve, reject) => proxy.once('error', reject).listen(ports.proxy, '127.0.0.1', resolve))
  if (journey && !interactivePreview) {
    mkdirSync(journeyOutput, { recursive: true })
    rmSync(evidenceFile, { force: true })
    rmSync(`${journeyOutput}/failure.png`, { force: true })
    if (offlineCompose || draftContinuity || composeRecipients || actionNotifications || offlineReply || mailLookup || personalMailRules || dailyCommitments || catchup || replies || followups || composeAttachments || gmailTriage || emailSnoozes || scheduledSend || gmailReconnect) rmSync(`${journeyOutput}/workflow.json`, { force: true })
  }
  started = true
  docker(['up', '-d', '--pull', 'never', ...(staging ? ['--wait','--wait-timeout','60'] : [])])
  await waitFor(`http://127.0.0.1:${ports.auth}/health`)
  // GoTrue's historical uid helper reads legacy GUCs. PostgREST 14 supplies JSON claims.
  sql(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;`)
  const migrations = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()
  for (const file of migrations.filter(f => f < '20261111010000')) sql(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  const { data: seed, error: seedError } = await admin.auth.admin.createUser({ email: previousEmail,
    password: 'Synthetic-passphrase-123', email_confirm: true, ...(journey && { user_metadata: { full_name: 'Trần Quốc Huy' } }) })
  assert.equal(seedError, null)
  const previousId = seed.user.id
  if (staging) {
    seedLegacyVault(sql, previousId)
    seedLegacySync(sql, previousId)
    sql('UPDATE public.source_accounts SET is_active=false;')
    rehearsal.beforeUpgrade()
  }
  for (const file of migrations.filter(f => f >= '20261111010000')) {
    if (!staging && !journey && file === '20261111020000_credential_vault.sql') seedLegacyVault(sql,previousId)
    if (!staging && !journey && file === '20261111030000_sync_contracts.sql') seedLegacySync(sql,previousId)
    if (actionInbox && file === '20261111050000_action_inbox.sql') {
      sql(`INSERT INTO public.emails(user_id,from_address,subject,body_text) VALUES('${previousId}','legacy@example.test','Priority before upgrade','Legacy body');`)
    }
    if (commitments && file === '20261111060000_commitment_ledger.sql') {
      sql(`INSERT INTO public.action_items(user_id,title) VALUES('${previousId}','Legacy task before ledger');`)
    }
    if (replies && file === '20261112050000_reply_workflow.sql') {
      sql(`INSERT INTO public.emails(user_id,from_address,subject,body_text) VALUES(
        '${previousId}','archive@example.test','Hồ sơ trước nâng cấp','Email lịch sử giả lập.');`)
    }
    if (catchup && file === '20261112040000_commitment_catchup.sql') {
      sql(`INSERT INTO public.emails(user_id,from_address,subject,body_text)
        VALUES('${previousId}','legacy@example.test','[LEG-420] Nâng cấp','Tôi sẽ gửi hồ sơ trước ngày 15/11/2026.');`)
    }
    if (draftContinuity && file === '20261113030000_draft_continuity.sql') {
      sql(`INSERT INTO public.source_accounts(id,user_id,email_address,provider)
        VALUES('20261113-0300-4000-8000-000000000001','${previousId}','legacy-draft@example.test','custom');
        INSERT INTO private.file_compose_drafts(user_id,account_id,fields,file_ids)
        VALUES('${previousId}','20261113-0300-4000-8000-000000000001','{"to":"","cc":"","subject":"Nháp trước nâng cấp","body":"Bản gốc"}','{}');`)
    }
    sql(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  }
  if (staging) rehearsal.checkUpgrade(migrations)
  if (catchup) record('upgrade backfills existing inbound evidence as pending',
    Number(sql(`SELECT count(*) FROM private.commitment_catchup WHERE user_id='${previousId}' AND reference='LEG-420' AND hashes IS NULL`)) === 1)
  if (replies) record('upgrade preserves an existing email and leaves its unverified reply metadata empty',
    Number(sql(`SELECT count(*) FROM public.emails WHERE user_id='${previousId}' AND subject='Hồ sơ trước nâng cấp' AND in_reply_to IS NULL`)) === 1)
  record('upgrade preserves existing profile', Number(sql(`SELECT count(*) FROM public.profiles WHERE id='${previousId}'`)) === 1)
  const { error: blocked } = await createClient(base, anon).auth.signUp({ email: 'blocked@example.test', password: 'Synthetic-passphrase-123' })
  record('direct Auth API cannot bypass closed registration policy', Boolean(blocked))
  sql("UPDATE public.registration_policy SET enabled=true, max_users=100; NOTIFY pgrst, 'reload schema';")
  await delay(1000)
  if ((journeyE2E || pilotPreview || livingPreview) && !dailyCommitments && !day) googleProvider = await startGoogleOAuthFixture()
  if (!staging) {
    if (!journey) mailProvider = await startMailProvider()
    smtpWire = await startSmtpWire(journey ? {
      acceptMessage({ raw, recipients }) {
        docker(['exec', '-T', 'mail', '/mailpit', 'sendmail', '-f', 'smtp-wire@example.test', '--', ...recipients],
          { input: raw + '\r\n', timeout: 5_000 })
      },
    } : undefined)
  }
  const pilotVersion = pilot ? (await import('../tests/design/local-pilot/version.mjs')).readPilotVersion() : null
  const nextEnv = { ...Object.fromEntries(['PATH','HOME','LANG','TMPDIR', ...(askInbox ? ['ASK_INBOX_MODEL_DIR'] : [])]
        .filter(key => process.env[key]).map(key => [key,process.env[key]])),
      ...(isolatedBuild ? { INBOXAI_E2E_BUILD: '1' } : {}),
      ...(living ? { INBOXAI_LIVING_LOCAL: '1' } : {}),
      ...(pilot ? { INBOXAI_TEST_LOCAL_PILOT: '1', INBOXAI_LOCAL_PILOT_VERSION: JSON.stringify(pilotVersion), INBOXAI_LOCAL_PILOT_GUIDE: 'http://127.0.0.1:57343' } : {}),
      ...(gmailTriage ? { INBOXAI_GMAIL_TRIAGE_ENABLED: '1' } : {}),
      ...(googleProvider ? { INBOXAI_TEST_GOOGLE_OAUTH_URL: googleProvider.url, GOOGLE_CLIENT_ID: googleClientId,
        GOOGLE_CLIENT_SECRET: googleClientSecret, GOOGLE_REDIRECT_URI: app + '/api/auth/google/callback' } : {}),
      ...((scheduledSend || gmailReconnect || actionNotifications) ? { CRON_SECRET: scheduledCronSecret } : {}),
      ...(staging ? { CRON_SECRET: rehearsal.cronSecret } : {
        ...(journey ? { INBOXAI_TEST_JOURNEY: '1' } : { INBOXAI_TEST_GMAIL_URL: mailProvider.url }),
        INBOXAI_TEST_SMTP_PORT: String(smtpWire.port), NODE_EXTRA_CA_CERTS: smtpWire.cert }),
      NODE_ENV: productionMode ? 'production' : 'development', NEXT_PUBLIC_SUPABASE_URL: base, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service, NEXT_PUBLIC_APP_URL: app, SIGNUP_ENABLED: 'true',
      SIGNUP_RATE_LIMIT_KEY: 'synthetic-local-registration-key-at-least-32-characters',
      CREDENTIAL_VAULT_KEYS:vaultKeys,CREDENTIAL_VAULT_ACTIVE_KEY:'local1',
      OPENAI_API_KEY: 'sk-synthetic', RESEND_API_KEY: 're_synthetic', NEXT_TELEMETRY_DISABLED: '1' }
  const nextCommand = ['--import', staging ? './tests/local-auth/staging-network.mjs' : './tests/local-auth/mail-network.mjs', 'node_modules/next/dist/bin/next']
  if (productionMode) {
    const declaration = 'next-env.d.ts'
    const existing = isolatedBuild && existsSync(declaration) ? readFileSync(declaration) : null
    try {
      execFileSync(process.execPath, [...nextCommand, 'build'], { env: nextEnv, stdio: 'inherit' })
    } finally {
      // Next regenerates the shared declaration for the selected build directory.
      if (isolatedBuild && existsSync(declaration) && readFileSync(declaration, 'utf8').includes('"./.next-build/types/routes.d.ts"')) {
        if (existing) writeFileSync(declaration, existing)
        else rmSync(declaration)
      }
    }
  }
  if (m6Native) {
    const { startNativeFixture } = await import('../tests/local-auth/native-shell.mjs')
    nativeFixture = await startNativeFixture(cookies)
  }
  let output = ''
  async function startNext() {
    const processId = next?.pid
    next = spawn(process.execPath, [...nextCommand, productionMode ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', String(m6Native ? 55301 : ports.app)], {
      env: nextEnv,
      stdio: ['ignore','pipe','pipe'],
    })
    next.stdout.on('data', chunk => { output = (output + chunk).slice(-10000) })
    next.stderr.on('data', chunk => { output = (output + chunk).slice(-10000) })
    await waitFor(`${app}/login`)
    assert.notEqual(next.pid, processId)
  }
  await startNext()
  const restartNext = async (beforeStart) => {
    if (next.exitCode === null && !next.signalCode) {
      await new Promise(resolve => {
        const timer = setTimeout(() => next.kill('SIGKILL'), 5000)
        next.once('exit', () => { clearTimeout(timer); resolve() })
        next.kill('SIGTERM')
      })
    }
    if (beforeStart) await beforeStart()
    await startNext()
  }
  const email = journey ? 'mai.nguyen@example.test' : 'verified@example.test', password = 'Synthetic-passphrase-123'
  const response = await appFetch('/api/signup-whitelist', { method: 'POST', headers: { 'content-type':'application/json' },
    body: JSON.stringify({ email, password, fullName: journey ? 'Nguyễn Hoàng Mai' : 'Synthetic Verified' }) })
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
  if (livingPreview) {
    const { seedLivingCommitments } = await import('../tests/design/living-commitments.mjs')
    await seedLivingCommitments({userId,previousId,previousEmail,admin,appFetch,sql,googleProvider,record,...(livingReview?{evaluation:await import('../tests/eval/living-review/evaluation.mjs')} : livingCoverage?{evaluation:await import('../tests/eval/living-coverage/evaluation.mjs')}:{})})
    console.log('\nCam kết sống: '+app+'/commitments/living\nTài khoản: '+email+'\nMật khẩu giả lập: '+password+'\n')
    await new Promise(resolve=>shutdown.signal.addEventListener('abort',resolve,{once:true}))
  } else if (livingTest) {
    const { rehearseLivingCommitments } = await import('../tests/design/living-commitments.mjs')
    await rehearseLivingCommitments({ app,base,email,password,userId,previousId,previousEmail,admin,appFetch,sql,googleProvider,restartNext,record,output:journeyOutput,...(livingReview?{evaluation:await import('../tests/eval/living-review/evaluation.mjs')} : livingCoverage?{evaluation:await import('../tests/eval/living-coverage/evaluation.mjs')}:{}) })
  } else if (pilot) {
    mkdirSync(journeyOutput, { recursive: true })
    const { startLocalPilot } = await import('../tests/design/local-pilot/server.mjs')
    dayGuide = await startLocalPilot({ app, base, email, previousEmail, password, userId, previousId, admin, appFetch,
      googleProvider, sql, docker, restartNext, waitFor, version: pilotVersion, output: journeyOutput })
    if (pilotTest) {
      const { rehearseLocalPilot } = await import('../tests/design/local-pilot/browser.mjs')
      await rehearseLocalPilot({ guide: dayGuide, app, base, email, previousEmail, password, record, output: journeyOutput })
    } else {
      console.log('\nBản dùng thử mới: '+dayGuide.origin+'\nInboxAI: '+app+'/inbox\nDừng bằng Ctrl+C. Tiến độ giữ qua tải lại/khởi động lại ứng dụng từ trang điều khiển.\n')
      await new Promise(resolve => shutdown.signal.addEventListener('abort', resolve, { once: true }))
    }
  } else if (gmailReconnect) {
    const { rehearseGmailReconnect } = await import('../tests/design/gmail-reconnect.mjs')
    await rehearseGmailReconnect({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, restartNext, cronSecret: scheduledCronSecret, record, output: journeyOutput })
  } else if (scheduledSend) {
    const { rehearseScheduledSend } = await import('../tests/design/scheduled-send.mjs')
    await rehearseScheduledSend({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, restartNext, cronSecret: scheduledCronSecret, record, output: journeyOutput })
  } else if (emailSnoozes) {
    const { rehearseEmailSnoozes } = await import('../tests/design/email-snoozes.mjs')
    await rehearseEmailSnoozes({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, anon, restartNext, record, output: journeyOutput })
  } else if (draftContinuity) {
    const { rehearseDraftContinuity } = await import('../tests/design/draft-continuity.mjs')
    await rehearseDraftContinuity({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, record, output: journeyOutput })
  } else if (composeRecipients) {
    const { rehearseComposeRecipients } = await import('../tests/design/compose-recipients.mjs')
    await rehearseComposeRecipients({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, restartNext, record, output: journeyOutput })
  } else if (actionNotifications) {
    const { rehearseActionNotifications } = await import('../tests/design/action-notifications.mjs')
    await rehearseActionNotifications({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, restartNext, cronSecret: scheduledCronSecret, record, output: journeyOutput })
  } else if (offlineCompose) {
    const { rehearseOfflineCompose } = await import('../tests/design/offline-compose.mjs')
    await rehearseOfflineCompose({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, record, output: journeyOutput })
  } else if (offlineReply) {
    const { rehearseOfflineReply } = await import('../tests/design/offline-reply.mjs')
    await rehearseOfflineReply({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, record, output: journeyOutput })
  } else if (mailLookup) {
    const { rehearseMailLookup } = await import('../tests/design/mail-lookup.mjs')
    await rehearseMailLookup({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousId, record, output: journeyOutput })
  } else if (personalMailRules) {
    const { rehearsePersonalMailRules } = await import('../tests/design/personal-mail-rules.mjs')
    await rehearsePersonalMailRules({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, anon, restartNext, record, output: journeyOutput })
  } else if (gmailTriage) {
    const { rehearseGmailTriage } = await import('../tests/design/gmail-triage.mjs')
    await rehearseGmailTriage({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, previousId, anon, restartNext, record, output: journeyOutput })
  } else if (composeAttachments) {
    const { rehearseComposeAttachments } = await import('../tests/design/compose-attachments.mjs')
    await rehearseComposeAttachments({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, anon, restartNext, record, output: journeyOutput })
  } else if (followups) {
    const { rehearseReplyFollowup } = await import('../tests/design/reply-followup.mjs')
    await rehearseReplyFollowup({ app, base, email, password, userId, admin, appFetch, sql, googleProvider,
      previousEmail, anon, login, restartNext, smtpWire, record, output: journeyOutput })
  } else if (replies) {
    const { rehearseReplyWorkflow } = await import('../tests/design/reply-workflow.mjs')
    await rehearseReplyWorkflow({ app, base, email, password, userId, admin, login, appFetch, sql, googleProvider,
      previousEmail, anon, anonymousClient, restartNext, smtpWire, record, output: journeyOutput, conversation })
  } else if (catchup) {
    const { rehearseInboxCatchup } = await import('../tests/design/inbox-catchup.mjs')
    await rehearseInboxCatchup({ app, base, email, password, userId, admin, login, appFetch, sql, googleProvider,
      previousEmail, previousId, anon, anonymousClient, restartNext, smtpWire, record, output: journeyOutput })
  } else if (warehouseReconciliation) {
    const { rehearseWarehouseReconciliation } = await import('../tests/design/warehouse-reconciliation.mjs')
    await rehearseWarehouseReconciliation({ app, base, email, previousEmail, password, userId, admin, appFetch, googleProvider, record, output: journeyOutput, warehouseCorrection, multilinePurchase, purchaseCsv, purchasePayment, purchaseInstallments, purchaseHandoff, purchaseSettlement, purchaseReturn, purchaseDues, purchaseExceptions, purchaseBatches, purchaseFocus, purchaseSupplements, purchaseRelease, sql, restartNext })
  } else if (deliveryCommitments) {
    const { rehearseDeliveryCommitments } = await import('../tests/design/delivery-commitments.mjs')
    await rehearseDeliveryCommitments({ app, base, email, previousEmail, password, userId, admin, appFetch, googleProvider, record, output: journeyOutput })
  } else if (journey) {
    const { seedPurchasingJourney, rehearsePurchasingJourney } = await import('../tests/design/purchasing-journey.mjs')
    const fixture = await seedPurchasingJourney({ admin, sql, userId, foreignId: previousId, ownEmailId, otherEmailId })
    if (day) {
      const { startDayPreview } = await import('../tests/design/day-preview/server.mjs')
      dayGuide = await startDayPreview({
        app: dayApp, mailpit: 'http://127.0.0.1:' + ports.mail, email, password, userId, admin, appFetch, fixture,
      })
    }
    if (interactivePreview) {
      assert.ok(next.exitCode === null && !next.signalCode, 'Local Next preview stopped before it was ready')
      if (dayGuide) console.log('\nMột ngày trong InboxAI: ' + dayGuide.origin)
      console.log(`\nInboxAI: ${day ? dayApp : app}/login\nMailpit: http://127.0.0.1:${ports.mail}\n` +
        `Người mua: ${email}\nTổ chức khác: ${previousEmail}\nMật khẩu giả lập: ${password}\n` +
        'Dừng bằng Ctrl+C. Khởi động lại để đặt lại dữ liệu.\n')
      if (!shutdown.signal.aborted) {
        await new Promise((resolve, reject) => {
          shutdown.signal.addEventListener('abort', resolve, { once: true })
          next.once('exit', () => shutdown.signal.aborted ? resolve() : reject(new Error('Local Next preview stopped')))
        })
      }
    } else if (dayTest) {
      const { rehearseDayPreview } = await import('../tests/design/day-preview/browser.mjs')
      await rehearseDayPreview({ guide: dayGuide, app: dayApp, base, email, password, output: journeyOutput, record, smtpWire })
    } else if (dailyCommitments) {
      const { rehearseDailyCommitments } = await import('../tests/design/daily-commitments.mjs')
      await rehearseDailyCommitments({ app, base, email, previousEmail, password, userId, admin, appFetch, fixture,
        loopbackFetch, smtpWire, mailpit: `http://127.0.0.1:${ports.mail}`, record, output: journeyOutput })
    } else {
      await rehearsePurchasingJourney({ app, base, email, previousEmail, password, fixture, record, admin, login, loopbackFetch,
        smtpWire, mailpit: `http://127.0.0.1:${ports.mail}`, output: journeyOutput })
      const { rehearseGmailConsent } = await import('../tests/design/gmail-consent.mjs')
      await rehearseGmailConsent({ app, base, email, password, userId, login, admin, record, loopbackFetch, googleProvider,
        foreignAccountId: fixture.foreign.source_account_id, output: journeyOutput })
      const { rehearseSecurityJourney } = await import('../tests/design/security-journey.mjs')
      await rehearseSecurityJourney({ app, base, email, previousEmail, password, fixture, admin, sql, record, smtpWire, output: journeyOutput })
    }
  } else if (commitmentBenchmark) {
    const { runProduct } = await import('../tests/eval/commitments/product.mjs')
    await runProduct({ admin, appFetch, userId, ownEmailId, record })
  } else if (staging) {
    await rehearsal.verify({ app, appFetch, admin, login, anonymous: anonymousClient, userId, previousId, ownEmailId, otherEmailId, email, password,
      selectRecovery: () => { useRecovery = true }, appLog: () => output })
  } else if (m6) {
    sql(`DELETE FROM public.emails WHERE id='${ownEmailId}' AND user_id='${userId}';`)
    const { rehearsePlatform } = await import('../tests/design/platform.mjs')
    await rehearsePlatform({ app, base, appFetch, cookies, admin, userId, record, briefingReads, baseline: m6Baseline, nativeFixture, output: platformOutput })
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
      foreignToken: foreignSession.data.session.access_token, loopbackFetch, record, output: isolatedAskAnswer ? 'test-results/purchase-payment/ask-answer' : undefined })
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
    await rehearseCommitmentDetection({ app, appFetch, cookies, admin, userId, foreignId: previousId, isolated: isolatedCommitment,
      foreignToken: foreignSession.data.session.access_token, loopbackFetch, record })
  } else if (commitmentUi) {
    const { rehearseCommitmentUi } = await import('../tests/design/commitments.mjs')
    await rehearseCommitmentUi({ app, appFetch, cookies, admin, userId, record,
      output: isolatedCommitmentUi ? 'test-results/commitment-ui' : undefined })
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
    await rehearseDesign({ app, cookies, admin, userId, record, actionInbox,
      output: isolatedDesign ? `${journeyOutput}/design` : undefined })
  } else {
    const legacyLogin = createClient(base, anon, { auth:{persistSession:false,autoRefreshToken:false} })
    assert.equal((await legacyLogin.auth.signInWithPassword({email:'preupgrade@example.test',password})).error,null)
    await rehearseVault({sql,admin,login:legacyLogin,anonymous:createClient(base,anon),userId:previousId,otherUserId:userId,base,service,record})
    await rehearseSync({sql,admin,login:legacyLogin,anonymous:createClient(base,anon),userId:previousId,otherUserId:userId,record})
    await rehearseMailSend({ sql, admin, login, anonymous:createClient(base,anon), userId, otherUserId:previousId, record, appFetch, fixture:mailProvider, smtpWire })
  }
  const provenance = purchaseRelease
    ? 'Production-mode Next, Chrome and PostgreSQL. Frozen purchase-exception corpus over two loopback Gmail mailboxes.'
    : purchaseSupplements
    ? 'Production-mode Next, Chrome, PostgreSQL and two loopback Gmail accounts. Exact supplement search, ambiguous revisions, confirmation and role handoff.'
    : purchaseFocus
    ? 'Production-mode Next, Chrome, PostgreSQL and two loopback Gmail accounts. Inbox to purchase exception, exact source, stale review and closure.'
    : purchaseBatches
    ? 'Production-mode Next, Chrome, PostgreSQL, two loopback Gmail accounts, independent batch approval and partial receipt reconciliation'
    : purchaseExceptions
    ? 'Production-mode Next, Chrome, PostgreSQL, two loopback Gmail accounts, evidence request and reapproval with stale CSV and lost responses'
    : purchaseDues
    ? 'Production-mode Next, Chrome, PostgreSQL and two loopback Gmail accounts, due board across three POs and controlled Vietnam date boundary'
    : purchaseReturn
    ? 'Production-mode Next, Chrome, PostgreSQL and two loopback Gmail accounts, returned transfer reconciliation and lost response recovery'
    : purchaseSettlement
    ? 'Production-mode Next, real Chrome, local PostgreSQL and two loopback Gmail accounts, independent buyer and accountant sessions, settlement reconciliation and HTTP response loss'
    : purchaseHandoff
    ? 'Production-mode Next, Chrome, PostgreSQL, separate verified buyer/reviewer identities and two synthetic Gmail accounts'
    : purchaseInstallments
    ? 'Production-mode Next, Chrome and two loopback Gmail accounts. Cumulative invoice approvals, corrections and lost response replay.'
    : purchasePayment
    ? 'Production-mode Next, Chrome, PostgreSQL and two loopback Gmail accounts. Three-way invoice reconciliation and local approval.'
    : purchaseCsv
    ? 'Production-mode Next and installed Chrome, two loopback Gmail accounts, CSV reconciliation and atomic approval replay'
    : multilinePurchase
    ? 'Production-mode Next and installed Chrome, two loopback Gmail accounts, per-line purchase reconciliation and approval replay'
    : warehouseCorrection
    ? 'Production-mode Next and Chrome with two loopback Gmail accounts, loss of write acknowledgement and approved warehouse correction after close'
    : warehouseReconciliation
    ? 'Production-mode Next and Chrome with two loopback Gmail accounts, role simulation, transactional warehouse receipt deduplication and lost approval acknowledgements'
    : deliveryCommitments
    ? 'Production-mode Next and Chrome on PostgreSQL with two loopback Gmail accounts, simulated buyer approvals and lost save acknowledgement'
    : offlineCompose
    ? 'Production-mode Next and a persistent Google Chrome profile, actual encrypted IndexedDB and service worker, local PostgreSQL, two loopback Gmail accounts'
    : draftContinuity
    ? 'Production-mode Next, independent Google Chrome profiles, GoTrue, PostgREST and PostgreSQL with two loopback Gmail accounts and injected save and send response loss'
    : composeRecipients ? 'Production-mode Next, Google Chrome, local PostgreSQL and two loopback Gmail accounts with real sync, browser restart and lost send acknowledgements'
    : actionNotifications ? 'Production-mode Next, Google Chrome, local PostgreSQL and two loopback Gmail accounts with browser restart, controlled clock, injected response loss and OAuth recovery'
    : offlineReply ? 'Production-mode Next, persistent Google Chrome profile with real service worker and IndexedDB, local PostgreSQL and two loopback Gmail accounts'
    : mailLookup ? 'Production-mode Next, Google Chrome, local PostgreSQL and two loopback Gmail accounts with paginated search and attachment downloads'
    : personalMailRules ? 'Production-mode Next, Google Chrome, local PostgreSQL and two loopback Gmail accounts with sender rules and undo'
    : conversation ? 'Production-mode Next, Google Chrome, PostgreSQL and two loopback Gmail accounts; account-scoped conversation reader, dropped send acknowledgement and exact commitment source links'
    : gmailReconnect ? 'Production-mode Next, Google Chrome, PostgreSQL, two loopback Gmail accounts, background worker, revoked grants and browser OAuth recovery'
    : scheduledSend ? 'Production-mode Next, Google Chrome, PostgreSQL and two loopback Gmail accounts, browser and database clocks, independent worker ticks and injected provider acknowledgement loss'
    : emailSnoozes ? 'Production-mode Next, Chrome, PostgreSQL, two loopback Gmail accounts, controlled browser and database clocks and interrupted acknowledgement'
    : gmailTriage ? 'Production-mode Next, Chromium, local PostgreSQL and two loopback Gmail accounts with label history and injected connection loss'
    : composeAttachments ? 'Production-mode Next (restarted), Chromium, PostgreSQL and two loopback Gmail accounts, actual MIME and binary downloads, synthetic dropped acknowledgements'
    : followups ? 'Production-mode Next (restarted), Chromium and PostgreSQL clocks advanced together in the isolated fixture, two loopback Gmail accounts and three conversations'
    : replies ? 'Production-mode Next (restarted), Chromium, GoTrue, PostgREST and PostgreSQL, two Gmail accounts and provider acknowledgement loss over loopback'
    : catchup ? 'Production-mode Next (restarted), Chromium, GoTrue, PostgREST and PostgreSQL; three-day synthetic Gmail history via two loopback accounts and injected transport failure'
    : day ? 'Interactive local guide and production-mode Next in Chromium, synthetic data and real local SMTP TLS to Mailpit'
    : dailyCommitments ? 'Production-mode Next, GoTrue, PostgREST, PostgreSQL, Chromium and Mailpit over loopback with a synthetic daily commitment workflow'
    : journey ? 'Production-mode Next, GoTrue, PostgREST, PostgreSQL, Chromium, Mailpit and a simulated Google OAuth and Gmail API over loopback with synthetic data'
    : commitmentBenchmark ? 'Authenticated production-mode Next, PostgREST and PostgreSQL on the synthetic M6-G corpus'
    : staging ? 'Local staging and independent PostgreSQL recovery, GoTrue, PostgREST and production-mode Next on synthetic data'
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
    : 'Real local GoTrue/PostgREST/Next; synthetic Gmail/IMAP readers, loopback Gmail HTTP and SMTP TLS with fixture DNS/socket mapping; internal verification SMTP sink; .test identities; not hosted/provider interoperability'
  if (!interactivePreview) writeFileSync(evidenceFile, JSON.stringify({ date: new Date().toISOString(),
    ...((journey || commitmentBenchmark) && { status: 'PASS' }), provenance, images:purchaseRelease
      ? docker(['config','--images']).trim().split('\n')
      : { auth:'supabase/gotrue:v2.197.0',rest:'postgrest/postgrest:v14.18',mail:'axllent/mailpit:v1.28.1',db:'postgres:16' }, ...rehearsal?.evidence, outcomes },null,2)+'\n')
} catch (error) {
  if ((journeyE2E || commitmentBenchmark) && started) {
    writeFileSync(evidenceFile, JSON.stringify({ date: new Date().toISOString(), status: 'FAIL',
      error: error.stack ?? error.message, outcomes }, null, 2) + '\n')
  }
  if (!interactivePreview || !shutdown.signal.aborted) throw error
} finally {
  if (dayGuide) await dayGuide.close()
  if (next && next.exitCode === null && !next.signalCode) {
    next.kill('SIGTERM')
    await Promise.race([new Promise(resolve => next.once('exit', resolve)), delay(5000).then(() => next.kill('SIGKILL'))])
  }
  if (mailProvider) await mailProvider.close()
  if (googleProvider) await googleProvider.close()
  if (smtpWire) await smtpWire.close()
  if (nativeFixture) await nativeFixture.close()
  if (proxy) await new Promise(resolve => { proxy.close(resolve); proxy.closeAllConnections() })
  rehearsal?.close()
  if (started) docker([...(staging ? ['--profile','recovery'] : []), 'down'])
  if (journey || commitmentBenchmark) {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
