import {z} from 'zod'

export type LivingDate={value:string|null;status:'resolved'|'absent'|'ambiguous';reason?:string}
const months=['january','february','march','april','may','june','july','august','september','october','november','december']
const weekdays=['chủ nhật','thứ hai','thứ ba','thứ tư','thứ năm','thứ sáu','thứ bảy']
function iso(year:number,month:number,day:number) {
  const value=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0')
  return z.iso.date().safeParse(value).success?value:null
}
/** Calendar arithmetic uses the source sent time in Vietnam, never browser time. */
export function resolveLivingDate(quote:string,at:string):LivingDate {
  const text=quote.toLowerCase().normalize('NFC')
  const dates:{value:string;index:number}[]=[]
  let invalid=false
  const add=(year:number,month:number,day:number,index:number)=>{const value=iso(year,month,day);if(value)dates.push({value,index});else invalid=true}
  for(const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/gu))add(+m[3],+m[2],+m[1],m.index)
  for(const m of text.matchAll(/(?:ngày|hạn)\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+(?:năm\s+)?(\d{4})/gu))add(+m[3],+m[2],+m[1],m.index)
  const monthPattern=months.map(m=>m+'|'+m.slice(0,3)).join('|')
  for(const m of text.matchAll(new RegExp('\\b('+monthPattern+')\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b','gu')))
    add(+m[3],months.findIndex(name=>name.startsWith(m[1]))+1,+m[2],m.index)
  for(const m of text.matchAll(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+('+monthPattern+')[,]?\\s+(\\d{4})\\b','gu')))
    add(+m[3],months.findIndex(name=>name.startsWith(m[2]))+1,+m[1],m.index)
  if(invalid)return {value:null,status:'ambiguous',reason:'Ngày trong câu nguồn không hợp lệ.'}
  const values=[...new Set(dates.map(d=>d.value))]
  if(values.length===1)return {value:values[0],status:'resolved'}
  if(values.length>1) {
    const directed=dates.filter(d=>/(?:sang|to)\s+(?:ngày\s+)?$/u.test(text.slice(0,d.index)))
    if(directed.length===1)return {value:directed[0].value,status:'resolved'}
    return {value:null,status:'ambiguous',reason:'Câu nguồn có nhiều ngày, cần đối chiếu hạn mới.'}
  }
  const sent=new Date(at)
  if(!Number.isFinite(sent.getTime()))return {value:null,status:'ambiguous',reason:'Chưa có thời điểm gửi hợp lệ để đối chiếu ngày.'}
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(sent)
  const part=(type:string)=>Number(parts.find(p=>p.type===type)?.value)
  const base=new Date(Date.UTC(part('year'),part('month')-1,part('day')))
  const shift=(days:number)=>new Date(base.getTime()+days*86_400_000).toISOString().slice(0,10)
  const relative=[[/ngày kia|day after tomorrow/u,2],[/ngày mai|tomorrow/u,1],[/hôm nay|today/u,0]] as const
  let remaining=text
  const relativeMatches=relative.filter(([pattern])=>{if(!pattern.test(remaining))return false;remaining=remaining.replace(new RegExp(pattern.source,'gu'),'');return true})
  if(relativeMatches.length>1)return {value:null,status:'ambiguous',reason:'Câu nguồn có nhiều ngày tương đối, chưa chốt một hạn.'}
  if(relativeMatches.length===1)return {value:shift(relativeMatches[0][1]),status:'resolved'}
  const english=['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  for(let day=0;day<7;day++) {
    if(text.includes(weekdays[day])||new RegExp('\\b'+english[day]+'\\b','u').test(text)) {
      const next=/tuần (?:sau|tới)|next\s+(?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/u.test(text)
      const current=/tuần này|this\s+(?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday)/u.test(text)
      if(next||current)return {value:shift(-((base.getUTCDay()+6)%7)+((day+6)%7)+(next?7:0)),status:'resolved'}
      return {value:null,status:'ambiguous',reason:'Có thứ trong tuần nhưng chưa xác định tuần nào.'}
    }
  }
  if(/ngày|hạn|tuần|tháng|deadline|next week|later|date|tomorrow|today/u.test(text))
    return {value:null,status:'ambiguous',reason:'Chưa có ngày cụ thể đủ rõ trong câu nguồn.'}
  return {value:null,status:'absent'}
}
