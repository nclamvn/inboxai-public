import {expect,it} from 'vitest'
import {activeMailBody,supportsLivingChange} from '@/lib/commitments/living-interpret'
import {resolveLivingDate} from '@/lib/commitments/living-dates'
import {livingCommand} from '@/lib/commitments/living-contracts'
it.each(['Forwarded message:','---------- Forwarded message ---------','Thư chuyển tiếp:','Nội dung chuyển tiếp:'])('excludes forwarded content at %s',header=>{
 expect(activeMailBody('Tôi nhận gửi bản mới.\n'+header+'\nTôi xin hủy bản cũ.')).toBe('Tôi nhận gửi bản mới.')
})
it.each(['Chưa có cập nhật mới.','Tôi không hủy cam kết.','Tôi chưa hoàn tất.','Tôi đã nhận email.'])('does not allow no-update/negation/receipt to close a task: %s',quote=>{
 expect(supportsLivingChange('completed',quote)).toBe(false);expect(supportsLivingChange('cancelled',quote)).toBe(false)
})
it.each([['cancelled','Tôi xin hủy cam kết này.'],['completed','Tôi đã gửi đủ hồ sơ, hoàn tất.'],['deadline','Tôi chốt đổi hạn sang ngày 20/11/2026.'],['owner','Tôi giao trách nhiệm cho a@example.test.']] as const)('supports explicit %s evidence',(kind,quote)=>expect(supportsLivingChange(kind,quote)).toBe(true))
it('resolves deadline wording without a ngày prefix and keeps competing relative dates unresolved',()=>{
 expect(resolveLivingDate('Hạn 15 tháng 1 năm 2027.','2026-11-17T02:00:00Z').value).toBe('2027-01-15')
 expect(resolveLivingDate('Tôi gửi hôm nay hoặc ngày mai.','2026-11-17T02:00:00Z')).toMatchObject({value:null,status:'ambiguous'})
})
it('requires version-bound decisions and disallows an owner override',()=>{
 const command={action:'review',analysisId:'10000000-0000-4000-8000-000000000191',index:0,expectedDecisionVersion:0,expectedVersion:null,decision:'dismiss',reason:'not_relevant'}
 expect(livingCommand.safeParse(command).success).toBe(true)
 expect(livingCommand.safeParse({...command,userId:'forged'}).success).toBe(false)
 expect(livingCommand.safeParse({...command,expectedDecisionVersion:-1}).success).toBe(false)
})

it('accepts explicit passive cancellation but never negated passive cancellation',()=>{
 expect(supportsLivingChange('cancelled','Cam kết gửi danh sách của tôi được hủy do sự kiện đã hủy.')).toBe(true)
 expect(supportsLivingChange('cancelled','Cam kết gửi danh sách chưa được hủy.')).toBe(false)
 expect(resolveLivingDate('I will send it the day after tomorrow.','2026-11-17T02:00:00Z').value).toBe('2026-11-19')
})
