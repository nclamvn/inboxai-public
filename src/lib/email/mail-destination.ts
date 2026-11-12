import 'server-only'
import { Resolver } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { checkServerIdentity, type ConnectionOptions } from 'node:tls'
import { domainToASCII } from 'node:url'

export type MailEndpoint = { host: string; port: number; secure: boolean }
export type MailCredentials = MailEndpoint & { username: string; password: string }

const ports = {
  imap: { implicit: [993], starttls: [143] },
  smtp: { implicit: [465], starttls: [587, 2525] },
}

const excluded = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3], ['168.63.129.16', 32], // Azure WireServer
] as const) excluded.addSubnet(address, prefix)
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) {
  excluded.addSubnet(address, prefix, 'ipv6')
}
const globalIpv6 = new BlockList()
globalIpv6.addSubnet('2000::', 3, 'ipv6')

export class MailDestinationError extends Error {
  constructor() { super('Mail destination unavailable or disallowed') }
}

function publicAddress(address: string) {
  if (address.includes('%')) return false
  const family = isIP(address)
  if (family === 4) return !excluded.check(address, 'ipv4')
  // Limit IPv6 to global unicast. This also rejects mapped IPv4 and NAT64 prefixes.
  return family === 6 && globalIpv6.check(address, 'ipv6') && !excluded.check(address, 'ipv6')
}

function normalizeHost(host: string) {
  if (typeof host !== 'string' || !host || /[%\s\p{Cc}]/u.test(host)) throw new MailDestinationError()
  if (isIP(host)) return host
  if (/[\\/:@#?\[\]]/.test(host)) throw new MailDestinationError()
  const ascii = domainToASCII(host).replace(/\.$/, '').toLowerCase()
  if (ascii.length > 253 || !ascii.includes('.') || isIP(ascii) ||
    !ascii.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    /(?:^|\.)(?:localhost|local|internal|home\.arpa|onion)$/.test(ascii)) throw new MailDestinationError()
  return ascii
}

async function noDataIsEmpty(result: Promise<string[]>) {
  try { return await result } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENODATA') return []
    throw new MailDestinationError()
  }
}

async function resolveAddresses(host: string, signal: AbortSignal) {
  const resolver = new Resolver({ timeout: 2_000, tries: 1 })
  const cancel = () => resolver.cancel()
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const [ipv4, ipv6] = await Promise.all([
      noDataIsEmpty(resolver.resolve4(host)), noDataIsEmpty(resolver.resolve6(host)),
    ])
    return [...ipv4, ...ipv6]
  } finally {
    signal.removeEventListener('abort', cancel)
    cancel()
  }
}

export async function resolveMailDestination(protocol: keyof typeof ports, endpoint: MailEndpoint,
  signal = AbortSignal.timeout(5_000)) {
  if (signal.aborted || typeof endpoint.secure !== 'boolean' ||
    !ports[protocol][endpoint.secure ? 'implicit' : 'starttls'].includes(endpoint.port)) throw new MailDestinationError()
  const hostname = normalizeHost(endpoint.host)
  const literal = isIP(hostname) !== 0
  const addresses = literal ? [hostname] : await resolveAddresses(hostname, signal)
  if (signal.aborted || !addresses.length || !addresses.every(publicAddress)) throw new MailDestinationError()

  // Dial the validated IP. TLS independently authenticates the configured hostname.
  const tls: ConnectionOptions = {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    checkServerIdentity: (_, certificate) => checkServerIdentity(hostname, certificate),
  }
  return { host: addresses[0], port: endpoint.port, secure: endpoint.secure,
    servername: literal ? undefined : hostname, tls }
}
