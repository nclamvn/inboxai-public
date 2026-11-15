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
