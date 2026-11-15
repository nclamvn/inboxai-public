import 'server-only'
import { ImapFlow } from 'imapflow'
import { resolveMailDestination, type MailCredentials } from './mail-destination'

export async function connectImap(config: MailCredentials, signal?: AbortSignal) {
  const deadline = AbortSignal.timeout(20_000)
  const attempt = signal ? AbortSignal.any([signal, deadline]) : deadline
  const destination = await resolveMailDestination('imap', config, attempt)
  attempt.throwIfAborted()
  const client = new ImapFlow({
    ...destination,
    doSTARTTLS: !destination.secure,
    auth: { user: config.username, pass: config.password },
    logger: false, emitLogs: false, disableAutoIdle: true,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 10_000,
  })
  client.on('error', () => {}) // Awaited commands handle failure without emitting raw provider diagnostics.
  const abort = () => client.close()
  attempt.addEventListener('abort', abort, { once: true })
  try {
    await client.connect()
    attempt.throwIfAborted()
    return client
  } catch (error) {
    client.close()
    throw error
  } finally {
    attempt.removeEventListener('abort', abort)
  }
}
