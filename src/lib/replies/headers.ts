import { z } from 'zod'

export function replyHeaders(replyTo?: string, parent?: string, references?: string | string[]) {
  const referenceText = Array.isArray(references) ? references.join(' ') : references ?? ''
  const ids = (text: string) => [...text.slice(0, 32_000).matchAll(/<[^<>\s@]+@[^<>\s@]+>/g)]
    .map(match => match[0]).filter(id => id.length <= 998)
  const address = replyTo?.trim().match(/^[^<>]*<([^<>]+)>$/)?.[1] ?? replyTo?.trim()
  return {
    reply_to: address && address.length <= 254 && z.email().safeParse(address).success ? address : null,
    in_reply_to: ids(parent ?? '')[0] ?? null,
    reply_references: [...new Set(ids(referenceText))].slice(-32),
  }
}
