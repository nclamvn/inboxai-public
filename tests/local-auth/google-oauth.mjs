import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { simpleParser } from 'mailparser'
import { gmailModifyScope, gmailReadScope, gmailSendScope, googleEmailScope } from '../../src/lib/gmail/scopes.ts'

export const gmailFixtureEmail = 'gmail-reader@example.test'
export const gmailFixtureSubject = 'Biên bản giao hàng Gmail giả lập'
export const googleClientId = 'synthetic-oauth-client.apps.googleusercontent.com'
export const googleClientSecret = 'synthetic-oauth-client-secret'

export async function startGoogleOAuthFixture() {
  const codes = new Map(), access = new Map(), refresh = new Map()
  const calls = { exchanges: 0, refreshes: 0, reads: 0, sendAttempts: 0, sent: [], modifications: [] }
  let sendRevoked = false
  function issue(grant, withRefresh) {
    const accessToken = randomUUID(), refreshToken = withRefresh ? randomUUID() : undefined
    access.set(accessToken, grant)
    if (refreshToken) refresh.set(refreshToken, grant)
    return { access_token: accessToken, refresh_token: refreshToken, expires_in: 3600,
      token_type: 'Bearer', scope: grant.scopes.join(' ') }
  }
  const defaultLabels = item => item.sent ? ['SENT'] : ['INBOX', 'UNREAD']
  function changeLabels(box, id, add, remove) {
    const item = box.messages.get(id)
    assert.ok(item)
    const before = item.labelIds ?? defaultLabels(item)
    const added = add.filter(label => !before.includes(label))
    const removed = remove.filter(label => before.includes(label))
    if (added.length || removed.length) {
      const entry = { id: String(101 + box.history.length) }
      if (added.length) entry.labelsAdded = [{ message: { id }, labelIds: added }]
      if (removed.length) entry.labelsRemoved = [{ message: { id }, labelIds: removed }]
      box.history.push(entry)
      item.historyId = entry.id
      item.labelIds = [...before.filter(label => !removed.includes(label)), ...added]
    }
    return { id, historyId: item.historyId, labelIds: item.labelIds ?? before }
  }
  const server = createServer(async (request, response) => {
    function json(body, status = 200) {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    try {
      const { pathname, searchParams } = new URL(request.url, 'http://127.0.0.1')
      if (pathname === '/token' && request.method === 'POST') {
        const body = new URLSearchParams(Buffer.concat(await Array.fromAsync(request)).toString())
        assert.equal(body.get('client_id'), googleClientId)
        assert.equal(body.get('client_secret'), googleClientSecret)
        if (body.get('grant_type') === 'refresh_token') {
          calls.refreshes++
          const grant = refresh.get(body.get('refresh_token'))
          return grant ? json(issue(grant, false)) : json({ error: 'invalid_grant' }, 400)
        }
        calls.exchanges++
        assert.equal(body.get('grant_type'), 'authorization_code')
        const code = body.get('code'), grant = codes.get(code)
        if (!grant) return json({ error: 'invalid_grant' }, 400)
        assert.equal(body.get('redirect_uri'), grant.callback)
        assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), grant.challenge)
        codes.delete(code)
        return json(issue(grant, grant.withRefresh))
      }

      const grant = access.get(request.headers.authorization?.slice('Bearer '.length))
      if (!grant) return json({ error: 'invalid_token' }, 401)
      if (pathname === '/oauth2/v2/userinfo') {
        return json({ id: grant.subject, email: grant.email, verified_email: true })
      }
      const gmail = '/gmail/v1/users/me'
      if (pathname === gmail + '/messages/send' && request.method === 'POST') {
        calls.sendAttempts++
        if (sendRevoked || !grant.scopes.includes(gmailSendScope)) {
          return json({ error: { errors: [{ reason: 'insufficientPermissions' }] } }, 403)
        }
        const { raw, threadId } = JSON.parse(Buffer.concat(await Array.fromAsync(request)).toString())
        const mail = await simpleParser(Buffer.from(raw, 'base64url'))
        assert.equal(mail.from.value[0].address, grant.email)
        assert.ok(mail.to.value.every(recipient => recipient.address.endsWith('@example.test')))
        const id = `synthetic-sent-${calls.sent.length + 1}`
        const attachments = mail.attachments.map(file => ({ filename: file.filename,
          contentType: file.contentType, data: file.content.toString('base64') }))
        calls.sent.push({ subject: mail.subject, messageId: mail.messageId, from: mail.from.value[0].address,
          to: mail.to.value.map(address => address.address), cc: mail.cc?.value.map(address => address.address) ?? [],
          inReplyTo: mail.inReplyTo, threadId, body: mail.text.trim(), attachments })
        if (grant.mailbox) {
          grant.mailbox.messages.set(id, { id, at: new Date().toISOString(), from: grant.email, subject: mail.subject,
            body: mail.text, historyId: String(101 + grant.mailbox.history.length), messageId: mail.messageId, inReplyTo: mail.inReplyTo, threadId, sent: true, attachments,
            to: mail.to.text, cc: mail.cc?.text, references: [].concat(mail.references ?? []).join(' ') })
          grant.mailbox.history.push(id)
          if (grant.mailbox.dropSendAcknowledgement) {
            grant.mailbox.dropSendAcknowledgement = false
            response.destroy()
            return
          }
        }
        return json({ id })
      }
      if (!grant.scopes.includes(gmailReadScope)) return json({ error: 'read_scope_missing' }, 403)
      calls.reads++
      if (grant.mailbox) {
        const box = grant.mailbox
        if (!box.online) {
          box.drops++
          response.destroy()
          return
        }
        const offset = Number(searchParams.get('pageToken') ?? 0)
        const limit = Number(searchParams.get('maxResults') ?? 30)
        const paginate = rows => ({
          page: rows.slice(offset, offset + limit),
          nextPageToken: offset + limit < rows.length ? String(offset + limit) : undefined,
        })
        const historyId = String(100 + box.history.length)
        if (pathname === gmail + '/profile') return json({ historyId })
        if (pathname === gmail + '/messages') {
          const q = searchParams.get('q')
          if (q) return json({ messages: [...box.messages.values()].filter(item =>
            item.sent && q === 'rfc822msgid:' + item.messageId).map(item => ({ id: item.id })) })
          box.fullReads++
          const { page, nextPageToken } = paginate([...box.messages.keys()].reverse())
          return json({ messages: page.map(id => ({ id })), nextPageToken })
        }
        if (pathname === gmail + '/history') {
          const start = Number(searchParams.get('startHistoryId'))
          box.historyStarts.push(start)
          const { page, nextPageToken } = paginate(box.history.slice(Math.max(0, start - 100)))
          return json({ historyId, nextPageToken, history: page.map(entry =>
            typeof entry === 'string' ? { messagesAdded: [{ message: { id: entry } }] } : entry) })
        }
        const [id, section, attachmentId] = pathname.startsWith(gmail + '/messages/')
          ? pathname.slice((gmail + '/messages/').length).split('/') : []
        const item = box.messages.get(id)
        if (!item) return json({}, 404)
        if (section === 'modify' && request.method === 'POST') {
          if (!grant.scopes.includes(gmailModifyScope) || box.denyModify) return json({ error: 'modify_scope_missing' }, 403)
          const { addLabelIds = [], removeLabelIds = [] } = JSON.parse(Buffer.concat(await Array.fromAsync(request)).toString())
          const labels = [...addLabelIds, ...removeLabelIds]
          assert.equal(labels.length, 1)
          assert.ok(['INBOX', 'UNREAD', 'STARRED'].includes(labels[0]))
          const modified = changeLabels(box, id, addLabelIds, removeLabelIds)
          calls.modifications.push({ account: grant.email, id, addLabelIds, removeLabelIds, historyId: modified.historyId })
          if (box.dropModifyAcknowledgement) {
            box.dropModifyAcknowledgement = false
            response.destroy()
            return
          }
          return json(modified)
        }
        if (searchParams.get('format') === 'minimal') {
          return json({ id, historyId: item.historyId, labelIds: item.labelIds ?? defaultLabels(item) })
        }
        const parts = (item.attachments ?? []).map((file, index) => ({
          filename: file.filename, mimeType: file.contentType, partId: String(index + 1),
          body: { attachmentId: 'part-' + (index + 1), size: Buffer.from(file.data, 'base64').length },
          headers: [{ name: 'Content-Disposition', value: 'attachment' }],
        }))
        if (section === 'attachments') {
          const index = parts.findIndex(part => part.body.attachmentId === attachmentId)
          return index < 0 ? json({}, 404) : json({
            size: parts[index].body.size, data: Buffer.from(item.attachments[index].data, 'base64').toString('base64url'),
          })
        }
        const headers = { Subject: item.subject, From: item.from, To: item.to ?? grant.email, Cc: item.cc, 'Message-ID': item.messageId,
          'In-Reply-To': item.inReplyTo, 'Reply-To': item.replyTo, References: item.references }
        const text = { mimeType: 'text/plain', body: { data: Buffer.from(item.body).toString('base64url') } }
        return json({ id, threadId: item.threadId, internalDate: String(Date.parse(item.at)), historyId: item.historyId, labelIds: item.labelIds ?? defaultLabels(item),
          payload: { ...(parts.length ? { mimeType: 'multipart/mixed', parts: [{ ...text, partId: '0' }, ...parts] } : text),
            headers: Object.entries(headers).filter(([, value]) => value).map(([name, value]) => ({ name, value })) },
        })
      }
      if (pathname === gmail + '/profile' || pathname === gmail + '/history') return json({ historyId: '100' })
      if (pathname === gmail + '/messages') return json({ messages: [{ id: 'fixture-inbox-message' }] })
      if (pathname === gmail + '/messages/fixture-inbox-message') return json({
        id: 'fixture-inbox-message', internalDate: String(Date.now()), labelIds: ['INBOX'],
        payload: { mimeType: 'text/plain', body: { data: Buffer.from('Email nội bộ dùng để kiểm thử quyền đọc.').toString('base64url') },
          headers: [{ name: 'Subject', value: gmailFixtureSubject }, { name: 'From', value: 'warehouse@example.test' }] },
      })
      return json({}, 404)
    } catch {
      return json({ error: 'unexpected_fixture_request' }, 500)
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

  return {
    url: `http://127.0.0.1:${server.address().port}`, calls,
    registerMailbox(email, canSend = false, canModify = false) {
      const box = { online: true, drops: 0, fullReads: 0, historyStarts: [], messages: new Map(), history: [] }
      const grant = { mailbox: box, email, subject: email, scopes: [gmailReadScope, googleEmailScope, ...(canSend ? [gmailSendScope] : []), ...(canModify ? [gmailModifyScope] : [])] }
      return {
        tokens: issue(grant, true), box,
        revoke() {
          for (const tokens of [access, refresh]) {
            for (const [token, owner] of tokens) if (owner.mailbox === box) tokens.delete(token)
          }
        },
        changeLabels: (id, add, remove) => changeLabels(box, id, add, remove),
        deliver(items) {
          for (const item of items) {
            box.messages.set(item.id, { ...item, historyId: String(101 + box.history.length) })
            box.history.push(item.id)
          }
        },
      }
    },
    setSendRevoked(value) { sendRevoked = value },
    revokeAllGrants() { access.clear(); refresh.clear() },
    authorize(url, decision, app, intent) {
      const params = new URL(url).searchParams
      const callback = new URL(params.get('redirect_uri'))
      assert.equal(callback.origin, app)
      assert.equal(callback.pathname, intent === 'read' ? '/api/auth/google/callback' : '/api/source-accounts/google/callback')
      assert.equal(params.get('client_id'), googleClientId)
      assert.equal(params.get('code_challenge_method'), 'S256')
      const challenge = params.get('code_challenge')
      const state = params.get('state')
      assert.match(challenge, /^[A-Za-z0-9_-]{43}$/)
      assert.match(state, /^[A-Za-z0-9_-]{43}$/)
      assert.equal(params.has('code_verifier'), false)
      assert.equal(params.get('access_type'), 'offline')
      const send = intent === 'send'
      const reconnect = intent === 'reconnect'
      const expectedScopes = reconnect ? decision.requestedScopes : [send ? gmailSendScope : gmailReadScope, googleEmailScope]
      assert.deepEqual(params.get('scope').split(/\s+/).sort(), [...expectedScopes].sort())
      assert.equal(params.get('include_granted_scopes'), send || (reconnect && expectedScopes.includes(gmailSendScope)) ? 'true' : null)
      assert.equal(params.get('login_hint'), reconnect ? decision.expectedEmail : send ? gmailFixtureEmail : null)
      const originalCallback = callback.toString()
      callback.searchParams.set('state', state)
      if (decision.denied) callback.searchParams.set('error', 'access_denied')
      else {
        const code = randomUUID()
        codes.set(code, { ...decision, challenge, callback: originalCallback,
          subject: decision.subject ?? 'synthetic-google-subject', email: decision.email ?? gmailFixtureEmail })
        callback.searchParams.set('code', code)
      }
      return callback.toString()
    },
    close: () => new Promise(resolve => server.close(resolve)),
  }
}
