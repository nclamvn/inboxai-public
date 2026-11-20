const el = name => document.getElementById(name)
const controls = [...document.querySelectorAll('button')]
const modeName = { manual:'Cách làm hiện tại', inbox:'InboxAI' }
let state, token, busy=false, clockSynced=0, shownMail

function note(message='') { el('notice').textContent=message }
function amount(ms) {
  const seconds=Math.floor(ms/1000)
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')
}
function tick() {
  const active=state?.active
  if(active) el('clock').textContent=amount(active.activeMs+(active.running?performance.now()-clockSynced:0))
}
function download(content,type) { return URL.createObjectURL(new Blob([content],{type})) }

function showMail(active,task) {
  const mail=el('mail'), choices=el('part')
  if(shownMail?.po!==task.po) {
    el('decision').reset()
    shownMail={po:task.po,count:0}
    mail.replaceChildren()
    choices.replaceChildren(new Option('Chọn đúng thư và tệp',''))
  }
  for(const message of active.messages.slice(shownMail.count)) {
    const details=document.createElement('details'), summary=document.createElement('summary')
    summary.textContent=message.subject+' · '+message.id
    const meta=document.createElement('p')
    meta.textContent=task.supplier+' · thời điểm gửi cách mốc hồ sơ '+message.age+' ngày'
    details.append(summary,meta)
    for(const part of message.parts) {
      const title=document.createElement('p'), csv=document.createElement('pre'), link=document.createElement('a')
      title.textContent=part.name+' · '+part.id
      csv.textContent=part.contents
      link.textContent='Tải '+part.name+' · '+part.id
      link.href=download(part.contents,'text/csv')
      link.download=part.name
      details.append(title,csv,link)
      choices.add(new Option(part.name+' · '+part.id,part.id))
    }
    mail.append(details)
  }
  shownMail.count=active.messages.length
}

function showResults(report) {
  el('results').hidden=false
  el('provenance').textContent=report.session==='chrome-automation'
    ? 'Nghiệm thu tự động trên Chrome. Thời gian phản ánh thao tác tự động.'
    : 'Phiên trên dữ liệu giả lập. Số liệu giới hạn trong nhóm và cách làm đã ghi nhận.'
  const summary=el('summary')
  summary.replaceChildren()
  for(const mode of ['manual','inbox']) {
    const rows=report.rows.filter(row=>row.mode===mode)
    const result=document.createElement('p')
    const ages=rows.map(row=>row.activeMs).sort((a,b)=>a-b)
    const count=name=>rows.reduce((sum,row)=>sum+row.counts[name],0)
    result.textContent=modeName[mode]+' · '+rows.filter(row=>row.outcome.correct).length+'/'+rows.length+
      ' đúng · '+rows.filter(row=>row.outcome.wrongApproval).length+' duyệt sai · trung vị '+amount(ages[1])+
      ' · '+count('source')+' lượt mở nguồn · '+count('help')+' lượt trợ giúp · '+count('revision')+' lượt sửa'
    summary.append(result)
  }
  const link=el('download')
  if(link.href) URL.revokeObjectURL(link.href)
  link.href=download(JSON.stringify(report,null,2)+'\n','application/json')
}

function render(next) {
  state=next
  clockSynced=performance.now()
  el('progress').textContent=state.progress+'/'+state.initialOrder.length+' hồ sơ'
  el('task').hidden=!state.task
  if(state.completed) {
    showResults(state.report)
    return
  }
  const {task,active}=state
  if(!task) return
  const manual=task.mode==='manual'
  el('method').textContent=modeName[task.mode]
  el('task-title').textContent=task.po
  el('instruction').textContent=manual
    ? 'Mua hàng rà soát thư, tệp và bàn giao kết luận cho Kế toán. Kế toán ghi quyết định cuối.'
    : 'Mở hồ sơ trong Hộp thư Mua hàng, rà soát và bàn giao. Kế toán mở liên kết sau khi cập nhật bàn giao.'
  el('scope').textContent='Hóa đơn hiện tại '+task.original+' · nhà cung cấp '+task.supplier+
    ' · đã nhận 30 bộ dòng B, đơn giá 2.000 VND · cần xác minh hạn trên bản đính chính.'
  el('start').hidden=!!active
  el('running').hidden=!active
  if(!active) return
  el('timer').textContent=active.running?'Tạm dừng':'Tiếp tục đo'
  for(const [key,title] of Object.entries({source:'Mở nguồn',help:'Cần trợ giúp',revision:'Sửa quyết định'})) {
    el(key).textContent=title+' · '+active.counts[key]
    el(key).disabled=!active.running
  }
  el('release').hidden=!active.latePending
  el('released').hidden=!active.lateReleased
  el('product').hidden=manual
  el('verify').hidden=manual
  el('mail').hidden=!manual
  el('decision').hidden=!manual
  if(manual) showMail(active,task)
  else for(const [actor,url] of Object.entries(active.links)) el(actor).href=url
  tick()
}

async function refresh() {
  const response=await fetch('/study/state')
  const result=await response.json()
  if(!response.ok) throw new Error(result.error)
  token=result.token
  el('roles').textContent='Mua hàng '+result.buyer+' · Kế toán '+result.reviewer+' · Mật khẩu giả lập '+result.password+'.'
  el('login').href=result.app+'/login'
  render(result)
}

async function event(action,data={}) {
  if(busy) return
  busy=true
  controls.forEach(button=>{button.disabled=true})
  note()
  try {
    const response=await fetch('/study/event',{method:'POST',headers:{'Content-Type':'application/json','X-Demo-Token':token},
      body:JSON.stringify({action,index:state.active?.index,revision:state.revision,...data})})
    const result=await response.json()
    if(!response.ok) throw new Error(result.error)
    render(result)
    if(['start','finish','abandon'].includes(action)) el(result.completed?'results-title':'task-title').focus()
    if(action==='release') note('Thư mới đã tới hồ sơ.')
    if(action==='restart') note('InboxAI đã kết nối lại.')
  } catch(error) {
    try {
      await refresh()
      note(error.message)
    } catch {
      note('Chưa xác nhận được thao tác. Khi kết nối lại, tải lại trang để xem trạng thái đã lưu.')
    }
  } finally {
    controls.forEach(button=>{button.disabled=false})
    for(const key of ['source','help','revision']) el(key).disabled=!state.active?.running
    busy=false
  }
}

document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.action!=='abandon'||window.confirm('Kết thúc hồ sơ mà không ghi nhận phê duyệt mới?')) event(button.dataset.action)
}))
el('timer').addEventListener('click',()=>event(state.active.running?'pause':'resume'))
el('refresh').addEventListener('click',()=>refresh().catch(error=>note(error.message)))
el('decision').addEventListener('submit',submit=>{
  submit.preventDefault()
  event('finish',Object.fromEntries(['number','due','part'].map(key=>[key,el(key).value])))
})
setInterval(tick,250)
refresh().catch(error=>note(error.message))
