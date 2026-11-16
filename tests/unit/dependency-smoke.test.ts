import { expect, it, vi } from 'vitest'
import nodemailer from 'nodemailer'
import sharp from 'sharp'

import { sendEmailViaSMTP } from '@/lib/email/smtp-client'

it('upgraded Nodemailer composes with the actual adapter without network delivery', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const sendMail = vi.spyOn(transport, 'sendMail')
  vi.spyOn(nodemailer, 'createTransport').mockReturnValue(transport)
  const result = await sendEmailViaSMTP({ host: '93.184.216.34', port: 587, secure: false, username: 'synthetic', password: 'synthetic' }, {
    from: { name: 'Nhóm thử nghiệm', address: 'sender@example.test' },
    to: ['recipient@example.test'], subject: 'Cam kết giao hàng', text: 'Nội dung giả lập',
  })
  expect(result.success).toBe(true)
  expect(result.messageId).toBeTruthy()
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Cam kết giao hàng', to: 'recipient@example.test' }))
})

it('upgraded Sharp encodes/decodes a synthetic image in memory', async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#174A72' } }).png().toBuffer()
  const metadata = await sharp(png).metadata()
  expect(metadata.width).toBe(4)
  expect(metadata.height).toBe(4)
  expect(metadata.format).toBe('png')
})

it('the scoped minimatch security override preserves the parser project allowlist API', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const parserRequire = createRequire(require.resolve('@typescript-eslint/typescript-estree'))
  const { minimatch } = parserRequire('minimatch') as { minimatch: (file: string, pattern: string, options: { dot: boolean }) => boolean }
  expect(minimatch('config.ts','*.ts',{ dot:true })).toBe(true)
  expect(minimatch('.config.ts','*.ts',{ dot:true })).toBe(true)
  expect(minimatch('config.js','*.ts',{ dot:true })).toBe(false)
  expect(minimatch('nested/config.ts','*.ts',{ dot:true })).toBe(false)
})
