import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { vaultKeys } from './vault.mjs'

const beforeTables = ['auth.users', 'auth.identities', 'public.profiles', 'public.source_accounts', 'public.emails']
const afterTables = [...beforeTables, 'public.registration_policy', 'private.account_credentials', 'private.legacy_account_credentials',
  'private.commitments', 'private.commitment_revisions', 'private.operator_plans', 'private.operator_events',
  'private.operator_effects', 'private.operator_outcome_events', 'private.living_analyses',
  'private.living_decisions', 'private.living_review_history']
const stagingDatabase = 'inboxai_security_test'
const recoveryBefore = 'inboxai_recovery_before'
const recoveryAfter = 'inboxai_recovery_after'
const cronSecret = 'inboxai-m6b-synthetic-cron-secret'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function createStagingRehearsal({ docker, sql, record, loopbackFetch }) {
  mkdirSync('node_modules/.cache', { recursive: true })
  const scratch = mkdtempSync('node_modules/.cache/inboxai-m6b-')
  const evidence = { backups: [], alerts: [], probes: [], appErrors: [] }
  const recoverySql = (database, input) => docker(['exec','-T','recovery-db','psql','-U','postgres','-d',database,
    '-X','-At','-v','ON_ERROR_STOP=1'], { input }).trim()

  function fingerprints(query, tables) {
    return Object.fromEntries(tables.map(table => [table, query(
      `SELECT count(*) || ':' || encode(sha256(convert_to(coalesce(jsonb_agg(row_data ORDER BY row_data)::text,'[]'),'UTF8')),'hex')
        FROM (SELECT to_jsonb(t) AS row_data FROM ${table} t) rows;`).trim()]))
  }

  function backup(stage) {
    const start = performance.now()
    const bytes = docker(['exec','-T','db','pg_dump','-U','postgres','-d',stagingDatabase,'--format=custom'], { encoding: 'buffer' })
    assert.equal(bytes.subarray(0, 5).toString(), 'PGDMP', 'invalid pg_dump archive signature')
    const path = join(scratch, stage + '.dump')
    writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' })
    const details = { stage, bytes: bytes.length, sha256: sha256(bytes), backupMs: Math.round(performance.now() - start) }
    evidence.backups.push(details)
    return { path, details }
  }

  function restore(archive, database) {
    const bytes = readFileSync(archive.path)
    assert.equal(sha256(bytes), archive.details.sha256, 'Backup checksum mismatch')
    const start = performance.now()
    docker(['exec','-T','recovery-db','createdb','-U','postgres','--template=template0',database])
    docker(['exec','-T','recovery-db','pg_restore','-U','postgres','--exit-on-error','--single-transaction','-d',database], { input: bytes })
    archive.details.restoreMs = Math.round(performance.now() - start)
  }

  function assertIsolation(config) {
    assert.equal(config.name, 'inboxai-m6b-local')
    assert.equal(config.networks.isolated.internal, true)
    assert.ok(config.services.gateway.ports.length > 0 && config.services.gateway.ports.every(port => port.host_ip === '127.0.0.1'))
    for (const [name, service] of Object.entries(config.services)) {
      if (name === 'gateway') continue
      assert.deepEqual(Object.keys(service.networks), ['isolated'])
      assert.equal(service.ports, undefined)
    }
    assert.equal(config.services['recovery-auth'].environment.GOTRUE_SMTP_HOST, 'mail')
    record('staging uses an independent Docker project, internal service network and loopback gateway', true)
  }

  function beforeUpgrade() {
    const systemId = 'SELECT system_identifier FROM pg_control_system();'
    record('source and recovery use separate PostgreSQL clusters',
      sql(systemId).trim() !== recoverySql('inboxai_recovery_bootstrap', systemId))
    const expected = fingerprints(sql, beforeTables)
    const archive = backup('before-upgrade')
    restore(archive, recoveryBefore)
    const query = source => recoverySql(recoveryBefore, source)
    assert.deepEqual(fingerprints(query, beforeTables), expected)
    record('pre-upgrade archive restores Auth, metadata, legacy credentials and mail to a blank database', true)

    const vaultMigration = readFileSync('supabase/migrations/20261111020000_credential_vault.sql', 'utf8')
    assert.match(vaultMigration, /COMMIT;\s*$/)
    const failing = vaultMigration.replace(/COMMIT;\s*$/, 'SELECT 1/0;\nCOMMIT;')
    assert.throws(() => query(failing), error => String(error.stderr).includes('division by zero'))
    assert.equal(query("SELECT to_regclass('private.legacy_account_credentials') IS NULL;"), 't')
    assert.deepEqual(fingerprints(query, beforeTables), expected)
    record('failure after vault migration statements rolls back DDL and data on the recovery database', true)
  }

  function checkUpgrade(migrations) {
    evidence.migrations = migrations.map(name => ({ name, sha256: sha256(readFileSync(join('supabase/migrations', name))) }))
    assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='source_accounts'
      AND column_name IN ('access_token','refresh_token','oauth_access_token','oauth_refresh_token','password_encrypted','email_password');`).trim(), '0')
    assert.equal(sql("SELECT count(*) FROM public.emails WHERE subject='Legacy evidence' AND sync_namespace LIKE 'legacy:%';").trim(), '1')
    assert.equal(sql('SELECT count(*) FROM private.legacy_account_credentials;').trim(), '3')
    record('forward upgrade preserves legacy mail identity, quarantines credentials and removes public secret columns', true)
  }

  async function verify({ app, appFetch, admin, login, anonymous, userId, previousId, ownEmailId, otherEmailId,
    email, password, selectRecovery, appLog }) {
    const account = await admin.from('source_accounts').select('id').eq('user_id', previousId)
      .eq('email_address', 'google-vault@example.test').single()
    assert.equal(account.error, null)
    const scope = { userId: previousId, accountId: account.data.id }
    const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
    assert.equal(await vault.migrate(scope), 1)
    const original = await vault.read(scope)
    assert.ok(original.credentials.refreshToken === 'synthetic-google-refresh-only')
    assert.equal(sql('SELECT count(*) FROM public.source_accounts WHERE is_active;').trim(), '0')

    const sender = 'staging-sender@example.test'
    const subject = 'Staging evidence'
    const update = await admin.from('emails').update({ from_address: sender, subject, direction: 'inbound',
      is_read: false, is_archived: false, is_deleted: false, body_fetched: true, body_text: 'I will send the staging checklist tomorrow.' }).eq('id', ownEmailId).eq('user_id', userId)
    assert.equal(update.error, null)
    const rpc = async (name, args) => {
      const result = await login.rpc(name, args)
      assert.equal(result.error, null, name)
      return result.data
    }
    const commitment = await rpc('save_commitment', {
      p_request_key: randomUUID(), p_id: null, p_version: null, p_reference_key: 'staging-recovery',
      p_state: { title: 'Staging recovery commitment', ownerName: 'Fixture owner', ownerEmail: sender, dueOn: null, dueAt: null, status: 'open' },
      p_review: null, p_evidence: [{ emailId: ownEmailId, field: 'subject', quote: subject }],
    })
    const plan = await rpc('create_operator_plan', {
      p_request_key: randomUUID(), p_action: 'mark_read', p_account: null, p_days: null, p_before: null,
      p_sender: sender, p_keep_attachments: false,
    })
    const approval = await rpc('operator_plan_action', {
      p_id: plan.id, p_phase: 'approve', p_scope_hash: plan.previewHash, p_selected: [ownEmailId],
    })
    const executed = await rpc('operator_plan_action', {
      p_id: plan.id, p_phase: 'execute', p_scope_hash: approval.approvedHash, p_selected: null,
    })
    assert.equal(executed.status, 'executed')
    record('staging stores an AEAD credential, a cited commitment and a verified Operator action before backup', true)

    // Structural fixture for persistence/recovery, not a model quality claim.
    const livingScope = await rpc('read_living_scope', {p_source:ownEmailId})
    const stored = await admin.rpc('store_living_analysis', {p_actor:userId,p_source:ownEmailId,p_fingerprint:livingScope.fingerprint,
      p_model:'staging-structural-fixture',p_metrics:{},p_events:[{source:ownEmailId,origin:ownEmailId,item:1,kind:'create',certainty:'firm',
        title:'Staging checklist',quote:'I will send the staging checklist tomorrow.',owner:sender,due:null,blocked:null,referenceKey:'living:staging-memory'}]})
    assert.equal(stored.error,null)
    const reviewArgs={p_analysis:stored.data,p_index:0,p_version:0,p_ledger_version:null,p_request:randomUUID(),p_action:'dismiss',p_reason:'not_relevant'}
    await rpc('decide_living_review',reviewArgs)
    record('staging stores a source-bound synthetic dismissal before the post-upgrade backup',true)

    const expected = fingerprints(sql, afterTables)
    const archive = backup('after-upgrade')
    const afterSnapshot = randomUUID()
    sql(`INSERT INTO public.emails(id,user_id,from_address,subject)
      VALUES('${afterSnapshot}','${userId}','staging-sender@example.test','After snapshot');`)
    const intact = readFileSync(archive.path)
    const changed = Buffer.from(intact)
    changed[changed.length - 1] ^= 1
    writeFileSync(archive.path, changed)
    assert.throws(() => restore(archive, recoveryAfter), /Backup checksum mismatch/)
    assert.equal(recoverySql('inboxai_recovery_bootstrap',
      "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname='inboxai_recovery_after');"), 'f')
    writeFileSync(archive.path, intact)
    record('restore rejects a damaged archive before creating the target database', true)

    const cron = '/api/cron/sync-emails'
    record('staging cron denies unauthenticated callers', (await appFetch(cron)).status === 401)
    const monitor = await startMonitor({ app, cron, loopbackFetch, evidence })
    try {
      const initial = await monitor.probe()
      assert.deepEqual([initial.liveness, initial.scheduler], [200, 200])
      const faultStarted = performance.now()
      docker(['stop','--timeout','2','rest'])
      for (let i = 0; i < 3; i++) {
        const sample = await monitor.probe()
        assert.deepEqual([sample.liveness, sample.scheduler], [200, 500])
        assert.equal(evidence.alerts.length, i === 0 ? 0 : 1)
      }
      assert.deepEqual(evidence.alerts.map(event => event.state), ['open'])
      record('stopped PostgREST triggers one local alert while Next liveness stays 200', true)
      record('cron error response exposes no raw upstream details', monitor.safeFailure())

      restore(archive, recoveryAfter)
      const query = source => recoverySql(recoveryAfter, source)
      assert.deepEqual(fingerprints(query, afterTables), expected)
      assert.equal(query(`SELECT count(*) FROM public.emails WHERE id='${afterSnapshot}';`), '0')
      record('post-upgrade restore preserves the selected auth, mail, vault, ledger and Operator row fingerprints', true)
      docker(['up','-d','--pull','never','recovery-auth','recovery-rest'])
      await waitForRecovery(loopbackFetch)
      selectRecovery()
      for (let i = 0; i < 2; i++) {
        const sample = await monitor.probe()
        assert.deepEqual([sample.liveness, sample.scheduler], [200, 200])
        assert.equal(evidence.alerts.length, i + 1)
      }
      evidence.recoveryMs = Math.round(performance.now() - faultStarted)
      assert.deepEqual(evidence.alerts.map(event => event.state), ['open', 'resolved'])
      assert.equal(evidence.alerts[0].incident, evidence.alerts[1].incident)
      record('cutover to restored PostgREST clears the same local alert after two healthy probes', true)

      const restoredUser = await login.auth.signInWithPassword({ email, password })
      assert.equal(restoredUser.error, null)
      assert.equal(restoredUser.data.user.id, userId)
      assert.equal((await appFetch('/inbox')).status, 200)
      const own = await login.from('emails').select('id,is_read').in('id', [ownEmailId, otherEmailId])
      const publicRead = await anonymous.from('emails').select('id')
      assert.equal(own.error, null)
      assert.equal(publicRead.error, null)
      assert.deepEqual(own.data, [{ id: ownEmailId, is_read: true }])
      assert.deepEqual(publicRead.data, [])
      record('restored GoTrue login, Next Inbox, owner isolation and anonymous RLS work over HTTP', true)

      const restoredCommitment = await rpc('read_commitment', { p_id: commitment.id, p_limit: 10, p_before_version: null })
      const detail = await appFetch('/api/operator/' + plan.id)
      assert.equal(detail.status, 200)
      const restoredPlan = await detail.json()
      assert.equal(restoredCommitment.history[0].sources[0].emailId, ownEmailId)
      assert.equal(restoredPlan.outcome.events[0].event, 'verified')
      assert.equal(restoredPlan.outcome.events[0].matched, 1)
      record('restored application reads the same commitment source and Operator verification receipt', true)

      const restoredReview=await rpc('read_living_review',{p_analysis:stored.data})
      assert.equal(restoredReview.events[0].disposition.active,true)
      assert.equal(restoredReview.events[0].disposition.version,1)
      assert.equal((await rpc('decide_living_review',reviewArgs)).replayed,true)
      await rpc('decide_living_review',{...reviewArgs,p_version:1,p_request:randomUUID(),p_action:'restore',p_reason:null})
      assert.equal((await rpc('read_living_review',{p_analysis:stored.data})).events[0].disposition.active,false)
      assert.equal(sql(`SELECT count(*) FROM private.living_review_history WHERE user_id='${userId}';`).trim(),'1')
      record('restored review history replays the same receipt and supports explicit undo without changing the source database',true)

      const otherOnly = new CredentialVault(admin, parseKeyring(JSON.stringify({ local2: '22'.repeat(32) }), 'local2'))
      await assert.rejects(otherOnly.read(scope), { code: 'integrity' })
      assert.ok(JSON.stringify(await vault.read(scope)) === JSON.stringify(original))
      assert.equal((await login.rpc('read_account_credential', { p_user_id: previousId, p_account_id: scope.accountId })).error?.code, '42501')
      record('restored credential decrypts only with the original key present and stays inaccessible to a user JWT', true)

      // Advance only the recovery database, then confirm that the source still has its checkpoint state.
      const undo = await rpc('operator_outcome_action', {
        p_id: plan.id, p_operation: 'undo', p_request_key: randomUUID(), p_undo_hash: restoredPlan.outcome.undoHash,
      })
      assert.equal(undo.event, 'undone')
      const restoredMail = await login.from('emails').select('is_read').eq('id', ownEmailId).single()
      assert.equal(restoredMail.error, null)
      assert.equal(restoredMail.data.is_read, false)
      assert.equal(sql(`SELECT is_read FROM public.emails WHERE id='${ownEmailId}';`).trim(), 't')
      assert.equal(sql(`SELECT count(*) FROM public.emails WHERE id='${afterSnapshot}';`).trim(), '1')
      record('restored Operator can undo and the source database is unchanged by recovery writes', true)

      const lines = appLog().split('\n').filter(line => line.startsWith('{"level":"error","component":"cron.sync"'))
      evidence.appErrors = lines.map(line => JSON.parse(line))
      assert.equal(evidence.appErrors.length, 3)
      assert.ok(evidence.appErrors.every(entry => JSON.stringify(entry) ===
        '{"level":"error","component":"cron.sync","code":"account_lookup_failed"}'))
      const visible = appLog() + JSON.stringify([evidence.alerts, evidence.probes, evidence.appErrors])
      assert.ok([cronSecret, password, email, sender, subject, 'synthetic-google-refresh-only'].every(value => !visible.includes(value)))
      record('staging app logs, probe records and delivered alerts omit synthetic credentials and mail metadata', true)
    } finally {
      await monitor.close()
    }
  }

  return { assertIsolation, beforeUpgrade, checkUpgrade, verify, evidence, cronSecret,
    close: () => rmSync(scratch, { recursive: true, force: true }) }
}

async function waitForRecovery(loopbackFetch) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const ready = await Promise.all(['http://127.0.0.1:56998/health','http://127.0.0.1:56401/'].map(
      async url => {
        try {
          const response = await loopbackFetch(url, { signal: AbortSignal.timeout(1000) })
          await response.body?.cancel()
          return response.ok
        } catch { return false }
      }))
    if (ready.every(Boolean)) return
    await delay(250)
  }
  throw new Error('Recovery Auth or REST did not become ready')
}

async function startMonitor({ app, cron, loopbackFetch, evidence }) {
  let failed = 0, healthy = 0, incident = null, failureSafe = true
  const sink = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/alerts') { res.writeHead(404).end(); return }
    let raw = ''
    for await (const chunk of req) {
      raw += chunk
      if (raw.length > 4096) { res.writeHead(413).end(); return }
    }
    try { evidence.alerts.push(JSON.parse(raw)); res.writeHead(204).end() } catch { res.writeHead(400).end() }
  })
  await new Promise((resolve, reject) => sink.once('error', reject).listen(0, '127.0.0.1', resolve))
  async function send(state) {
    const response = await loopbackFetch('http://127.0.0.1:' + sink.address().port + '/alerts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ check: 'staging.cron.sync', state, incident, at: new Date().toISOString() }),
    })
    assert.equal(response.status, 204)
  }
  return {
    async probe() {
      const [live, scheduler] = await Promise.all([
        loopbackFetch(app + '/api/health'),
        loopbackFetch(app + cron, { headers: { authorization: 'Bearer ' + cronSecret } }),
      ])
      const result = { at: new Date().toISOString(), liveness: live.status, scheduler: scheduler.status }
      await live.body?.cancel()
      const body = await scheduler.json()
      if (!scheduler.ok) failureSafe &&= JSON.stringify(body) === '{"error":"Failed to fetch accounts"}'
      evidence.probes.push(result)
      if (live.ok && scheduler.ok) {
        failed = 0
        if (++healthy >= 2 && incident) { await send('resolved'); incident = null }
      } else {
        healthy = 0
        if (++failed >= 2 && !incident) { incident = randomUUID(); await send('open') }
      }
      return result
    },
    safeFailure: () => failureSafe,
    close: () => new Promise(resolve => { sink.close(resolve); sink.closeAllConnections() }),
  }
}
