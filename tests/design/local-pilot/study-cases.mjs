const invoiceFields = 'po,invoice,replaces,line,quantity,unit,unit_price,currency,payment_due'
const dayAfter = (date, days) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0,10)

export function studyBundle(bundle, due) {
  return ['same-name','late','stale'].map((kind,index) => {
    const code = (bundle === 'A' ? 6300 : 7300) + index
    const po = 'PO-' + code
    const original = 'INV-' + (code*10+1)
    const candidate = 'INV-' + (code*10+2)
    const replacement = 'INV-' + (code*10+3)
    const supplier = ['hoa@thiet-bi.example.test','son@co-khi.example.test','yen@vat-tu.example.test'][index]
    const message = (suffix,age,subject,rows) => ({
      id: po+'-'+suffix, age, subject, parts: rows.map(({reference=po,number,replaces=original,date=due},part) => ({
        id: po+'-'+suffix+'#'+(part+1), name:'hoa-don.csv',
        contents:[invoiceFields,[reference,number,replaces,'B',30,'bộ',2000,'VND',date].join(','),''].join('\n'),
      })),
    })
    const first = message('bo-sung',1,'Bổ sung hóa đơn theo yêu cầu',kind==='same-name'
      ? [{reference:'PO-8099',number:'INV-80992'},{number:candidate}]
      : [{number:candidate}])
    const messages = [first]
    if (kind==='late') messages.push(message('chuyen-tiep',3,'Chuyển tiếp thư từ tuần trước',
      [{number:replacement,date:dayAfter(due,-2)}]))
    const finalDue = kind==='stale' ? dayAfter(due,3) : due
    const late = kind==='stale' ? message('dinh-chinh',0,'Đính chính thay thế bản đã bàn giao',
      [{number:replacement,replaces:candidate,date:finalDue}]) : null
    return {kind,po,original,candidate,supplier,
      messages,late,expected:{number:late?replacement:candidate,due:finalDue,part:late?late.parts[0].id:first.parts.at(-1).id}}
  })
}
