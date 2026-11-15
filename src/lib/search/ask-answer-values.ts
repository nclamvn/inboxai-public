import { z } from 'zod'
import type { AnswerValue } from './ask-answer-contracts'

const isoDate = z.iso.date()
const months = 'january february march april may june july august september october november december'.split(' ')

function calendar(year: string, month: string, day: string): AnswerValue | null {
  const iso = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0')
  return isoDate.safeParse(iso).success ? { kind: 'date', iso } : null
}

export function readAnswerDate(text: string, language: 'vi' | 'en'): AnswerValue | null {
  const value = text.trim()
  if (isoDate.safeParse(value).success) return { kind: 'date', iso: value }
  if (language === 'en') {
    const named = /^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/iu.exec(value)
    const reversed = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/iu.exec(value)
    if (named || reversed) {
      const month = months.indexOf((named?.[1] ?? reversed![2]).toLowerCase()) + 1
      return calendar((named ?? reversed!)[3], String(month), named?.[2] ?? reversed![1])
    }
  }
  const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(value) ??
    /^(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})$/iu.exec(value)
  if (!date) return null
  // In English an all-numeric date with two plausible readings is ambiguous.
  if (language === 'en' && Number(date[1]) <= 12) {
    if (Number(date[2]) > 12) return calendar(date[3], date[1], date[2])
    if (Number(date[1]) !== Number(date[2])) return null
  }
  return calendar(date[3], date[2], date[1])
}

function wholeDigits(text: string) {
  if (/^\d{1,15}$/u.test(text)) return text
  const grouped = /^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/u.exec(text)
  if (!grouped) return null
  const digits = text.replaceAll(grouped[1], '')
  return digits.length <= 15 ? digits : null
}

export function readAnswerMoney(text: string): AnswerValue | null {
  const value = text.trim().replace(/[\u00a0\u202f]/gu, ' ')
  const before = /^(VND|VNĐ|USD|EUR|₫|€)\s*([0-9][0-9., ]*)$/iu.exec(value)
  const after = /^([0-9][0-9., ]*)\s*(VND|VNĐ|USD|EUR|₫|€|đồng|đ)$/iu.exec(value)
  if (!before && !after) return null
  const unit = (before?.[1] ?? after![2]).toUpperCase()
  const amount = (before?.[2] ?? after![1]).trim()
  const currency = unit === 'USD' ? 'USD' : unit === 'EUR' || unit === '€' ? 'EUR' : 'VND'
  const grouped = wholeDigits(amount)
  if (grouped !== null) {
    return { kind: 'money', currency, minor: BigInt(grouped + (currency === 'VND' ? '' : '00')).toString() }
  }
  if (currency === 'VND') return null
  const decimal = /^(.+)([.,])(\d{1,2})$/u.exec(amount)
  if (!decimal || decimal[1].includes(decimal[2])) return null
  const whole = wholeDigits(decimal[1])
  return whole === null ? null : { kind: 'money', currency, minor: BigInt(whole + decimal[3].padEnd(2, '0')).toString() }
}
