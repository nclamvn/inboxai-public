import { Resolver } from 'node:dns/promises'
import { expect, it, vi } from 'vitest'
import { MailDestinationError, resolveMailDestination } from '@/lib/email/mail-destination'

const smtp = { host: 'smtp.example.test', port: 587, secure: false }
const noData = Object.assign(new Error(), { code: 'ENODATA' })

it.each([
  '0.0.0.0', '10.1.2.3', '100.100.100.200', '127.0.0.1', '169.254.169.254', '172.31.0.9',
  '192.168.2.8', '198.18.1.1', '224.1.1.1', '255.255.255.255', '168.63.129.16',
  '::', '::1', '::ffff:127.0.0.1', '0:0:0:0:0:ffff:a00:1', '64:ff9b::a00:1', 'fd00:ec2::254',
  'fe80::1%en0', 'ff02::1', '2002:7f00:1::', '2001:db8::1', 'localhost.', 'router.local',
  '127.1', '0177.0.0.1', '2130706433', '0x7f000001', '127.0.0.1.', '[::1]',
  'smtp.example.test:587', 'smtp.example.test/path', 'smtp.example.test\0',
])('rejects unsafe or ambiguous host %s before DNS', async host => {
  const a = vi.spyOn(Resolver.prototype, 'resolve4').mockResolvedValue([])
  const aaaa = vi.spyOn(Resolver.prototype, 'resolve6').mockResolvedValue([])
  await expect(resolveMailDestination('smtp', { ...smtp, host })).rejects.toBeInstanceOf(MailDestinationError)
  expect(a).not.toHaveBeenCalled()
  expect(aaaa).not.toHaveBeenCalled()
})

it.each([25, 22, 80, 465, 993, 65536, 0, 587.1, '587'])('rejects SMTP STARTTLS port %s before DNS', async port => {
  const a = vi.spyOn(Resolver.prototype, 'resolve4').mockResolvedValue([])
  const aaaa = vi.spyOn(Resolver.prototype, 'resolve6').mockResolvedValue([])
  await expect(resolveMailDestination('smtp', { ...smtp, port: port as number })).rejects.toBeInstanceOf(MailDestinationError)
  expect(a).not.toHaveBeenCalled()
  expect(aaaa).not.toHaveBeenCalled()
})

it('normalizes the hostname, checks both address families and pins a numeric IP', async () => {
  const a = vi.spyOn(Resolver.prototype, 'resolve4').mockResolvedValue(['93.184.216.34'])
  const aaaa = vi.spyOn(Resolver.prototype, 'resolve6').mockResolvedValue(['2606:4700::1'])
  await expect(resolveMailDestination('smtp', { ...smtp, host: 'SMTP.Example.Test.' })).resolves.toMatchObject({
    host: '93.184.216.34', servername: smtp.host, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  })
  expect(a).toHaveBeenCalledExactlyOnceWith(smtp.host)
  expect(aaaa).toHaveBeenCalledExactlyOnceWith(smtp.host)
})

it.each([['10.0.0.1'], ['::ffff:7f00:1'], ['fd00::1'], ['169.254.169.254']])('rejects the whole mixed answer containing %s', async address => {
  vi.spyOn(Resolver.prototype, 'resolve4').mockResolvedValue(['93.184.216.34', ...(address.includes(':') ? [] : [address])])
  vi.spyOn(Resolver.prototype, 'resolve6').mockResolvedValue(address.includes(':') ? ['2606:4700::1', address] : ['2606:4700::1'])
  await expect(resolveMailDestination('smtp', smtp)).rejects.toBeInstanceOf(MailDestinationError)
})

it('supports a single family with no records for the other, but fails closed on DNS errors', async () => {
  const a = vi.spyOn(Resolver.prototype, 'resolve4').mockRejectedValue(noData)
  const aaaa = vi.spyOn(Resolver.prototype, 'resolve6').mockResolvedValue(['2606:4700::1'])
  await expect(resolveMailDestination('smtp', smtp)).resolves.toMatchObject({ host: '2606:4700::1' })
  a.mockRejectedValue(Object.assign(new Error('synthetic detail'), { code: 'ETIMEOUT' }))
  await expect(resolveMailDestination('smtp', smtp)).rejects.toThrow(/^Mail destination unavailable or disallowed$/)
  a.mockRejectedValue(noData)
  aaaa.mockRejectedValue(noData)
  await expect(resolveMailDestination('smtp', smtp)).rejects.toBeInstanceOf(MailDestinationError)
})

it('fails closed if canceled during resolution', async () => {
  const abort = new AbortController()
  vi.spyOn(Resolver.prototype, 'resolve4').mockImplementation(async () => {
    abort.abort()
    return ['93.184.216.34']
  })
  vi.spyOn(Resolver.prototype, 'resolve6').mockRejectedValue(noData)
  await expect(resolveMailDestination('smtp', smtp, abort.signal)).rejects.toBeInstanceOf(MailDestinationError)
})
