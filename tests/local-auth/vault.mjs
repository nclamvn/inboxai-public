import { createCipheriv, randomUUID } from 'node:crypto'
import { execFile, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { promisify } from 'node:util'
import { CredentialVault } from '../../src/lib/credential-vault/vault.ts'
import { parseKeyring } from '../../src/lib/credential-vault/crypto.ts'

export const vaultKeys = JSON.stringify({ local1:'11'.repeat(32),local2:'22'.repeat(32) })
const legacyKey = 'synthetic-legacy-text-key-12345678'
const password = 'synthetic-imap-password-only'
const access = 'synthetic-google-access-only'
const refresh = 'synthetic-google-refresh-only'
const ids = { imap:randomUUID(),google:randomUUID(),conflict:randomUUID() }

export function seedLegacyVault(sql,userId) {
  const iv = Buffer.alloc(16,3)
  const cipher = createCipheriv('aes-256-cbc',Buffer.from(legacyKey.padEnd(32).slice(0,32)),iv)
  const encrypted = `${iv.toString('hex')}:${Buffer.concat([cipher.update(password),cipher.final()]).toString('hex')}`
  sql(`INSERT INTO public.source_accounts(id,user_id,email_address,provider,password_encrypted,access_token,refresh_token,token_expires_at,oauth_access_token)
    VALUES('${ids.imap}','${userId}','imap-vault@example.test','custom','${encrypted}',NULL,NULL,NULL,NULL),
    ('${ids.google}','${userId}','google-vault@example.test','gmail',NULL,'${access}','${refresh}','2026-11-12T00:00:00Z',NULL),
    ('${ids.conflict}','${userId}','conflict-vault@example.test','gmail',NULL,'${access}',NULL,'2026-11-12T00:00:00Z','synthetic-different-token');`)
}

export async function rehearseVault({ sql,admin,login,anonymous,userId,otherUserId,base,service,record }) {
  const ring1 = parseKeyring(vaultKeys,'local1'), ring2 = parseKeyring(vaultKeys,'local2')
  const vault = new CredentialVault(admin,ring1)
  const scope = accountId => ({ userId,accountId })
  const cliEnv = { ...Object.fromEntries(['PATH','HOME','LANG','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),
    NEXT_PUBLIC_SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:service,CREDENTIAL_VAULT_KEYS:vaultKeys,
    CREDENTIAL_VAULT_ACTIVE_KEY:'local2',ENCRYPTION_KEY:legacyKey }
  const command = ['--import','tsx','--conditions=react-server','scripts/credential-vault.ts']
  const cli = async args => JSON.parse((await promisify(execFile)(process.execPath,[...command,...args],{env:cliEnv,encoding:'utf8',timeout:30_000})).stdout)
  const target = ['--user',userId,'--account',ids.google]
  const denied = await Promise.all([login.rpc('read_account_credential',{p_user_id:userId,p_account_id:ids.imap}),
    anonymous.rpc('list_credential_jobs'),login.schema('private').from('legacy_account_credentials').select('*')])
  record('actual PostgREST denies browser secret RPC, inventory and private schema',denied.every(r=>Boolean(r.error)))
  const metadata = await login.from('source_accounts').select('*')
  record('owner metadata SELECT star has no secret fields or values',!metadata.error && metadata.data.length===3 &&
    !JSON.stringify(metadata.data).match(/password_encrypted|email_password|access_token|refresh_token|synthetic-google|synthetic-imap/))
  const injection = await login.from('source_accounts').insert({user_id:userId,email_address:'injected@example.test',access_token:'synthetic-injection'})
  record('browser cannot write removed plaintext token column',Boolean(injection.error))
  await assert.rejects(vault.read(scope(ids.imap)),{ code:'migration_required' })
  record('hot reads fail closed while legacy conversion is pending',true)
  const before = (await vault.status(scope(ids.google))).revision
  const dry = await cli(['migrate',...target])
  record('maintenance defaults to dry run without changing revision',!dry.apply && before===(await vault.status(scope(ids.google))).revision)
  const migrated = await cli(['migrate','--apply',...target])
  record('local CLI converts quarantined OAuth packet',migrated.results[0].status==='complete' &&
    (await vault.read(scope(ids.google))).credentials.refreshToken===refresh)
  await vault.migrate(scope(ids.imap),legacyKey)
  record('legacy CBC text-key upgrade preserves synthetic password', (await vault.read(scope(ids.imap))).credentials.password===password)
  await assert.rejects(vault.migrate(scope(ids.conflict),legacyKey),{code:'conflict'})
  record('conflicting legacy tokens remain quarantined without mutation',(await vault.status(scope(ids.conflict))).state==='legacy_pending')
  record('successful conversion removes plaintext legacy packet',Number(sql(`SELECT count(*) FROM private.legacy_account_credentials WHERE account_id IN ('${ids.imap}','${ids.google}')`))===0)
  const revision = (await vault.status(scope(ids.imap))).revision
  await assert.rejects(vault.write({userId:otherUserId,accountId:ids.imap},{kind:'imap',password:'synthetic-foreign'},revision),{code:'missing'})
  await assert.rejects(vault.read({userId:otherUserId,accountId:ids.imap}),{code:'missing'})
  record('service RPC rejects mismatched tenant reads and writes',true)
  const concurrent = await Promise.allSettled(['A','B'].map(value=>vault.write(scope(ids.imap),{kind:'imap',password:`synthetic-${value}`},revision)))
  record('concurrent compare-and-swap admits exactly one writer',concurrent.filter(r=>r.status==='fulfilled').length===1 &&
    concurrent.filter(r=>r.status==='rejected' && r.reason.code==='conflict').length===1)
  sql(`UPDATE public.source_accounts SET is_active=false,sync_status='error',sync_error='synthetic-disabled' WHERE id='${ids.imap}'`)
  const rotated = new CredentialVault(admin,ring2)
  await rotated.rotate(scope(ids.imap))
  const job = (await rotated.jobs()).find(j=>j.account_id===ids.imap)
  record('rotation rewraps both current and rollback envelope',job.key_id==='local2' && job.backup_key_id==='local2')
  const retired = new CredentialVault(admin,parseKeyring(JSON.stringify({local2:'22'.repeat(32)}),'local2'))
  await retired.restorePrevious(scope(ids.imap))
  record('rollback works after retiring old key without plaintext fallback',(await retired.read(scope(ids.imap))).credentials.password===password)
  record('maintenance does not reactivate a disabled account',sql(`SELECT is_active::text||':'||sync_status||':'||sync_error FROM public.source_accounts WHERE id='${ids.imap}'`).trim()==='false:error:synthetic-disabled')
  const stableRevision = (await retired.status(scope(ids.imap))).revision
  record('rotation is idempotent under the active key',await retired.rotate(scope(ids.imap))===stableRevision)
  // Exercise actual CLI write/rotate/restore and inventory output separately from class tests.
  await rotated.write(scope(ids.google),{kind:'google',accessToken:'synthetic-next',refreshToken:refresh,expiresAt:'2026-11-12T00:00:00Z'},1)
  const rotate = await cli(['rotate','--apply',...target]), restore = await cli(['restore','--apply',...target])
  const inventory = await cli(['inventory'])
  record('CLI rotation, encrypted restore and key inventory execute locally',rotate.results[0].status==='complete' &&
    restore.results[0].status==='complete' && inventory.results.find(r=>r.accountId===ids.google).backupKeyId==='local2')
  const remote = spawnSync(process.execPath,[...command,'inventory'],{env:{...cliEnv,NEXT_PUBLIC_SUPABASE_URL:'https://remote.invalid'},encoding:'utf8'})
  record('maintenance refuses hosted URL before any database request',remote.status===1 && remote.stderr.includes('invalid local configuration'))
  const serialized = JSON.stringify({metadata:metadata.data,inventory,migrated,rotate,restore})
  record('metadata and maintenance output contain no synthetic credential values',![password,access,refresh,'synthetic-next'].some(secret=>serialized.includes(secret)))
  const tamper = await admin.rpc('read_account_credential',{p_user_id:userId,p_account_id:ids.imap})
  const envelope = tamper.data.envelope
  sql(`UPDATE private.account_credentials SET envelope=jsonb_set(envelope,'{tag}',to_jsonb('AAAAAAAAAAAAAAAAAAAAAA'::text)) WHERE account_id='${ids.imap}'`)
  await assert.rejects(retired.read(scope(ids.imap)),{code:'integrity'})
  record('tampered stored authentication tag fails closed through real RPC',true)
  // Repair exactly the test mutation, then exercise parent deletion cascade.
  sql(`UPDATE private.account_credentials SET envelope='${JSON.stringify(envelope)}'::jsonb WHERE account_id='${ids.imap}'; DELETE FROM public.source_accounts WHERE id='${ids.imap}';`)
  record('account deletion cascades encrypted vault rows',Number(sql(`SELECT count(*) FROM private.account_credentials WHERE account_id='${ids.imap}'`))===0)
  for (let start=0;start<51;start+=8) {
    await Promise.all(Array.from({length:Math.min(8,51-start)},(_,offset)=>{
      const accountId=randomUUID()
      return rotated.write(scope(accountId),{kind:'imap',password:'synthetic-page-secret'},0,
        {email_address:`vault-page-${start+offset}@example.test`,provider:'custom'})
    }))
  }
  const first = await rotated.jobs(), second = await rotated.jobs(first.at(-1).account_id)
  const page = await cli(['inventory'])
  record('bounded maintenance page resumes without omissions or duplicate accounts',first.length===50 && second.length===3 &&
    new Set([...first,...second].map(j=>j.account_id)).size===53 && page.processed===50 && page.nextCursor===first.at(-1).account_id)
}
