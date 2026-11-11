import { beforeEach,expect,it,vi } from 'vitest'
import { NextRequest } from 'next/server'
const m=vi.hoisted(()=>({user:{id:'alice'} as {id:string}|null,gmail:vi.fn(),imap:vi.fn(),eq:vi.fn(),rpc:vi.fn()}))
vi.mock('@/lib/ai/classifier',()=>({classifyEmail:vi.fn()}))
vi.mock('@/lib/notifications/create',()=>({notifySyncComplete:vi.fn()}))
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({rpc:m.rpc})}))
vi.mock('@/lib/email/imap-client',()=>({syncEmails:m.imap}))
vi.mock('@/lib/gmail/sync',()=>({syncGmailEmails:m.gmail}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:m.user}})},from:()=>({select:()=>({eq:m.eq})})})}))
import { syncAccount } from '@/lib/sync/account'
import { POST as syncAll } from '@/app/api/source-accounts/sync/route'
import { POST } from '@/app/api/source-accounts/[accountId]/sync/route'
const account={id:'account-a',user_id:'alice',email_address:'synthetic@example.test',provider:'gmail',auth_type:'oauth_google',is_active:true,
 imap_host:'imap.example.test',imap_port:993,imap_secure:true,username:'synthetic@example.test'}
beforeEach(()=>{
 m.rpc.mockResolvedValue({data:[],error:null});m.user={id:'alice'};m.gmail.mockReset();m.imap.mockReset();m.eq.mockReset()
 const filters:Record<string,string>={}
 const query={eq:m.eq,single:async()=>({data:filters.user_id==='alice'&&filters.id==='account-a'?account:null,error:null})}
 m.eq.mockImplementation((key:string,value:string)=>{filters[key]=value;return query})
 m.gmail.mockResolvedValue({success:true,synced:2,syncedCount:2,pending:true,busy:false})
 m.imap.mockResolvedValue({success:true,synced:1,errors:[],pending:false})
})
it('routes OAuth accounts to Gmail rather than attempting an IMAP password',async()=>{
 expect(await syncAccount(account,{limit:30})).toMatchObject({synced:2,pending:true})
 expect(m.gmail).toHaveBeenCalledWith('alice','account-a',{maxResults:30,fullSync:undefined})
 expect(m.imap).not.toHaveBeenCalled()
})
it('retains the IMAP path for IMAP accounts',async()=>{
 const imap={...account,auth_type:'imap'}
 await syncAccount(imap,{limit:30})
 expect(m.imap).toHaveBeenCalledWith(imap,{limit:30})
 expect(m.gmail).not.toHaveBeenCalled()
})
it('returns pending status without presenting an unfinished sync as empty inbox',async()=>{
 const r=await POST(new NextRequest('http://localhost/api/sync',{method:'POST',body:'{}'}),{params:Promise.resolve({accountId:'account-a'})})
 expect(await r.json()).toMatchObject({success:true,synced:2,pending:true,message:'Đồng bộ chưa hoàn tất; sẽ tiếp tục từ checkpoint'})
 expect(m.eq).toHaveBeenCalledWith('user_id','alice')
})
it('rejects foreign accounts before calling a sync provider',async()=>{
 const r=await POST(new NextRequest('http://localhost/api/sync',{method:'POST',body:'{}'}),{params:Promise.resolve({accountId:'foreign'})})
 expect(r.status).toBe(404);expect(m.gmail).not.toHaveBeenCalled();expect(m.imap).not.toHaveBeenCalled()
})
it('rejects unauthenticated sync before account reads',async()=>{
 m.user=null
 const r=await POST(new NextRequest('http://localhost/api/sync',{method:'POST'}),{params:Promise.resolve({accountId:'account-a'})})
 expect(r.status).toBe(401);expect(m.eq).not.toHaveBeenCalled();expect(m.gmail).not.toHaveBeenCalled()
})

it('scopes fair multi-account due-work selection to the verified owner',async()=>{
 const r=await syncAll(new NextRequest('http://localhost/api/sync',{method:'POST',body:JSON.stringify({user_id:'bob'})}))
 expect(r.status).toBe(200)
 expect(m.rpc).toHaveBeenCalledWith('list_due_sync_accounts',{p_limit:50,p_user_id:'alice',p_force:false})
 expect(m.gmail).not.toHaveBeenCalled()
})
