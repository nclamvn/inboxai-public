// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import {ConfirmedCommitmentAnswer} from '@/components/search/confirmed-commitment-answer'
import type {LedgerDetail} from '@/lib/commitments/view'
afterEach(cleanup)
const detail:LedgerDetail={id:'c',referenceKey:'living:test',version:1,createdAt:'2026-11-17T00:00:00Z',updatedAt:'2026-11-17T00:00:00Z',nextBeforeVersion:null,
 state:{title:'Gửi biên bản',ownerName:null,ownerEmail:'a@example.test',dueOn:'2026-11-20',dueAt:null,status:'open',review:null},
 history:[{version:1,kind:'created',state:{title:'Gửi biên bản',ownerName:null,ownerEmail:'a@example.test',dueOn:'2026-11-20',dueAt:null,status:'open',review:null},
  changedFields:['ownerEmail','dueOn','status'],recordedAt:'2026-11-17T00:00:00Z',sources:[{emailId:'e',field:'body_text',quote:'Tôi gửi biên bản ngày 20/11/2026.',subject:'Biên bản',receivedAt:'2026-11-17T00:00:00Z',href:'/inbox?email=e',availability:'available'}]}]}
it('binds each stored fact to the actual revision source without calling a model',()=>{
 render(<ConfirmedCommitmentAnswer detail={detail}/>)
 expect(screen.getAllByRole('link',{name:'Mở nguồn · Biên bản'})).toHaveLength(3)
 expect(screen.getByText('a@example.test')).toBeTruthy()
 expect(screen.getByText('2026-11-20')).toBeTruthy()
 expect(screen.getAllByText(detail.history[0].sources[0].quote!)).toHaveLength(3)
})
it('does not turn a changed/deleted source into a fresh exact citation',()=>{
 const changed=structuredClone(detail);changed.history[0].sources[0].availability='changed'
 render(<ConfirmedCommitmentAnswer detail={changed}/>)
 expect(screen.queryByText('Tôi gửi biên bản ngày 20/11/2026.')).toBeNull()
 expect(screen.queryByRole('link',{name:'Mở nguồn · Biên bản'})).toBeNull()
 expect(screen.getAllByText(/chưa thể đối chiếu lại nguyên văn/)).toHaveLength(3)
})
it('abstains from assigning an evidence source when the needed older revision is not loaded',()=>{
 render(<ConfirmedCommitmentAnswer detail={{...detail,history:[]}}/>)
 expect(screen.getAllByText(/Chưa có nguồn cho trường này/)).toHaveLength(3)
})
