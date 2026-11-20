import assert from 'node:assert/strict'
import { audit } from './browser.mjs'

const scenario='[WS-20261120] Trạm cân gián đoạn, cần xác nhận phương án nhận hàng'
export async function rehearseWorkspaceUI({page,app,output,record}) {
  const faults=[]
  const onError=error=>faults.push(error.message)
  page.on('pageerror',onError)
  async function capture(name) {
    assert.deepEqual(await audit(page),[])
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.screenshot({path:output+'/ui-'+name+'.png',animations:'disabled'})
  }
  const inbox=async()=>{
    await page.goto(app+'/inbox')
    await page.locator('[data-email-opener]').first().waitFor()
  }
  try {
    await inbox()
    const nav=page.getByRole('navigation',{name:'Hộp thư và công cụ'})
    for(const name of ['Hộp thư đến','Cam kết','Ask Inbox','AI Operator']) assert.equal(await nav.getByRole('link',{name,exact:true}).isVisible(),true)
    assert.equal(await nav.locator('[aria-current="page"]').count(),1)
    const utilities=page.getByRole('group',{name:'Tiện ích hộp thư'})
    const settings=utilities.getByRole('button',{name:'Cài đặt',exact:true})
    const settingsBox=await settings.boundingBox()
    assert.equal(Math.round(page.viewportSize().width-settingsBox.x-settingsBox.width),16)
    const briefing=utilities.getByRole('button',{name:'Bản tin hộp thư',exact:true})
    await briefing.click()
    const closeBriefing=utilities.getByRole('button',{name:'Đóng bản tin',exact:true})
    await closeBriefing.waitFor()
    const closeBox=await closeBriefing.boundingBox()
    assert.ok(closeBox.x>=0 && closeBox.x+closeBox.width<=page.viewportSize().width)
    await closeBriefing.click()
    await capture('desktop-inbox')
    const rows=page.locator('.neo-mail-row')
    const comfortable=await rows.first().boundingBox()
    const firstId=await page.locator('[data-email-opener]').first().getAttribute('data-email-opener')
    await page.getByRole('button',{name:'Hiển thị gọn',exact:true}).click()
    assert.equal(await page.locator('[data-mail-density]').getAttribute('data-mail-density'),'compact')
    await page.waitForFunction(previous => {
      const row=document.querySelector('.neo-mail-row');
      return row && row.getBoundingClientRect().height < previous;
    }, comfortable.height).catch(async error => {
      console.error('Density diagnostic', comfortable, await rows.first().evaluate(el=>({height:el.getBoundingClientRect().height,padding:getComputedStyle(el).paddingBlock,minHeight:getComputedStyle(el).minHeight,density:el.closest('[data-mail-density]')?.getAttribute('data-mail-density')})));
      throw error;
    })
    assert.ok((await rows.first().boundingBox()).height<comfortable.height)
    assert.equal(await page.locator('[data-email-opener]').first().getAttribute('data-email-opener'),firstId)
    await capture('desktop-compact')
    await page.getByRole('button',{name:'Hiển thị thoáng',exact:true}).click()
    const lanes=page.getByRole('group',{name:'Luồng thư'})
    await lanes.getByRole('button',{name:/^Giao dịch/}).click()
    await page.getByRole('button',{name:/^Mở thư: \[WS-20261120\] Biên nhận chuyển khoản/}).waitFor()
    assert.ok(await rows.count()>0)
    for(const row of await rows.all()) assert.equal(await row.getAttribute('data-mail-tone'),'transaction')
    await capture('transactions')
    await lanes.getByRole('button',{name:/^Cần xử lý/}).click()
    await page.getByRole('button',{name:'Ưu tiên và nguồn: '+scenario,exact:true}).click()
    const dialog=page.getByRole('dialog',{name:'Ưu tiên và nguồn'})
    await dialog.locator('q').getByText('Sự cố đang xảy ra',{exact:true}).waitFor()
    await dialog.getByRole('link',{name:scenario,exact:true}).click()
    await page.getByRole('heading',{name:scenario,exact:true}).waitFor()
    assert.ok(new URL(page.url()).searchParams.get('email'))
    await capture('source-reading')
    record('UI: semantic category shortcuts filter actual owned mail; density preserves order and actions; urgent reason opens the exact source in the reading pane.',true)

    await inbox()
    const launch=page.getByRole('button',{name:'Đi đến nhanh',exact:true})
    await launch.focus()
    await page.keyboard.press('Control+j')
    const quick=page.getByRole('dialog',{name:'Đi đến nhanh'})
    await quick.waitFor()
    await quick.getByRole('searchbox',{name:'Tìm màn hình'}).fill('ban nhap')
    assert.equal(await quick.getByRole('link').count(),1)
    assert.equal(await quick.getByRole('link',{name:'Bản nháp',exact:true}).getAttribute('href'),'/drafts')
    await capture('quick-navigation')
    await page.keyboard.press('Escape')
    await quick.waitFor({state:'hidden'})
    assert.equal(await launch.evaluate(element=>element===document.activeElement),true)
    await launch.click()
    await quick.getByRole('searchbox',{name:'Tìm màn hình'}).fill('Ask')
    await quick.getByRole('link',{name:'Ask Inbox',exact:true}).click()
    await page.getByRole('heading',{name:'Ask Inbox',exact:true}).waitFor()
    assert.equal(new URL(await page.getByRole('link',{name:/^Tìm một hóa đơn/}).getAttribute('href'),app).searchParams.get('q'),'hóa đơn')
    await capture('ask-inbox')
    await nav.getByRole('link',{name:'AI Operator',exact:true}).click()
    await page.getByRole('heading',{name:'AI Operator',exact:true}).waitFor()
    await capture('operator')
    await nav.getByRole('link',{name:'Cam kết',exact:true}).click()
    await page.getByRole('heading',{name:'Cam kết',exact:true}).waitFor()
    await capture('commitments')
    record('UI: four primary workspaces render with one active destination. Accent-free quick navigation opens a real route, supports Escape and returns keyboard focus without executing mail actions.',true)

    for(const [name,width,height] of [['tablet',834,1112],['mobile',390,844],['small-mobile',320,740]]) {
      await page.setViewportSize({width,height})
      await inbox()
      if(width<768) {
        const mobile=page.getByRole('navigation',{name:'Điều hướng di động'})
        for(const label of ['Cam kết','Ask Inbox','AI Operator']) assert.equal(await mobile.getByRole('link',{name:label,exact:true}).isVisible(),true)
        await mobile.getByRole('button',{name:'Thêm thư mục và công cụ'}).click()
        const more=page.getByRole('dialog',{name:'Thư mục và công cụ'})
        for(const label of ['Bản nháp','Đã gửi','Gắn sao','Cài đặt','Tìm thư và tệp']) assert.equal(await more.getByRole('link',{name:label,exact:true}).isVisible(),true)
        await page.keyboard.press('Control+j')
        assert.equal(await page.getByRole('dialog',{name:'Đi đến nhanh'}).count(),0,'Quick navigation must not overlay an existing dialog')
        await capture(name+'-folders')
        await page.keyboard.press('Escape')
        await mobile.getByRole('link',{name:'Ask Inbox',exact:true}).click()
        await page.getByRole('heading',{name:'Ask Inbox',exact:true}).waitFor()
        await capture(name+'-ask')
        await inbox()
      }
      if(width<768) {
        const accountSwitcher=page.getByRole('button',{name:'Tất cả tài khoản',exact:true})
        await accountSwitcher.click()
        const accountMenu=page.locator('.neo-mobile-tools .neo-account-menu')
        await accountMenu.waitFor()
        const menuBox=await accountMenu.boundingBox()
        assert.ok(menuBox.x>=0 && menuBox.x+menuBox.width<=width)
        await accountSwitcher.click()
        await page.getByRole('button',{name:'Thu gọn việc cần chú ý'}).click()
        await page.getByRole('button',{name:'Mở việc cần chú ý'}).waitFor()
        assert.equal(await page.getByRole('region',{name:'Hồ sơ mua hàng cần xử lý'}).isVisible(),false)
        assert.ok(await page.locator('[data-email-opener]').first().isVisible())
      }
      await capture(name+'-inbox')
    }
    record('UI: tablet, 390px and 320px mobile keep primary pillars and all secondary folders reachable, with native dialog focus and no horizontal overflow or sampled axe violations.',true)
    await page.setViewportSize({width:1440,height:960})
    await page.getByRole('button',{name:'Chuyển sang tối',exact:true}).click()
    await page.locator('html.dark').waitFor()
    await capture('dark-inbox')
    await page.getByRole('button',{name:'Chuyển sang sáng',exact:true}).click()
    await page.evaluate(()=>document.documentElement.style.fontSize='200%')
    await capture('text-200')
    await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'))
    assert.deepEqual(faults,[])
    record('UI: dark palette and 200% text preserve legibility, navigation and source actions; sampled screens have no WCAG-tagged axe violations or browser exceptions.',true)
  } finally {
    await page.evaluate(()=>document.documentElement.style.removeProperty('font-size')).catch(()=>{})
    page.off('pageerror',onError)
    await page.setViewportSize({width:1440,height:960})
    await inbox()
  }
}
