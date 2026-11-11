import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const collection = '/api/commitments'

function mutation(method, body, key = randomUUID()) {
  return { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) }
}

async function expectStatus(response, status) {
  const result = await response.json()
  assert.equal(response.status, status, JSON.stringify(result))
  return result
}

export async function rehearseCommitments({ app, appFetch, loopbackFetch, admin, sql, login, anonymous,
  foreignToken, userId, ownEmailId, otherEmailId, record }) {
  record('forward migration preserves the legacy task and starts an empty commitment ledger', sql(
    "SELECT (SELECT count(*) FROM public.action_items WHERE title='Legacy task before ledger')=1 AND (SELECT count(*) FROM private.commitments)=0;",
  ).trim() === 't')
  const foreignFetch = (path, init) => loopbackFetch(app + path, {
    ...init, headers: { ...init?.headers, Authorization: `Bearer ${foreignToken}` },
  })
  record('anonymous Next route and PostgREST RPC both require authentication',
    (await loopbackFetch(app + collection)).status === 401 &&
    Boolean((await anonymous.rpc('list_commitments', { p_limit: 20, p_before_id: null })).error))

  const originalQuote = 'Giao 200 bộ linh kiện vào 15/11.'
  const partialQuote = 'Phương án dự kiến giao trước 50 bộ vào 13 hoặc 14/11.'
  const originalBody = `${originalQuote} ${partialQuote}`
  const movedQuote = 'Xác nhận lùi ngày giao 200 bộ sang 19/11.'
  const conflictingQuote = 'Phiếu vận tải vẫn ghi ngày 18/11.'
  const completedQuote = 'Kho đã nhận đủ 200 bộ.'
  const movedId = randomUUID(), conflictId = randomUUID(), completedId = randomUUID()
  const accountA = randomUUID(), accountB = randomUUID()
  assert.equal((await admin.from('source_accounts').insert([
    { id: accountA, user_id: userId, email_address: 'purchasing@example.test', provider: 'custom' },
    { id: accountB, user_id: userId, email_address: 'warehouse@example.test', provider: 'custom' },
  ])).error, null)
  assert.equal((await admin.from('emails').update({
    source_account_id: accountA, subject: 'Lịch giao PO-1042', body_text: originalBody,
  }).eq('id', ownEmailId).eq('user_id', userId)).error, null)
  assert.equal((await admin.from('emails').update({ subject: 'Nguồn của người khác' }).eq('id', otherEmailId)).error, null)
  assert.equal((await admin.from('emails').insert([
    { id: movedId, user_id: userId, source_account_id: accountA, subject: 'Đổi lịch PO-1042', body_text: movedQuote },
    { id: conflictId, user_id: userId, source_account_id: accountB, subject: 'Phiếu vận tải', body_text: conflictingQuote },
    { id: completedId, user_id: userId, source_account_id: accountB, subject: 'Xác nhận nhận hàng', body_text: completedQuote },
  ].map(email => ({ from_address: 'supplier@example.test', body_fetched: true, ...email })))).error, null)
  const evidence = (emailId, quote) => ({ emailId, field: 'body_text', quote })
  const state = { title: 'Giao 200 bộ linh kiện', ownerName: 'Nhà cung cấp', ownerEmail: 'supplier@example.test',
    dueOn: '2026-11-15', dueAt: null, status: 'open' }
  const referenceKey = 'po-1042:delivery'
  const command = { referenceKey, state, evidence: [evidence(ownEmailId, originalQuote)] }
  const createKey = randomUUID()

  const [first, second] = await Promise.all([
    appFetch(collection, mutation('POST', command, createKey)),
    appFetch(collection, mutation('POST', command, createKey)),
  ])
  assert.deepEqual([first.status, second.status].sort(), [200, 201])
  const receipts = await Promise.all([first.json(), second.json()])
  const id = receipts[0].id
  const detailPath = `${collection}/${id}`
  record('concurrent identical creation returns one stable identity and one replay',
    receipts.every(result => result.id === id && result.version === 1) &&
    receipts.filter(result => result.replayed === true).length === 1)
  record('duplicate references and reuse of a key for a different payload both conflict',
    (await appFetch(collection, mutation('POST', command))).status === 409 &&
    (await appFetch(collection, mutation('POST', { ...command, referenceKey: 'different' }, createKey))).status === 409)
  const firstRead = await appFetch(detailPath)
  const original = await expectStatus(firstRead, 200)
  assert.match(firstRead.headers.get('cache-control'), /private, no-store/)
  assert.deepEqual(original.history[0].sources.map(source => [source.quote, source.href, source.availability]),
    [[originalQuote, `/inbox?email=${ownEmailId}`, 'available']])
  const sourceResponse = await expectStatus(await appFetch(`/api/emails/${ownEmailId}`), 200)
  record('history quote and link resolve to the actual tenant-visible source', sourceResponse.email.body_text === originalBody)

  const moved = { ...state, dueOn: '2026-11-19' }
  const revise = { operation: 'revise', expectedVersion: 1, state: moved, evidence: [evidence(movedId, movedQuote)] }
  record('foreign and fabricated source claims cannot create a revision',
    (await appFetch(detailPath, mutation('PATCH', { ...revise, evidence: [{ emailId: otherEmailId, field: 'subject', quote: 'Nguồn của người khác' }] }))).status === 404 &&
    (await appFetch(detailPath, mutation('PATCH', { ...revise, evidence: [evidence(movedId, 'Cụm từ không tồn tại')] }))).status === 422 &&
    (await expectStatus(await appFetch(detailPath), 200)).version === 1)

  const movedReceipt = await expectStatus(await appFetch(detailPath, mutation('PATCH', revise)), 200)
  const oldHead = await expectStatus(await appFetch(detailPath + '?limit=1'), 200)
  const initialPage = await expectStatus(await appFetch(detailPath + `?beforeVersion=${oldHead.nextBeforeVersion}`), 200)
  record('deadline change updates one ledger, preserves the prior due date and paginates revisions',
    movedReceipt.id === id && movedReceipt.version === 2 && oldHead.state.dueOn === '2026-11-19' &&
    oldHead.history[0].changedFields.length === 1 && oldHead.history[0].changedFields[0] === 'dueOn' &&
    initialPage.history[0].state.dueOn === '2026-11-15' && initialPage.nextBeforeVersion === null)

  const review = { operation: 'flag_review', expectedVersion: 2,
    review: { kind: 'conflicting', note: 'Ngày giao khác nhau giữa thư xác nhận và phiếu vận tải.' },
    evidence: [evidence(movedId, movedQuote), evidence(conflictId, conflictingQuote)] }
  assert.equal((await appFetch(detailPath, mutation('PATCH', { ...review, evidence: review.evidence.slice(0, 1) }))).status, 422)
  await expectStatus(await appFetch(detailPath, mutation('PATCH', review)), 200)
  const flagged = await expectStatus(await appFetch(detailPath), 200)
  record('conflicting evidence spans owned mail accounts and retains previously confirmed terms',
    flagged.state.dueOn === moved.dueOn && flagged.state.ownerEmail === moved.ownerEmail &&
    flagged.state.review.kind === 'conflicting' && flagged.history[0].sources.length === 2 &&
    flagged.history[0].sources.every(source => source.availability === 'available'))

  const completed = { operation: 'revise', expectedVersion: 3, state: { ...moved, status: 'completed' },
    evidence: [evidence(completedId, completedQuote)] }
  await expectStatus(await appFetch(detailPath, mutation('PATCH', completed)), 200)
  const done = await expectStatus(await appFetch(detailPath), 200)
  record('explicit completion resolves the review and adds a cited status revision',
    done.state.status === 'completed' && done.state.review === null && done.version === 4 &&
    done.history[0].sources[0].quote === completedQuote &&
    JSON.stringify(done.history[0].changedFields) === '["review","status"]')
  record('stale edits and duplicate unchanged snapshots do not advance history',
    (await appFetch(detailPath, mutation('PATCH', completed))).status === 409 &&
    (await appFetch(detailPath, mutation('PATCH', { ...completed, expectedVersion: 4 }))).status === 422 &&
    (await expectStatus(await appFetch(detailPath), 200)).version === 4)

  const siblingState = { ...state, title: 'Giao trước 50 bộ', ownerName: null, ownerEmail: null, dueOn: null }
  const partialEvidence = [evidence(ownEmailId, partialQuote)]
  const sibling = await expectStatus(await appFetch(collection, mutation('POST', {
    referenceKey: 'po-1042:partial-delivery', state: siblingState, evidence: partialEvidence,
  })), 201)
  const siblingPath = `${collection}/${sibling.id}`
  await expectStatus(await appFetch(siblingPath, mutation('PATCH', {
    operation: 'flag_review', expectedVersion: 1, review: { kind: 'ambiguous', note: 'Chưa rõ ai phụ trách giao đợt đầu.' },
    evidence: partialEvidence,
  })), 200)
  const uncertain = await expectStatus(await appFetch(siblingPath), 200)
  record('separate obligation from the same email has its own identity and unknown fields are preserved',
    sibling.id !== id && uncertain.state.ownerName === null && uncertain.state.dueOn === null &&
    uncertain.state.review.kind === 'ambiguous')
  const racingRevision = dueOn => mutation('PATCH', { operation: 'revise', expectedVersion: 2,
    state: { ...siblingState, dueOn }, evidence: partialEvidence })
  const racing = await Promise.all([
    appFetch(siblingPath, racingRevision('2026-11-13')), appFetch(siblingPath, racingRevision('2026-11-14')),
  ])
  record('concurrent edits from one expected version allow one commit and reject one',
    JSON.stringify(racing.map(response => response.status).sort()) === '[200,409]' &&
    (await expectStatus(await appFetch(siblingPath), 200)).version === 3)

  const foreignList = await expectStatus(await foreignFetch(collection), 200)
  const foreignEvidence = { ...command, evidence: [{ emailId: otherEmailId, field: 'subject', quote: 'Nguồn của người khác' }] }
  record('a second authenticated tenant cannot list, read, page or edit another ledger',
    foreignList.items.length === 0 && (await foreignFetch(detailPath)).status === 404 &&
    (await foreignFetch(collection + `?beforeId=${id}`)).status === 404 &&
    (await foreignFetch(detailPath, mutation('PATCH', completed))).status === 404 &&
    Boolean((await login.schema('private').from('commitment_revisions').select('*')).error))
  const foreignCreate = await expectStatus(await foreignFetch(collection, mutation('POST', foreignEvidence, createKey)), 201)
  record('another tenant may independently use the same reference and idempotency key', foreignCreate.id !== id)

  const pageOne = await expectStatus(await appFetch(collection + '?limit=1'), 200)
  const pageTwo = await expectStatus(await appFetch(collection + `?limit=1&beforeId=${pageOne.nextBeforeId}`), 200)
  record('commitment list cursor returns the remaining owned item without duplicates',
    pageOne.items[0].id === sibling.id && pageTwo.items[0].id === id && pageTwo.nextBeforeId === null)

  assert.equal((await admin.from('emails').update({ body_text: 'Nội dung mới.' }).eq('id', movedId).eq('user_id', userId)).error, null)
  assert.equal((await admin.from('emails').update({ provider_deleted: true }).eq('id', ownEmailId).eq('user_id', userId)).error, null)
  const sources = await expectStatus(await appFetch(detailPath), 200)
  record('changed and deleted emails keep history but no longer return a verified quote',
    sources.history[2].sources[0].availability === 'changed' && sources.history[2].sources[0].quote === null &&
    sources.history[3].sources[0].availability === 'unavailable' && sources.history[3].sources[0].href === null)
  const replay = await expectStatus(await appFetch(collection, mutation('POST', command, createKey)), 200)
  record('old acknowledged result remains replayable after newer revisions and source removal',
    replay.id === id && replay.replayed && replay.version === 1)

  record('HTTP boundary rejects malformed JSON, unsupported media, oversized payloads and unsafe cursors',
    (await appFetch(collection, { ...mutation('POST', command), body: '{' })).status === 400 &&
    (await appFetch(collection, { ...mutation('POST', command), headers: { 'Idempotency-Key': randomUUID() } })).status === 415 &&
    (await appFetch(collection, mutation('POST', { ...command, excess: 'x'.repeat(17 * 1024) }))).status === 413 &&
    (await appFetch(detailPath + '?beforeVersion=2147483648')).status === 400)
  return done
}
