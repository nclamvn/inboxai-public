import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { DatabaseSyncStore } from '../../src/lib/sync/store.ts'
import { runSync } from '../../src/lib/sync/engine.ts'
import { gmailProvider } from '../../src/lib/sync/gmail-provider.ts'
import { imapProvider } from '../../src/lib/sync/imap-provider.ts'
import { SyncError } from '../../src/lib/sync/contracts.ts'
import { FakeGmail,FakeImap,syntheticMessage } from '../sync-fixtures.ts'

export function seedLegacySync(sql,userId){
 sql(`INSERT INTO public.emails(user_id,source_account_id,original_uid,message_id,from_address,subject)
   SELECT '${userId}',id,'legacy-provider-uid','synthetic-legacy-rfc','synthetic@example.test','Legacy evidence'
   FROM public.source_accounts WHERE user_id='${userId}' AND email_address='google-vault@example.test'`)
}
export async function rehearseSync({sql,admin,login,anonymous,userId,otherUserId,record}){
 const store=new DatabaseSyncStore(admin)
 const create=async(provider,owner=userId)=>{
  const accountId=randomUUID()
  assert.equal((await admin.from('source_accounts').insert({id:accountId,user_id:owner,email_address:`sync-${accountId}@example.test`,auth_type:provider==='gmail'?'oauth_google':'imap',is_active:true})).error,null)
  return {userId:owner,accountId,provider}
 }
 const rows=async scope=>{
  const r=await admin.from('emails').select('id,original_uid,sync_namespace,provider_deleted,is_deleted,is_read,is_starred,is_archived,subject,user_notes,priority').eq('user_id',scope.userId).eq('source_account_id',scope.accountId)
  assert.equal(r.error,null);return r.data
 }
 const state=scope=>JSON.parse(sql(`SELECT row_to_json(s) FROM private.account_sync s WHERE account_id='${scope.accountId}'`))
 const clearBackoff=scope=>sql(`UPDATE private.account_sync SET retry_at=NULL WHERE account_id='${scope.accountId}'`)
 const scope=await create('gmail'),api=new FakeGmail(121)
 record('legacy sync rows retain evidence under a legacy namespace',Number(sql(`SELECT count(*) FROM public.emails WHERE subject='Legacy evidence' AND sync_namespace LIKE 'legacy:%'`))===1)
 const denied=await Promise.all([login.rpc('claim_account_sync',{p_user_id:userId,p_account_id:scope.accountId,p_provider:'gmail'}),
  login.rpc('list_due_sync_accounts'),
  anonymous.rpc('release_account_sync',{p_user_id:userId,p_account_id:scope.accountId,p_lease:randomUUID(),p_fence:1,p_pending:false}),
  login.schema('private').from('account_sync').select('*')])
 record('real JWT callers cannot claim sync leases or read checkpoints',denied.every(r=>r.error))
 await assert.rejects(store.claim({...scope,userId:otherUserId}),{code:'unavailable'})
 record('service sync RPC rejects a mismatched account tenant',true)
 let result=await runSync(store,scope,async()=>gmailProvider(api),{maxPages:1})
 record('Gmail first bounded invocation persists page and pending checkpoint',result.success&&result.pending&&(await rows(scope)).length===50&&state(scope).cursor.pageToken==='50')
 const persisted=await rows(scope),stableId=persisted[0].id
 await admin.from('emails').update({priority:1,user_notes:'Synthetic annotation'}).eq('id',stableId).eq('user_id',userId)
 result=await runSync(store,scope,async()=>gmailProvider(api))
 record('Gmail restart resumes all remaining pages and catches history',result.success&&!result.pending&&(await rows(scope)).length===121&&state(scope).cursor.historyId==='101')
 api.changes={historyId:'200',history:[{labelsAdded:[...api.data.keys()].map(id=>({message:{id}}))}]}
 const changed=api.data.get(persisted[0].original_uid);changed.labelIds=['STARRED']
 await runSync(store,scope,async()=>gmailProvider(api),{maxPages:1})
 record('large Gmail history record retains unprocessed IDs durably',state(scope).cursor.pending.length===71&&state(scope).cursor.historyId==='101')
 await runSync(store,scope,async()=>gmailProvider(api))
 const after=await rows(scope),annotated=after.find(r=>r.id===stableId)
 record('Gmail replay updates labels without duplicates or lost annotations',after.length===121&&annotated.priority===1&&annotated.user_notes==='Synthetic annotation'&&annotated.is_starred&&annotated.is_read&&annotated.is_archived)
 api.data.delete('2');api.changes={historyId:'201',history:[{messagesDeleted:[{message:{id:'2'}}]}]}
 await runSync(store,scope,async()=>gmailProvider(api))
 record('Gmail message deletion becomes a scoped evidence-preserving tombstone',(await rows(scope)).find(r=>r.original_uid==='2').provider_deleted===true)
 api.expired=true;api.changes={historyId:'300',history:[]}
 await runSync(store,scope,async()=>gmailProvider(api))
 record('expired Gmail history rebaselines and reconciles current source',state(scope).cursor.historyId==='300'&&(await rows(scope)).filter(r=>!r.provider_deleted).length===120)
 const second=await create('gmail'),secondApi=new FakeGmail(3)
 await runSync(store,second,async()=>gmailProvider(secondApi))
 record('same Gmail IDs and RFC Message-ID coexist in separate accounts',(await rows(second)).length===3&&(await rows(scope)).length===121)
 const foreign=await create('gmail',otherUserId)
 await runSync(store,foreign,async()=>gmailProvider(new FakeGmail(1)))
 const visible=await login.from('emails').select('id').eq('source_account_id',foreign.accountId)
 record('authenticated tenant cannot read another synced account',!visible.error&&visible.data.length===0)
 const failing=await create('gmail'),failApi=new FakeGmail(60);failApi.failMessage='4'
 const failed=await runSync(store,failing,async()=>gmailProvider(failApi))
 const calls=failApi.calls.length
 const blocked=await runSync(store,failing,async()=>gmailProvider(failApi))
 record('provider failure preserves checkpoint and durable backoff suppresses contact',!failed.success&&state(failing).revision===0&&(await rows(failing)).length===0&&blocked.busy&&calls===failApi.calls.length&&state(failing).failures===1)
 clearBackoff(failing);failApi.failMessage=undefined
 await runSync(store,failing,async()=>gmailProvider(failApi))
 record('targeted retry recovers all provider messages after failure',(await rows(failing)).length===60)
 const invalid=await create('imap'),badApi=new FakeImap([1,2]);badApi.data.get(2).received_at='invalid-date'
 const bad=await runSync(store,invalid,async()=>imapProvider(badApi))
 record('SQL page failure rolls back earlier rows and the checkpoint',!bad.success&&(await rows(invalid)).length===0&&state(invalid).revision===0)
 const imap=await create('imap'),imapApi=new FakeImap(Array.from({length:121},(_,n)=>n+1))
 await runSync(store,imap,async()=>imapProvider(imapApi),{maxPages:1})
 record('IMAP overflow progresses in ascending UID order',state(imap).cursor.after===50&&(await rows(imap)).length===50)
 await runSync(store,imap,async()=>imapProvider(imapApi))
 const beforeImap=await rows(imap)
 const attachmentCount=()=>Number(sql(`SELECT count(*) FROM public.attachments WHERE email_id IN(SELECT id FROM public.emails WHERE source_account_id='${imap.accountId}')`))
 record('IMAP keeps duplicate filenames as separate MIME parts',beforeImap.length===121&&attachmentCount()===242)
 await admin.from('emails').update({is_starred:true,is_deleted:true}).eq('id',beforeImap[0].id).eq('user_id',userId)
 const partIds=sql(`SELECT string_agg(id::text,',' ORDER BY id) FROM public.attachments WHERE email_id='${beforeImap[0].id}'`)
 await runSync(store,imap,async()=>imapProvider(imapApi))
 const localFlags=(await rows(imap)).find(r=>r.id===beforeImap[0].id)
 record('sync replay preserves local flag edits pending provider acknowledgement',localFlags.is_starred&&localFlags.is_deleted)
 record('IMAP replay preserves email and attachment identities',(await rows(imap)).length===121&&attachmentCount()===242&&partIds===sql(`SELECT string_agg(id::text,',' ORDER BY id) FROM public.attachments WHERE email_id='${beforeImap[0].id}'`))
 imapApi.data.delete(2);imapApi.data.get(1).is_read=true
 await runSync(store,imap,async()=>imapProvider(imapApi))
 const updated=await rows(imap)
 record('IMAP reconciliation updates flags and preserves expunged evidence',updated.find(r=>r.original_uid==='1').is_read&&updated.find(r=>r.original_uid==='2').provider_deleted)
 imapApi.validity='456';imapApi.data=new Map([[1,syntheticMessage('1')]])
 await runSync(store,imap,async()=>imapProvider(imapApi))
 const resetRows=await rows(imap)
 record('UIDVALIDITY reset creates a new UID identity and tombstones the old epoch',resetRows.length===122&&resetRows.filter(r=>!r.provider_deleted).length===1&&resetRows.find(r=>!r.provider_deleted).sync_namespace==='INBOX:456')
 const leases=await create('gmail')
 const claims=await Promise.all([store.claim(leases),store.claim(leases)])
 record('concurrent real HTTP claims admit exactly one active worker',claims.filter(Boolean).length===1)
 const old=claims.find(Boolean)
 sql(`UPDATE private.account_sync SET lease_until=clock_timestamp()-interval '1 second' WHERE account_id='${leases.accountId}'`)
 const fresh=await store.claim(leases)
 const empty={cursor:{provider:'gmail',phase:'history',historyId:'1'},namespace:'gmail',messages:[],deleted:[],complete:true}
 await assert.rejects(store.commit(leases,old,empty),{code:'conflict'})
 await assert.rejects(store.release(leases,old,{pending:false}),{code:'conflict'})
 record('expired worker cannot commit or release a replacement lease',fresh.fence>old.fence)
 fresh.revision=await store.commit(leases,fresh,empty);await store.release(leases,fresh,{pending:false})
 const uncertain=await create('gmail'),uncertainApi=new FakeGmail(60)
 let lost=true
 const dropped={claim:s=>store.claim(s),release:(...args)=>store.release(...args),commit:async(...args)=>{
  const rev=await store.commit(...args);if(lost){lost=false;throw new SyncError('unavailable')}return rev
 }}
 const uncertainResult=await runSync(dropped,uncertain,async()=>gmailProvider(uncertainApi))
 clearBackoff(uncertain)
 await runSync(store,uncertain,async()=>gmailProvider(uncertainApi))
 record('lost commit acknowledgement recovers from database checkpoint without duplicates',!uncertainResult.success&&(await rows(uncertain)).length===60&&state(uncertain).cursor.historyId==='101')
 const disabled=await create('imap')
 const disableProvider=imapProvider(new FakeImap([1]))
 const page=disableProvider.page.bind(disableProvider)
 disableProvider.page=async(...args)=>{const value=await page(...args);sql(`UPDATE public.source_accounts SET is_active=false WHERE id='${disabled.accountId}'`);return value}
 const disabledResult=await runSync(store,disabled,async()=>disableProvider)
 record('account disabled during fetch cannot accept a page',!disabledResult.success&&(await rows(disabled)).length===0&&state(disabled).revision===0)
 await admin.from('source_accounts').delete().eq('id',leases.accountId).eq('user_id',userId)
 record('source account deletion cascades private sync state',Number(sql(`SELECT count(*) FROM private.account_sync WHERE account_id='${leases.accountId}'`))===0)
 const fair1=await create('gmail'),fair2=await create('gmail')
 sql(`UPDATE public.source_accounts SET is_active=false WHERE id NOT IN ('${fair1.accountId}','${fair2.accountId}')`)
 const held=await store.claim(fair1)
 let due=await admin.rpc('list_due_sync_accounts',{p_limit:10})
 assert.equal(due.error,null)
 const excludesLease=due.data.length===1&&due.data[0].id===fair2.accountId
 await store.release(fair1,held,{pending:true,error:'provider'})
 due=await admin.rpc('list_due_sync_accounts',{p_limit:10})
 const excludesBackoff=due.data.length===1&&due.data[0].id===fair2.accountId
 clearBackoff(fair1)
 due=await admin.rpc('list_due_sync_accounts',{p_limit:10})
 record('cron due-work selection excludes active leases and backoff and favors untouched accounts',excludesLease&&excludesBackoff&&due.data[0].id===fair2.accountId&&due.data.length===2)

}
