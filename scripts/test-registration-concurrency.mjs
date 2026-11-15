import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const database = process.env.TEST_DATABASE_URL
assert.ok(database, 'requires dedicated local test database from test-db.sh')
const sql = text => execFileSync('psql', [database, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', text], { encoding:'utf8' }).trim()
const previous = JSON.parse(sql('SELECT row_to_json(p) FROM public.registration_policy p'))
const prefix = `cap-${randomUUID()}`
try {
  sql("UPDATE public.registration_policy SET enabled=true, mode='open_beta', max_users=(SELECT count(*)+1 FROM auth.users)")
  const attempts = await Promise.all(Array.from({ length:10 }, (_,i) => new Promise(resolve => {
    const child = spawn('psql', [database, '-X', '-v', 'ON_ERROR_STOP=1', '-c',
      `INSERT INTO auth.users(id,email) VALUES('${randomUUID()}','${prefix}-${i}@example.test')`], { stdio:'ignore' })
    child.once('error', () => resolve(false))
    child.once('exit', code => resolve(code === 0))
  })))
  assert.equal(attempts.filter(Boolean).length, 1, 'parallel signup exceeded the final slot')
  assert.equal(Number(sql(`SELECT count(*) FROM auth.users WHERE email LIKE '${prefix}-%@example.test'`)), 1)
  console.log('PASS: 10 concurrent native inserts compete for one remaining slot; exactly one admitted')
} finally {
  sql(`DELETE FROM auth.users WHERE email LIKE '${prefix}-%@example.test'`)
  sql(`UPDATE public.registration_policy SET enabled=${previous.enabled}, mode='${previous.mode}', max_users=${previous.max_users}`)
}
