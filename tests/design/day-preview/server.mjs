import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { seedDailyCommitments } from '../daily-commitment-fixture.mjs'

const require = createRequire(import.meta.url)
const assets = new Map([
  ['/', ['text/html; charset=utf-8', readFileSync(new URL('./index.html', import.meta.url))]],
  ['/day.css', ['text/css; charset=utf-8', readFileSync(new URL('./day.css', import.meta.url))]],
  ['/day.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./day.js', import.meta.url))]],
  ['/inter-vi.woff2', ['font/woff2', readFileSync(require.resolve('@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2'))]],
  ['/inter-latin.woff2', ['font/woff2', readFileSync(require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'))]],
])

export async function startDayPreview({ app, mailpit, email, password, userId, admin, appFetch, fixture }) {
  const seed = await seedDailyCommitments({ email, userId, admin, appFetch, fixture, compareAcrossAccounts: true })
  const { corpus, messages, add, main, appJson } = seed
  const host = '127.0.0.1:57342'
  const origin = 'http://' + host
  const token = randomBytes(24).toString('base64url')
  let stage = 0
  let adding = false
  let lastArrival = 0

  async function readState() {
    const [commitment, sent] = await Promise.all([
      appJson('/api/commitments/' + main.id),
      admin.from('emails').select('id').eq('user_id', userId).eq('source_account_id', seed.accounts.work)
        .eq('direction', 'outbound').eq('subject', 'Re: ' + messages.get('a1').subject).eq('send_status', 'sent').limit(1).throwOnError(),
    ])
    const prefix = app + '/commitments?group=waiting&view=proposals&source='
    const source = id => messages.has(id) ? prefix + messages.get(id).id : null
    const ask = new URLSearchParams({ q: 'Đối chiếu ngày giao hàng của ' + corpus.reference + '?', view: 'answer' })
    return {
      stage, reminded: sent.data.length > 0,
      changed: commitment.state.dueOn === corpus.newDue,
      closed: commitment.state.status === 'completed',
      links: {
        reply: source('a2'), ask: app + '/search?' + ask, change: source('a3'), complete: source('a4'),
        ledger: app + '/commitments?group=closed&id=' + main.id, operator: app + '/operator',
      },
    }
  }

  const server = createServer(async (request, response) => {
    const write = (status, type, body) => {
      response.writeHead(status, {
        'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      })
      response.end(body)
    }
    const json = (status, data) => write(status, 'application/json; charset=utf-8', JSON.stringify(data))
    if (request.headers.host !== host) return json(403, { error: 'Chỉ mở từ địa chỉ local của kịch bản.' })
    try {
      if (request.method === 'GET') {
        const asset = assets.get(request.url)
        if (asset) return write(200, ...asset)
        if (request.url === '/config') return json(200, { token, app, mailpit, email, password, reference: corpus.reference })
        if (request.url === '/state') return json(200, await readState())
      }
      const step = /^\/advance\/([1-3])$/.exec(request.url)
      if (request.method === 'POST' && step) {
        if (request.headers.origin !== origin || request.headers['x-demo-token'] !== token) {
          return json(403, { error: 'Yêu cầu chưa đến từ trang kịch bản.' })
        }
        if (adding) return json(409, { error: 'Đang nạp thư. Hãy thử lại.' })
        adding = true
        try {
          const state = await readState()
          const desired = Number(step[1])
          if (desired === stage) return json(200, state)
          if (desired !== stage + 1 || !state.reminded || (desired === 3 && !state.changed)) {
            return json(409, { error: 'Hoàn thành thao tác ở mốc trước rồi nạp thư tiếp theo.' })
          }
          lastArrival = Math.max(Date.now(), lastArrival + 1000)
          await add(corpus.replies[desired - 1], new Date(lastArrival).toISOString())
          stage = desired
          return json(200, await readState())
        } finally { adding = false }
      }
      return json(404, { error: 'Không có trang này.' })
    } catch {
      return json(503, { error: 'Chưa đọc được fixture local. Thử tải lại.' })
    }
  })
  await new Promise((resolve, reject) => server.once('error', reject).listen(57342, '127.0.0.1', resolve))
  return {
    origin, seed,
    close: () => new Promise(resolve => {
      server.close(resolve)
      server.closeAllConnections()
    }),
  }
}
