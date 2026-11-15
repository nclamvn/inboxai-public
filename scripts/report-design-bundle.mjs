import { readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { runInNewContext } from 'node:vm'

const route = '/(dashboard)/inbox/page'
const manifest = {}
runInNewContext(readFileSync(`.next/server/app${route}_client-reference-manifest.js`, 'utf8'), manifest)
const entries = manifest.__RSC_MANIFEST[route]
const bootstrap = JSON.parse(readFileSync(`.next/server/app${route}/build-manifest.json`, 'utf8'))
const sum = files => {
  const paths = [...new Set(files)]
  return {
    files: paths.length,
    bytes: paths.reduce((total, file) => total + statSync(`.next/${file}`).size, 0),
    gzipBytes: paths.reduce((total, file) => total + gzipSync(readFileSync(`.next/${file}`)).length, 0),
  }
}
console.log(JSON.stringify({
  scope: 'Production Inbox route bootstrap and manifest entry assets. Excludes lazy chunks, fonts and network timing.',
  js: sum([...bootstrap.rootMainFiles, ...entries.entryJSFiles['[project]/src/app'+route]]),
  css: sum(entries.entryCSSFiles['[project]/src/app'+route].map(entry => entry.path)),
}, null, 2))
