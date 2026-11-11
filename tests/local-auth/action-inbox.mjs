import assert from 'node:assert/strict'

export async function rehearsePriorityRpc({ login, anonymous, sql, appFetch, ownEmailId, otherEmailId, record }) {
  const set = (client, id, choice, version) => client.rpc('set_inbox_priority', {
    p_email_id: id, p_choice: choice, p_version: version,
  })
  record('upgrade keeps legacy message automatic and derives its plaintext preview', sql(
    "SELECT inbox_priority IS NULL AND inbox_priority_version=0 AND public.inbox_preview(e)='Legacy body' FROM public.emails e WHERE subject='Priority before upgrade';",
  ).trim() === 't')
  const own = await login.from('emails').select('id, snippet:inbox_preview').eq('id', ownEmailId).single()
  assert.equal(own.error, null)
  assert.equal(own.data.id, ownEmailId)
  const foreign = await login.from('emails').select('id, snippet:inbox_preview').eq('id', otherEmailId)
  record('PostgREST computed preview and RPC reject foreign and anonymous access',
    !foreign.error && foreign.data.length === 0 &&
    (await set(login, otherEmailId, 'later', 0)).status === 404 &&
    Boolean((await set(anonymous, ownEmailId, 'action', 0)).error))
  record('email evidence route opens an owned source and conceals a foreign source',
    (await appFetch(`/api/emails/${ownEmailId}`)).status === 200 &&
    (await appFetch(`/api/emails/${otherEmailId}`)).status === 404)
  const attempts = await Promise.all([set(login, ownEmailId, 'action', 0), set(login, ownEmailId, 'later', 0)])
  assert.ok(attempts.every(response => response.error === null))
  const saved = attempts.find(response => response.data.status === 'saved')?.data
  const conflict = attempts.find(response => response.data.status === 'conflict')?.data
  assert.ok(saved && conflict)
  record('concurrent PostgREST corrections from one revision yield one save and one conflict',
    saved.version === 1 && conflict.version === 1 && conflict.choice === saved.choice)
  const replay = await set(login, ownEmailId, saved.choice, 0)
  assert.deepEqual(replay.data, saved)
  const reset = await set(login, ownEmailId, null, 1)
  record('replay converges without a new revision and reset returns to automatic',
    replay.error === null && reset.error === null && reset.data.status === 'saved' && reset.data.choice === null && reset.data.version === 2)
}
