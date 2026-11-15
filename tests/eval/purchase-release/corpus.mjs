import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fixture = name => readFileSync(new URL(name, import.meta.url))
const manifest = fixture('SHA256SUMS').toString().trim().split('\n')
export const corpusId = digest(fixture('SHA256SUMS'))

function readLocked(name) {
  const bytes = fixture(name)
  assert.ok(manifest.includes(digest(bytes)+'  '+name), 'Changed benchmark input: '+name)
  return JSON.parse(bytes)
}

export const cases = readLocked('cases.json')
export const loadLabels = () => readLocked('labels.json')
export const hold = { decision:'hold',source:null,part:null,invoice:null,due:null }

export function assertBrowserDecisions(product, manual, labels = loadLabels()) {
  const expectedOrders = cases.map(row=>row.po)
  for (const [path, observations] of Object.entries({product,manual})) {
    assert.deepEqual(observations.map(row=>row.po),expectedOrders,path+' did not cover the locked orders')
    for (const {po,result} of observations) {
      assert.deepEqual(result,labels[po],path+' decision differs from the locked label for '+po)
    }
  }
  for (const {po,writeMs} of product) {
    if (labels[po].decision==='hold') assert.equal(writeMs,null,'Unexpected approval write for '+po)
    else assert.ok(Number.isFinite(writeMs) && writeMs>=0,'Missing approval write for '+po)
  }
  assert.ok(product.some(row=>row.replay),'Missing Chrome approval replay evidence')
}

export function materialize(row) {
  return row.mails.map(mail => ({
    id:mail.id, age:mail.age, from:mail.outsider?'kho@ngoai.example.test':row.supplier,
    subject:'['+row.po+'] '+mail.subject,
    body:'Vui lòng xem tệp đính kèm. Tên tệp có thể giống bản cũ.',
    parts:mail.parts.map(part => ({
      id:part.id, name:part.name,
      csv:[
        'po,invoice,replaces,line,quantity,unit,unit_price,currency'+(part.due?',payment_due':''),
        [part.po??row.po,part.invoice,part.replaces??row.original,'B',30,'bộ',2000,'VND',...(part.due?[part.due]:[])].join(','),
        '',
      ].join('\n'),
    })),
  }))
}
