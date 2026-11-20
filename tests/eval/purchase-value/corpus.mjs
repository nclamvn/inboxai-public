import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const bytes = name => readFileSync(new URL('./'+name,import.meta.url))
const digest = data => createHash('sha256').update(data).digest('hex')
const manifest = bytes('SHA256SUMS').toString().trim().split('\n')
function verified(name) {
  const expected = manifest.find(line=>line.endsWith('/'+name))?.split(/\s+/)[0]
  assert.ok(expected,'Missing frozen digest for '+name)
  const file=bytes(name)
  assert.equal(digest(file),expected,'Frozen purchase-value fixture changed: '+name)
  return JSON.parse(file)
}
export const {version,due,bundles}=verified('cases.json')
export const corpusId=version+':'+digest(bytes('cases.json'))
export const cases=Object.values(bundles).flat()
export const loadLabels=()=>verified('labels.json')
export const fields=['decision','source','part','number','due']
export const decisionFields=result=>Object.fromEntries(fields.map(key=>[key,result?.[key]??null]))
export const differences=(expected,result)=>fields.filter(key=>result?.[key]!==expected[key])
