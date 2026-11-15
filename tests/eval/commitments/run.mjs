import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cases, compare, corpusDigest, output } from './benchmark.mjs'

const [mode, manualPath] = process.argv.slice(2)
switch (mode) {
  case 'models': {
    const { runModels } = await import('./model.mjs')
    await runModels()
    break
  }
  case 'compare':
    compare(manualPath)
    break
  case 'manual': {
    mkdirSync(output, { recursive: true })
    const template = readFileSync(new URL('./manual.html', import.meta.url), 'utf8')
    const html = template.replace('__INBOXAI_FIXTURE__', () => JSON.stringify({ corpusDigest, cases }).replaceAll('<', '\\u003c'))
    writeFileSync(`${output}/manual.html`, html)
    if (manualPath === '--serve') {
      createServer((request, response) => {
        if (request.method !== 'GET' || !['/', '/retake'].includes(request.url)) { response.writeHead(404).end(); return }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html)
      }).listen(57341, '127.0.0.1', () => console.log('Đọc thư thủ công: http://127.0.0.1:57341/'))
    } else console.log(`${output}/manual.html`)
    break
  }
  default:
    throw new Error('Usage: npm run bench:commitments -- models | manual [--serve] | compare [manual.json]')
}
