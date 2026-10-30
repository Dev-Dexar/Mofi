import { formatDecimal } from '@/lib/formatters'
import { dateOf } from '@/features/transactions/txConfig'

export const ACTIVITY_ROWS = 5
const DAY = 864e5

export const num = (v: string | null | undefined) => parseFloat(v || '0') || 0
export const money = (v: number | string) => `$${formatDecimal(v)}`

/** "Today" and "Yesterday" read faster than a date for the newest rows */
export function dayOf(iso: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - new Date(iso).setHours(0, 0, 0, 0)) / DAY)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : dateOf(iso)
}

/**
 * The year ahead, two ways, sampled once a month: taking every payout out (the principal stays the same, so the total grows in a
 * straight line) or putting every payout back in (the principal grows with it, so each day pays a little more than the last).
 * An estimate at today's rate: the reinvest minimum means real reinvesting comes in steps, and referral earnings are left out.
 */
export function yearAhead(principal: number, rate: number) {
  const months = Array.from({ length: 13 }, (_, m) => Math.round((m * 365) / 12))
  return months.map((d) => ({ day: d, withdraw: principal * rate * d, reinvest: principal * ((1 + rate) ** d - 1) }))
}
