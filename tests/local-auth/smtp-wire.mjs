import { createServer } from 'node:tls'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/** A disposable implicit-TLS SMTP server. It only accepts synthetic recipients. */
export async function startSmtpWire() {
  const directory = mkdtempSync(join(process.cwd(), '.codex-smtp-test-'))
  const cert = join(directory, 'cert.pem')
  const key = join(directory, 'key.pem')
  const sockets = new Set()
  const state = { mode: 'accepted', messages: [], authenticated: 0 }
  let server
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert], { stdio: 'ignore' })
    server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, socket => {
      sockets.add(socket)
      socket.setEncoding('utf8')
      socket.on('close', () => sockets.delete(socket))
      socket.on('error', () => {})
      let buffer = '', content = null, recipients = [], authenticated = false
      const respond = value => socket.write(value + '\r\n')
      respond('220 local.example.test ESMTP')
      socket.on('data', chunk => {
        buffer += chunk
        let end
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (content !== null) {
            if (line !== '.') {
              content.push(line.startsWith('..') ? line.slice(1) : line)
              continue
            }
            state.messages.push({ raw: content.join('\r\n'), recipients })
            content = null
            if (state.mode === 'lost') return socket.destroy()
            respond('250 2.0.0 Synthetic accepted')
          } else if (line.startsWith('EHLO ')) {
            respond('250-local.example.test\r\n250 AUTH PLAIN')
          } else if (line.startsWith('AUTH PLAIN ')) {
            authenticated = Buffer.from(line.slice(11), 'base64').toString() === '\0smtp-wire@example.test\0synthetic-smtp-wire'
            if (authenticated) state.authenticated++
            respond(authenticated ? '235 2.7.0 Authenticated' : '535 5.7.8 Invalid synthetic credentials')
          } else if (line === 'QUIT') {
            respond('221 Closing')
            socket.end()
          } else if (!authenticated) {
            respond('530 Authentication required')
          } else if (line === 'MAIL FROM:<smtp-wire@example.test>') {
            recipients = []
            respond('250 2.1.0 Sender accepted')
          } else if (line.startsWith('RCPT TO:')) {
            const recipient = /^RCPT TO:<([\w.-]+@example\.test)>$/.exec(line)?.[1]
            if (!recipient || recipient === 'reject@example.test') respond('550 5.1.1 Synthetic rejection')
            else {
              recipients.push(recipient)
              respond('250 2.1.5 Recipient accepted')
            }
          } else if (line === 'DATA' && recipients.length) {
            content = []
            respond('354 End with a dot')
          } else {
            respond('503 Bad command sequence')
          }
        }
      })
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    return {
      state, cert, port: server.address().port,
      async close() {
        for (const socket of sockets) socket.destroy()
        await new Promise(resolve => server.close(resolve))
        rmSync(directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    if (server?.listening) server.close()
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}
