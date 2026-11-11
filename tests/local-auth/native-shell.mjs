import assert from 'node:assert/strict'
import { execFile as exec } from 'node:child_process'
import { createServer, request } from 'node:http'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const execCommand = promisify(exec)
const execFile = (command, args, options) => execCommand(command, args, { timeout: 45_000, ...options })
const output = 'docs/phase-2/evidence/m6a'
const require = createRequire(import.meta.url)
const axe = readFileSync(require.resolve('axe-core/axe.min.js'))
const probe = readFileSync(new URL('./native-probe.js', import.meta.url))
const userAgent = 'InboxAI-M6-Local'
const address = 'http://127.0.0.1:55300'

function assertLocalConfig(raw) {
  const config = JSON.parse(raw)
  assert.equal(config.server?.url, address, 'Native test build must target the loopback fixture')
  assert.ok(config.appendUserAgent?.includes(userAgent), 'Native test build must identify itself to the fixture')
}

export async function startNativeFixture(cookies) {
  let events = []
  let requests = []
  let active = false
  const server = createServer(async (req, res) => {
    const native = req.headers['user-agent']?.includes(userAgent)
    const path = new URL(req.url, address).pathname
    if (native && active && requests.length < 60) requests.push([req.method, path])
    if (native && active && path === '/') {
      res.writeHead(302, { location: '/inbox', 'cache-control': 'no-store',
        'set-cookie': [...cookies].filter(([key, value]) => key.includes('auth-token') && value)
          .map(([key, value]) => `${key}=${value}; Path=/; SameSite=Lax`) })
      res.end()
      return
    }
    if (path.startsWith('/__m6_native/')) {
      if (!native || !active) { res.writeHead(404).end(); return }
      if (path.endsWith('/axe.js')) { res.writeHead(200, { 'content-type': 'application/javascript' }).end(axe); return }
      if (path.endsWith('/probe.js')) { res.writeHead(200, { 'content-type': 'application/javascript' }).end(probe); return }
      if (path.endsWith('/result') && req.method === 'POST' && req.headers.origin === address) {
        let payload = ''
        for await (const chunk of req) {
          payload += chunk
          if (payload.length > 8000) { res.writeHead(413).end(); return }
        }
        try { events.push(JSON.parse(payload)); res.writeHead(204).end() } catch { res.writeHead(400).end() }
        return
      }
      res.writeHead(404).end()
      return
    }
    if (native && ['/api/source-accounts/sync', '/api/emails/send'].includes(path)) {
      res.writeHead(403).end()
      return
    }
    const decorate = native && path === '/inbox' && req.method === 'GET' && !req.headers.rsc
    const upstream = request({ hostname: '127.0.0.1', port: 55301, path: req.url, method: req.method,
      headers: { ...req.headers, ...(decorate && { 'accept-encoding': 'identity' }) },
    }, response => {
      if (!decorate || response.statusCode !== 200 || !response.headers['content-type']?.includes('text/html')) {
        res.writeHead(response.statusCode, response.headers); response.pipe(res); return
      }
      const headers = { ...response.headers }
      delete headers['content-length']
      delete headers['transfer-encoding']
      delete headers.etag
      headers['content-security-policy'] = headers['content-security-policy']
        .replace(/connect-src [^;]+/, "connect-src 'self' http://127.0.0.1:55321")
        .replace(/img-src [^;]+/, "img-src 'self' data: blob:")
        .replace(/script-src [^;]+/, "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const html = Buffer.concat(chunks).toString().replace('</head>',
          '<script defer src="/__m6_native/axe.js"></script><script defer src="/__m6_native/probe.js"></script></head>')
        res.writeHead(200, { ...headers, 'content-length': Buffer.byteLength(html) }).end(html)
      })
    })
    upstream.on('error', () => res.writeHead(502).end())
    req.pipe(upstream)
  })
  await new Promise((resolve, reject) => server.once('error', reject).listen(55300, '127.0.0.1', resolve))
  return {
    async rehearse(record) {
      mkdirSync(output, { recursive: true })
      const devices = (process.env.M6_IOS_SIMULATORS ?? '').split(',').filter(Boolean).map(pair => {
        const [name, udid] = pair.split('=')
        assert.match(name, /^[a-z-]+$/)
        assert.match(udid, /^[0-9a-f-]{36}$/i)
        return { name, platform: 'ios', launch: () => ios(udid, name), capture: () => execFile('xcrun', ['simctl', 'io', udid, 'screenshot', `${output}/${name}.png`]) }
      })
      if (process.env.M6_ANDROID_SERIAL) {
        const serial = process.env.M6_ANDROID_SERIAL
        assert.match(serial, /^emulator-\d+$/)
        const adb = (...args) => execFile(process.env.M6_ADB ?? 'adb', ['-s', serial, ...args], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 })
        devices.push({ name: 'android-phone', platform: 'android',
          launch: async () => {
            const apk = 'android/app/build/outputs/apk/debug/app-debug.apk'
            assertLocalConfig((await execFile('unzip', ['-p', apk, 'assets/capacitor.config.json'])).stdout)
            assert.match((await execFile('unzip', ['-p', apk, 'assets/public/index.html'])).stdout, /<main>/)
            await adb('install', '-r', apk)
            await adb('reverse', 'tcp:55300', 'tcp:55300')
            await adb('reverse', 'tcp:55321', 'tcp:55321')
            await adb('shell', 'am', 'start', '-n', 'vn.inboxai.app/.MainActivity')
          },
          back: () => adb('shell', 'input', 'keyevent', '4'),
          capture: async () => writeFileSync(`${output}/android-phone.png`, (await adb('exec-out', 'screencap', '-p')).stdout),
        })
      }
      assert.ok(devices.length, 'Specify booted, disposable simulators for the local native rehearsal')
      const results = []
      for (const device of devices) {
        events = []
        requests = []
        active = true
        try {
          await device.launch()
          const reading = await waitFor(() => events.find(event => event.stage === 'reading' || event.error), device.name)
          assert.equal(reading.error, undefined)
          await device.capture()
          if (device.back) await device.back()
          const returned = await waitFor(() => events.find(event => event.stage === 'returned' || event.error), device.name)
          assert.equal(returned.error, undefined)
          assert.equal(reading.platform, device.platform)
          assert.equal(reading.overflow, false)
          assert.deepEqual(reading.axe, [])
          assert.equal(returned.restoredFocus, true)
          if (device.platform === 'ios') assert.equal(reading.keyboard, 'native')
          results.push({ device: device.name, reading, returned })
          record(`${device.name} native WebView opens a source, runs axe and returns focus to Inbox`, true)
        } catch (error) {
          await device.capture().catch(() => {})
          results.push({ device: device.name, error: error.message, events, requests })
          console.error(`${device.name}: ${error.message}`)
        } finally {
          active = false
        }
      }
      const run = devices.map(device => device.name).join('-')
      writeFileSync(`${output}/native-${run}.json`, JSON.stringify(results, null, 2) + '\n')
      assert.ok(results.every(result => !result.error), 'One or more requested native shell checks failed')
    },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }),
  }
}

async function ios(udid, name) {
  assert.ok(name.startsWith('ios-'))
  const bundle = 'ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app'
  assertLocalConfig(readFileSync(`${bundle}/capacitor.config.json`, 'utf8'))
  assert.match(readFileSync(`${bundle}/public/index.html`, 'utf8'), /<main>/)
  await execFile('xcrun', ['simctl', 'install', udid, bundle])
  await execFile('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, 'vn.inboxai.app'])
}

async function waitFor(read, name) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const value = read()
    if (value) return value
    await delay(200)
  }
  throw new Error(`No native probe response from ${name}`)
}
