const get=id=>document.getElementById(id)
let config, busy=false, readFailed=false
function link(id,url){get(id).href=url}
function render(state){
  link('review',state.handoff)
  const request=state.request
  get('progress').textContent=state.stage==='closed'?'Đã khép hồ sơ':request?.state==='accepted'?'Đã gửi yêu cầu':request?'Bản nháp đã lưu':'Chờ yêu cầu bổ sung'
  get('closure').textContent=state.stage==='closed'?'Kế toán đã duyệt; theo dõi đã dừng':state.corrected?'Bản đính chính đã đến; cần kiểm tra và duyệt':state.missing?'Đã có hồi đáp nhưng còn thiếu hạn':''
  for(const button of document.querySelectorAll('button[data-action]')) button.disabled=busy||state.busy||
    (['missing','corrected'].includes(button.dataset.action)&&(state.stage!=='buyer'||request?.state!=='accepted'))
}
async function refresh(){if(busy||document.hidden)return;try{const response=await fetch('/state');if(!response.ok)throw Error();render(await response.json());if(readFailed){get('notice').textContent='Đã kết nối lại bản thử. Tiến độ đã lưu vẫn còn.';readFailed=false}}catch{readFailed=true;get('notice').textContent='Chưa đọc được trạng thái. Tiến độ đã lưu không bị xóa; thử tải lại.'}}
async function action(event){
  if(busy)return
  busy=true
  readFailed=false
  for(const button of document.querySelectorAll('button[data-action]'))button.disabled=true
  get('notice').textContent='Đang xử lý…'
  try{
    const name=event.currentTarget.dataset.action
    const response=await fetch('/'+name,{method:'POST',headers:{'content-type':'application/json','x-demo-token':config.token},
      body:JSON.stringify({confirm:get('confirmation').value})})
    const result=await response.json()
    if(!response.ok)throw Error(result.error)
    render(result)
    get('notice').textContent=name==='reset'?'Đã khôi phục bộ ban đầu. Đăng nhập lại để bắt đầu phiên mới.':name==='restart'?'Ứng dụng đã chạy lại. Mở lại màn đang làm để tiếp tục.':'Đã nạp tình huống. Mở lại Inbox để kiểm tra.'
    if(name==='reset')get('confirmation').value=''
  }catch(error){get('notice').textContent=error.message||'Chưa hoàn tất. Kiểm tra rồi thử lại.'}
  finally{busy=false;await refresh()}
}
async function start(){try{
  const response=await fetch('/config');if(!response.ok)throw Error()
  config=await response.json()
  get('reference').textContent=config.po;get('buyer').textContent=config.buyer;get('reviewer').textContent=config.reviewer;get('password').textContent=config.password
  get('version').textContent='Phiên bản '+config.version.commit+' / '+config.version.fingerprint
  get('mail-count').textContent=config.mailCount+' thư đã đồng bộ · 2 Gmail giả lập'
  link('inbox',config.app+'/inbox');for(const id of ['ask','ledger','operator'])link(id,config[id])
  for(const button of document.querySelectorAll('button[data-action]'))button.addEventListener('click',action)
  const version=await(await fetch('/version')).json()
  get('freshness').textContent=version.current.fingerprint===version.built.fingerprint?'Đang chạy đúng mã nguồn':'Mã nguồn đã đổi; cần khởi động lại bản thử'
  await refresh();setInterval(refresh,5000);document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh)
}catch{get('notice').textContent='Chưa kết nối được bản dùng thử. Kiểm tra tiến trình local rồi tải lại.'}}
void start()
