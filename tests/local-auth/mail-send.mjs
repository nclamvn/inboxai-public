import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { simpleParser } from 'mailparser'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'
import { MailSendStore } from '../../src/lib/mail-send/store.ts'
import { executeMailSend } from '../../src/lib/mail-send/execute.ts'
import { DatabaseSyncStore } from '../../src/lib/sync/store.ts'
import { vaultKeys } from './vault.mjs'

const token = 'synthetic-local-gmail-send-token'
const accountEmail = 'send-fixture@example.test'
const draft = { to: ['recipient@example.test'], cc: [], bcc: ['private@example.test'], subject: 'Cam kết giao hàng', text: 'Nội dung kiểm thử' }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export async function startMailProvider() {
  const state = { mode: 'accepted', calls: [], reads: 0, messages: new Map() }
  const server = createServer(async (request, response) => {
    const json = (body, status = 200) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    try {
      if (request.headers.authorization !== `Bearer ${token}`) return json({}, 401)
      const url = new URL(request.url, 'http://localhost')
      const suffix = url.pathname.replace(/^\/gmail\/v1\/users\/me\/messages/, '')
      if (request.method === 'POST' && suffix === '/send') {
        const data = JSON.parse(Buffer.concat(await Array.fromAsync(request)).toString('utf8'))
        const mail = await simpleParser(Buffer.from(data.raw, 'base64url'))
        assert.equal(mail.from.value[0].address, accountEmail)
        assert.ok(mail.to.value.every(r => r.address.endsWith('@example.test')))
        assert.ok(mail.bcc.value.every(r => r.address.endsWith('@example.test')))
        const id = `fake-${state.calls.length + 1}`
        state.calls.push({ id, mail, threadId: data.threadId })
        await delay(100) // Leave time for the competing real HTTP request.
        if (state.mode === 'rejected') return json({ error: 'synthetic-provider-private-detail' }, 403)
        state.messages.set(id, mail)
        if (state.mode === 'lost') return response.destroy()
        return json({ id })
      }
      state.reads++
      if (request.method === 'GET' && !suffix) {
        assert.equal(url.searchParams.get('labelIds'), 'SENT')
        const match = [...state.messages].filter(([, mail]) => url.searchParams.get('q') === `rfc822msgid:${mail.messageId}`)
        return json({ messages: state.mode === 'unindexed' ? [] : match.map(([id]) => ({ id })) })
      }
      if (request.method === 'GET' && suffix === '/original-uid') {
        return json({ id: 'original-uid', threadId: 'thread-fixture', payload: { headers: [
          { name: 'Message-ID', value: '<original@example.test>' }, { name: 'Subject', value: 'Cam kết giao hàng' },
        ] } })
      }
      const id = suffix.slice(1)
      const mail = state.messages.get(id)
      return mail ? json({ id, labelIds: ['SENT'], payload: { headers: [{ name: 'Message-ID', value: mail.messageId }] } }) : json({}, 404)
    } catch {
      return json({}, 500)
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) }
}

export async function rehearseMailSend({ sql, admin, login, anonymous, userId, otherUserId, record, appFetch, fixture, smtpWire }) {
  const vault = new CredentialVault(admin, parseKeyring(vaultKeys, 'local1'))
  const accountId = randomUUID(), foreign = randomUUID()
  const credentials = {
    kind: 'google', accessToken: token, expiresAt: new Date(Date.now()+3600000).toISOString(),
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
  }
  await vault.write({ userId, accountId }, credentials, 0, { email_address: accountEmail, display_name: 'Nhóm kiểm thử', provider: 'gmail' })
  await vault.write({ userId: otherUserId, accountId: foreign }, credentials, 0, { email_address: 'foreign-send@example.test', provider: 'gmail' })
  const sourceEmail = randomUUID(), foreignEmail = randomUUID()
  sql(`INSERT INTO public.emails(id,user_id,source_account_id,sync_namespace,original_uid,message_id,subject,from_address)
      VALUES('${sourceEmail}','${userId}','${accountId}','gmail','original-uid','<original@example.test>','Cam kết giao hàng','recipient@example.test'),
      ('${foreignEmail}','${otherUserId}','${foreign}','gmail','foreign-uid','<foreign@example.test>','Private original','foreign@example.test')`)

  const submit = async (key, extra = {}) => {
    const response = await appFetch('/api/emails/send', {
      method: 'POST', signal: AbortSignal.timeout(40_000),
      headers: { 'Content-Type': 'application/json', ...(key && { 'Idempotency-Key': key }) },
      body: JSON.stringify({ sourceAccountId: accountId, ...draft, ...extra }),
    })
    return { status: response.status, data: await response.json() }
  }
  const provider = fixture.state
  record('missing send key is rejected before provider dispatch', (await submit(null)).status === 400 && provider.calls.length === 0)
  record('foreign account and foreign reply fail before provider dispatch',
    (await submit(randomUUID(), { sourceAccountId: foreign })).status === 404 &&
    (await submit(randomUUID(), { replyToEmailId: foreignEmail })).status === 404 && provider.calls.length === 0)
  record('malformed recipients are rejected before provider dispatch',
    (await submit(randomUUID(), { to: ['recipient@example.test\r\nBcc: other@example.test'] })).status === 400 && provider.calls.length === 0)

  const denied = await Promise.all([
    login.rpc('begin_mail_send', { p_user_id: userId, p_account_id: accountId, p_request_key: randomUUID(), p_request_hash: hash(draft) }),
    anonymous.rpc('finish_mail_send', { p_user_id: userId, p_account_id: accountId, p_operation_id: randomUUID(), p_state: 'unknown' }),
    login.schema('private').from('mail_send_operations').select('*'),
  ])
  record('browser roles cannot read or claim private send operations', denied.every(result => result.error))

  const key = randomUUID()
  const reply = { replyToEmailId: sourceEmail }
  const concurrent = await Promise.all([submit(key, reply), submit(key, reply)])
  const first = concurrent.find(result => result.data.state === 'accepted')
  assert.ok(first)
  record('concurrent Gmail route calls dispatch one MIME message', provider.calls.length === 1 &&
    concurrent.every(result => ['accepted', 'dispatching'].includes(result.data.state)))
  const wire = provider.calls[0]
  record('Gmail route preserves Bcc, Unicode and verified reply threading', wire.mail.messageId === first.data.messageId &&
    wire.mail.subject === 'Re: Cam kết giao hàng' && wire.mail.inReplyTo === '<original@example.test>' &&
    wire.mail.bcc.value[0].address === draft.bcc[0] && wire.threadId === 'thread-fixture')
  record('accepted response replays without provider contact', (await submit(key, reply)).data.operationId === first.data.operationId && provider.calls.length === 1)
  record('changed content under the same key conflicts', (await submit(key, { ...reply, text: 'Changed' })).status === 409 && provider.calls.length === 1)

  const lost = randomUUID()
  provider.mode = 'lost'
  const ambiguous = await submit(lost)
  record('Gmail accepted then dropped response leaves durable unknown outcome',
    ambiguous.status === 202 && ambiguous.data.state === 'unknown' && provider.calls.length === 2)
  provider.mode = 'unindexed'
  const missing = await submit(lost)
  const reads = provider.reads
  const throttled = await submit(lost)
  record('unindexed Gmail Sent lookup stays unknown and has durable cooldown', missing.data.state === 'unknown' &&
    throttled.data.state === 'unknown' && provider.reads === reads && provider.calls.length === 2)
  sql(`UPDATE private.mail_send_operations SET next_reconcile_at=NULL WHERE id='${ambiguous.data.operationId}'`)
  provider.mode = 'accepted'
  const reconciled = await submit(lost)
  record('exact Gmail Sent evidence resolves the original operation with no second dispatch',
    reconciled.data.state === 'accepted' && reconciled.data.operationId === ambiguous.data.operationId && provider.calls.length === 2)

  const rejected = randomUUID()
  provider.mode = 'rejected'
  const deniedSend = await submit(rejected)
  const deniedReplay = await submit(rejected)
  record('explicit rejection is terminal and provider error details stay private', deniedSend.status === 422 &&
    deniedReplay.data.state === 'rejected' && provider.calls.length === 3 && !JSON.stringify(deniedSend).includes('synthetic-provider-private-detail'))
  const sent = await login.from('emails').select('original_uid,message_id,body_text').eq('source_account_id', accountId).eq('direction', 'outbound')
  record('accepted Gmail operations appear once in the tenant Sent mirror',
    !sent.error && sent.data.length === 2 && sent.data.every(row => row.body_text === draft.text))
  record('terminal operations discard pending message content',
    Number(sql(`SELECT count(*) FROM private.mail_send_operations WHERE account_id='${accountId}' AND payload IS NULL`)) === 3)

  const wireId = randomUUID()
  await vault.write({ userId, accountId: wireId }, { kind: 'imap', password: 'synthetic-smtp-wire' }, 0, {
    email_address: 'smtp-wire@example.test', provider: 'custom', smtp_host: 'smtp-wire.example.test',
    smtp_port: 465, smtp_secure: true, username: 'smtp-wire@example.test',
  })
  const wireDraft = { sourceAccountId: wireId, to: ['recipient@example.test', 'reject@example.test'] }
  const wireKey = randomUUID()
  const wireResult = await submit(wireKey, wireDraft)
  await submit(wireKey, wireDraft)
  const smtpMail = await simpleParser(smtpWire.state.messages[0]?.raw || '')
  record('actual TLS SMTP accepts a subset, hides Bcc header and never repeats a partial send',
    wireResult.status === 409 && wireResult.data.state === 'partial' && smtpWire.state.messages.length === 1 &&
    smtpWire.state.authenticated === 1 && smtpMail.messageId === wireResult.data.messageId &&
    !smtpMail.bcc && smtpWire.state.messages[0].recipients.includes(draft.bcc[0]) &&
    !smtpWire.state.messages[0].recipients.includes('reject@example.test'))

  smtpWire.state.mode = 'lost'
  const smtpLost = randomUUID()
  const lostSmtpDraft = { sourceAccountId: wireId }
  const lostSmtpResult = await submit(smtpLost, lostSmtpDraft)
  const lostSmtpReplay = await submit(smtpLost, lostSmtpDraft)
  record('SMTP socket loss after DATA remains unknown without another SMTP transaction',
    lostSmtpResult.status === 202 && lostSmtpReplay.data.state === 'unknown' && smtpWire.state.messages.length === 2)

  sql(`UPDATE public.source_accounts SET smtp_host='127.0.0.1', imap_host='127.0.0.1', imap_port=993, imap_secure=true WHERE id='${wireId}'`)
  const blockedKey = randomUUID()
  const blockedSend = await submit(blockedKey, lostSmtpDraft)
  const blockedReplay = await submit(blockedKey, lostSmtpDraft)
  record('stored loopback SMTP target has one terminal rejection and sends no mail',
    blockedSend.status === 422 && blockedSend.data.state === 'rejected' &&
    blockedReplay.data.operationId === blockedSend.data.operationId && blockedReplay.data.state === 'rejected' &&
    smtpWire.state.messages.length === 2 && smtpWire.state.authenticated === 2)

  const blockedAccount = await appFetch('/api/source-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email_address: 'blocked-mail@example.test', provider: 'custom', username: 'synthetic', password: 'synthetic',
      imap_host: '169.254.169.254', imap_port: 993, imap_secure: true, smtp_host: 'smtp-wire.example.test' }) })
  record('account setup rejects IMAP metadata destination before saving credentials or starting SMTP',
    blockedAccount.status === 400 && (await blockedAccount.json()).error === 'IMAP connection failed' &&
    Number(sql("SELECT count(*) FROM public.source_accounts WHERE email_address='blocked-mail@example.test'")) === 0 &&
    smtpWire.state.authenticated === 2)

  const blockedBodyId = randomUUID(), blockedAttachmentId = randomUUID()
  sql(`INSERT INTO public.emails(id,user_id,source_account_id,sync_namespace,original_uid,message_id,subject,from_address,body_fetched)
       VALUES('${blockedBodyId}','${userId}','${wireId}','INBOX:123','42','<blocked@example.test>','Synthetic blocked body','sender@example.test',false);
       INSERT INTO public.attachments(id,email_id,filename,sync_part_key) VALUES('${blockedAttachmentId}','${blockedBodyId}','synthetic.txt','0');`)
  const body = await appFetch(`/api/emails/${blockedBodyId}`)
  const attachment = await appFetch(`/api/attachments/${blockedAttachmentId}`)
  record('lazy body read returns no content from a stored private IMAP target',
    body.status === 200 && (await body.json()).email.body_text === null &&
    Number(sql(`SELECT count(*) FROM public.emails WHERE id='${blockedBodyId}' AND body_text IS NULL`)) === 1)
  assert.equal(attachment.status, 500)
  record('attachment read reaches the IMAP policy for an owned source account',
    (await attachment.json()).error === 'Attachment fetch failed')
  sql(`UPDATE public.emails SET source_account_id='${foreign}' WHERE id='${blockedBodyId}'`)
  const foreignAttachment = await appFetch(`/api/attachments/${blockedAttachmentId}`)
  record('attachment cannot use a source account owned by another tenant',
    foreignAttachment.status === 400 && (await foreignAttachment.json()).error === 'Source account not found')

  const smtpId = randomUUID()
  await vault.write({ userId, accountId: smtpId }, { kind: 'imap', password: 'synthetic' }, 0, { email_address: 'smtp@example.test', provider: 'custom' })
  const store = new MailSendStore(admin)
  const payload = { ...draft, from: { name: 'SMTP Fixture', address: 'smtp@example.test' } }
  const smtpScope = { userId, accountId: smtpId, key: randomUUID(), hash: hash(payload) }
  let dispatches = 0
  const prepare = async () => ({ payload, dispatch: async () => { dispatches++; return { state: 'partial' } } })
  const smtpPartial = await executeMailSend(store, smtpScope, prepare, async () => null)
  await executeMailSend(store, smtpScope, prepare, async () => null)
  record('partial SMTP acceptance is durable and never re-dispatched for the same key',
    smtpPartial.state === 'partial' && dispatches === 1)

  const smtpUnknown = { ...smtpScope, key: randomUUID() }
  const crashed = await store.begin(smtpUnknown, payload)
  sql(`UPDATE private.mail_send_operations SET created_at=clock_timestamp()-interval '91 seconds' WHERE id='${crashed.id}'`)
  const afterCrash = await executeMailSend(store, smtpUnknown, prepare, async () => { throw new Error('Unexpected SMTP lookup') })
  record('abandoned SMTP dispatch expires to unknown and grants no new dispatch', afterCrash.state === 'unknown' && dispatches === 1)

  const lostDb = { ...smtpScope, key: randomUUID() }
  const normalFinish = store.finish.bind(store)
  const lostFinish = {
    begin: store.begin.bind(store), async finish(...args) {
      await normalFinish(...args)
      throw new Error('synthetic lost database acknowledgement')
    },
  }
  const lostDbResult = await executeMailSend(lostFinish, lostDb, prepare, async () => null)
  const recovered = await executeMailSend(store, lostDb, prepare, async () => null)
  record('lost database acknowledgement recovers the committed receipt without a second send',
    lostDbResult.state === 'unknown' && recovered.state === 'partial' && dispatches === 2)

  const sync = new DatabaseSyncStore(admin)
  const syncScope = { userId, accountId: smtpId, provider: 'imap' }
  const lease = await sync.claim(syncScope)
  await sync.commit(syncScope, lease, { cursor: { provider: 'imap', phase: 'idle', validity: '123' },
    namespace: 'INBOX:123', generation: randomUUID(), messages: [], deleted: [], complete: true, finalize: true })
  await sync.release(syncScope, lease, { pending: false })
  record('IMAP reconciliation preserves local SMTP sent receipts',
    Number(sql(`SELECT count(*) FROM public.emails WHERE source_account_id='${smtpId}' AND sync_namespace='smtp-sent' AND NOT is_deleted`)) === 2)
  await assert.rejects(store.finish({ ...smtpScope, userId: otherUserId }, smtpPartial, { state: 'unknown' }), { status: 404 })
  record('foreign tenant cannot mutate a terminal send receipt', true)
}
