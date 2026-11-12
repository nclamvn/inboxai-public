import { execFileSync } from 'node:child_process'
import { Resolver } from 'node:dns/promises'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import net, { type Socket } from 'node:net'
import { join } from 'node:path'
import tls from 'node:tls'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { testImapConnection } from '@/lib/email/imap-client'
import { sendEmailViaSMTP, testSmtpConnection } from '@/lib/email/smtp-client'

const hostname = 'mail-wire.example.test'
const pinnedIp = '93.184.216.34' // Synthetic DNS answer. Every test socket is redirected to loopback.
const credentials = { host: hostname, username: 'synthetic', password: 'synthetic-password' }
const verify = { imap: testImapConnection, smtp: testSmtpConnection }
const ports = { imap: [143, 993], smtp: [587, 465] }
type Protocol = keyof typeof verify
type Mode = 'implicit' | 'starttls' | 'clear'
let directory: string, key: Buffer, cert: Buffer

beforeAll(() => {
  directory = mkdtempSync(join(process.cwd(), '.codex-mail-tls-'))
  const keyPath = join(directory, 'key.pem'), certPath = join(directory, 'cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
    '-subj', `/CN=${hostname}`, '-addext', `subjectAltName=DNS:${hostname},IP:${pinnedIp}`,
    '-keyout', keyPath, '-out', certPath], { stdio: 'ignore' })
  key = readFileSync(keyPath)
  cert = readFileSync(certPath)
})
afterAll(() => { if (directory) rmSync(directory, { recursive: true, force: true }) })

async function startWire(protocol: Protocol, mode: Mode) {
  const sockets = new Set<Socket>()
  const state = { tcp: 0, sni: [] as string[], plaintextAuth: 0, tlsAuth: 0, upgrades: 0 }
  const context = tls.createSecureContext({ key, cert })

  function serve(socket: Socket, encrypted: boolean, greet: boolean) {
    let buffer = ''
    const respond = (message: string) => socket.write(`${message}\r\n`)
    const data = (chunk: Buffer) => {
      buffer += chunk.toString('ascii')
      let end: number
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const [tag, command] = line.split(' ')
        if (protocol === 'smtp' ? tag === 'AUTH' : command === 'LOGIN' || command === 'AUTHENTICATE') {
          if (encrypted) state.tlsAuth++
          else state.plaintextAuth++
          respond(protocol === 'smtp' ? '235 Synthetic authentication accepted' : `${tag} OK Synthetic login`)
        } else if ((protocol === 'smtp' ? tag : command) === 'STARTTLS') {
          if (mode !== 'starttls' || encrypted) {
            respond(protocol === 'smtp' ? '454 TLS unavailable' : `${tag} BAD TLS unavailable`)
            continue
          }
          state.upgrades++
          respond(protocol === 'smtp' ? '220 Ready to start TLS' : `${tag} OK Ready to start TLS`)
          socket.off('data', data)
          const upgraded = new tls.TLSSocket(socket, { isServer: true, secureContext: context, SNICallback })
          upgraded.on('error', () => {})
          serve(upgraded, true, false)
          return
        } else if (protocol === 'smtp') {
          if (tag === 'EHLO') respond(`250-fixture${mode === 'starttls' && !encrypted ? '\r\n250-STARTTLS' : ''}\r\n250 AUTH PLAIN`)
          else if (tag === 'QUIT') socket.end('221 Bye\r\n')
          else respond('500 Unexpected synthetic command')
        } else if (command === 'CAPABILITY') {
          respond(`* CAPABILITY IMAP4rev1 NAMESPACE${mode === 'starttls' && !encrypted ? ' STARTTLS' : ''}\r\n${tag} OK Capability`)
        } else if (command === 'NAMESPACE') {
          respond(`* NAMESPACE (("" "/")) NIL NIL\r\n${tag} OK Namespace`)
        } else if (command === 'LOGOUT') {
          socket.end(`* BYE Logout\r\n${tag} OK Logout\r\n`)
        } else {
          respond(`${tag} BAD Unexpected synthetic command`)
        }
      }
    }
    socket.on('data', data)
    if (greet) respond(protocol === 'smtp' ? '220 fixture ESMTP' : '* OK Synthetic IMAP ready')
  }

  function SNICallback(name: string, callback: (err: Error | null, context: tls.SecureContext) => void) {
    state.sni.push(name)
    callback(null, context)
  }
  const server = mode === 'implicit'
    ? tls.createServer({ key, cert, SNICallback }, socket => serve(socket, true, true))
    : net.createServer(socket => serve(socket, false, true))
  server.on('connection', socket => {
    state.tcp++
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
  })
  await new Promise<void>((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  return {
    state, port: (server.address() as net.AddressInfo).port,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

function interceptWire(port: number, expectedPort: number, trusted = true, mixed = false) {
  // A second resolution returns a blocked IP. Refuse any unpinned socket to keep tests offline.
  const a = vi.spyOn(Resolver.prototype, 'resolve4')
    .mockResolvedValueOnce(mixed ? [pinnedIp, '127.0.0.1'] : [pinnedIp]).mockResolvedValue(['127.0.0.1'])
  const aaaa = vi.spyOn(Resolver.prototype, 'resolve6').mockRejectedValue(Object.assign(new Error(), { code: 'ENODATA' }))
  const connectTcp = net.connect, connectTls = tls.connect
  const attempts: Array<{ host?: string; port?: number }> = []
  function route(options: net.TcpNetConnectOpts) {
    attempts.push({ host: options.host, port: options.port })
    if (options.host !== pinnedIp || options.port !== expectedPort) throw new Error('Fixture blocked unpinned dial')
    return { ...options, host: '127.0.0.1', port }
  }
  vi.spyOn(net, 'connect').mockImplementation(((options: net.TcpNetConnectOpts, callback: () => void) =>
    connectTcp(route(options), callback)) as typeof net.connect)
  vi.spyOn(tls, 'connect').mockImplementation(((options: tls.ConnectionOptions, callback: () => void) => {
    const local = options.socket ? options : { ...options, ...route(options as net.TcpNetConnectOpts) }
    return connectTls({ ...local, ...(trusted && { ca: cert }) }, callback)
  }) as typeof tls.connect)
  return { a, aaaa, attempts }
}

it.each(['imap', 'smtp'] as const)('%s rejects mixed DNS and private literals before a socket or credentials', async protocol => {
  const wire = await startWire(protocol, 'implicit')
  try {
    const port = ports[protocol][1]
    const hook = interceptWire(wire.port, port, true, true)
    expect(await verify[protocol]({ ...credentials, port, secure: true })).toMatchObject({ success: false })
    expect(await verify[protocol]({ ...credentials, host: '::ffff:127.0.0.1', port, secure: true })).toMatchObject({ success: false })
    expect(hook.attempts).toEqual([])
    expect(hook.a).toHaveBeenCalledTimes(1)
    expect(wire.state).toMatchObject({ tcp: 0, plaintextAuth: 0, tlsAuth: 0 })
  } finally { await wire.close() }
})

it.each([
  ['imap', 'implicit'], ['imap', 'starttls'], ['smtp', 'implicit'], ['smtp', 'starttls'],
] as const)('%s %s uses pinned DNS and authenticates only after TLS with the configured SNI', async (protocol, mode) => {
  const wire = await startWire(protocol, mode)
  try {
    const secure = mode === 'implicit', port = ports[protocol][Number(secure)]
    const hook = interceptWire(wire.port, port)
    expect(await verify[protocol]({ ...credentials, port, secure })).toMatchObject({ success: true })
    expect(hook.attempts).toEqual([{ host: pinnedIp, port }])
    expect(hook.a).toHaveBeenCalledExactlyOnceWith(hostname)
    expect(hook.aaaa).toHaveBeenCalledExactlyOnceWith(hostname)
    expect(wire.state).toEqual({ tcp: 1, sni: [hostname], upgrades: secure ? 0 : 1, plaintextAuth: 0, tlsAuth: 1 })
  } finally { await wire.close() }
})

it.each([
  ['imap', 'starttls', 'wrong-name'], ['imap', 'implicit', 'untrusted'], ['imap', 'clear', 'stripped'],
  ['smtp', 'starttls', 'wrong-name'], ['smtp', 'implicit', 'untrusted'], ['smtp', 'clear', 'stripped'],
] as const)('%s %s rejects %s without authenticating', async (protocol, mode, failure) => {
  const wire = await startWire(protocol, mode)
  try {
    const secure = mode === 'implicit', port = ports[protocol][Number(secure)]
    const host = failure === 'wrong-name' ? 'wrong.example.test' : hostname
    interceptWire(wire.port, port, failure !== 'untrusted')
    expect(await verify[protocol]({ ...credentials, host, port, secure })).toMatchObject({ success: false })
    expect(wire.state).toMatchObject({ tcp: 1, plaintextAuth: 0, tlsAuth: 0 })
    if (failure === 'wrong-name') expect(wire.state.sni).toEqual([host])
  } finally { await wire.close() }
})

it.each(['imap', 'smtp'] as const)('%s checks a public literal against the certificate IP SAN', async protocol => {
  const wire = await startWire(protocol, 'implicit')
  try {
    const port = ports[protocol][1]
    const hook = interceptWire(wire.port, port)
    expect(await verify[protocol]({ ...credentials, host: pinnedIp, port, secure: true })).toMatchObject({ success: true })
    expect(hook.a).not.toHaveBeenCalled()
    expect(hook.aaaa).not.toHaveBeenCalled()
    expect(wire.state).toMatchObject({ tcp: 1, sni: [], plaintextAuth: 0, tlsAuth: 1 })
  } finally { await wire.close() }
})

it('rejects a blocked SMTP destination before dispatch', async () => {
  const hook = interceptWire(1, 465)
  expect(await sendEmailViaSMTP({ ...credentials, host: '169.254.169.254', port: 465, secure: true }, {
    from: { name: 'Fixture', address: 'sender@example.test' }, to: 'recipient@example.test', subject: 'Synthetic',
  })).toMatchObject({ success: false, state: 'rejected' })
  expect(hook.attempts).toEqual([])
})
