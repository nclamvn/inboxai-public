export type ComposeRecipient = { address: string; name: string | null }

export const recipientQueryLimit = 100

export function foldRecipient(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('đ', 'd').trim()
}

export function recipientFragment(value: string, cursor: number) {
  const start = cursor === 0 ? 0 : value.lastIndexOf(',', cursor - 1) + 1
  const comma = value.indexOf(',', cursor)
  const end = comma < 0 ? value.length : comma
  return { start, end, query: value.slice(start, end).trim() }
}
