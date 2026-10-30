import type { AppSettings } from '@/hooks/useAppSettings'
import { formatDecimal } from '@/lib/formatters'

/** The rules an admin can change, as the Settings page lays them out. Percent fields are shown as percent and stored as a fraction. */
export type Field = {
  key: string
  label: string
  hint: string
  percent?: boolean
  /** what the current value works out to on $100, shown under the field */
  example?: (shown: number) => string
}

export const TIER_COUNT = 5
const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th']

export const GROUPS: { title: string; blurb: string; fields: Field[] }[] = [
  {
    title: 'Returns',
    blurb: 'Paid on all principal from the next payout. There is no cap.',
    fields: [
      {
        key: 'daily_rate',
        label: 'Daily return',
        hint: 'Paid on all principal from the next payout. No cap.',
        percent: true,
        example: (n) => `$${formatDecimal(n)} a day on $100`,
      },
    ],
  },
  {
    // Tier 1 is the direct sponsor, tier N pays the N-th sponsor up the chain
    title: 'Referrals',
    blurb: 'What a deposit pays up the sponsor chain, as a share of the deposit.',
    fields: Array.from({ length: TIER_COUNT }, (_, i) => ({
      key: `level_${i + 1}`,
      label: i === 0 ? 'Direct sponsor' : `Tier ${i + 1}`,
      hint: i === 0 ? 'Paid at once, on a deposit' : `Paid to the ${ORDINAL[i + 1]} sponsor up the chain`,
      percent: true,
      example: (n: number) => `$${formatDecimal(n)} per $100 deposited`,
    })),
  },
  {
    title: 'Limits',
    blurb: 'The amounts the platform accepts, in USDT.',
    fields: [
      { key: 'min_deposit_usdt', label: 'Minimum deposit', hint: 'The smallest single deposit' },
      { key: 'max_deposit_usdt', label: 'Maximum deposit', hint: 'The largest single deposit' },
      { key: 'min_withdraw_usdt', label: 'Minimum withdrawal', hint: 'The smallest withdrawal request' },
      { key: 'min_reinvest_usdt', label: 'Minimum reinvest', hint: 'The smallest amount of earnings that can be reinvested' },
    ],
  },
]
export const ALL_FIELDS = GROUPS.flatMap((g) => g.fields)

export const toDisplay = (f: Field, v: number) => String(f.percent ? Number((v * 100).toPrecision(12)) : v)
export const fromDisplay = (f: Field, s: string) => (f.percent ? Number((Number(s) / 100).toPrecision(12)) : Number(s))
export const readValue = (f: Field, s: AppSettings): number =>
  f.key.startsWith('level_')
    ? (s.referral_levels.find((l) => l.level === Number(f.key.slice(6)))?.percentage ?? 0)
    : (s[f.key as keyof AppSettings] as number)

/** A value the way it reads in a sentence: "0.2%" or "30 USDT" */
export const show = (f: Field, shown: string | number) => (f.percent ? `${shown}%` : `${shown} USDT`)

const SWITCH_LABEL: Record<string, string> = {
  deposits_enabled: 'Deposits',
  withdrawals_enabled: 'Withdrawals',
  reinvest_enabled: 'Reinvesting',
  maintenance_mode: 'Maintenance mode',
}

/** The name of a setting from the audit trail's key (`daily_rate`, `referral_level_2`, ...) */
export const keyLabel = (key: string) =>
  SWITCH_LABEL[key] ??
  (key.startsWith('referral_level_')
    ? key === 'referral_level_1'
      ? 'Direct sponsor'
      : `Tier ${key.slice(15)}`
    : (ALL_FIELDS.find((f) => f.key === key)?.label ?? key))

/** An audit value: rates and tiers are fractions, the rest are USDT */
export const auditValue = (key: string, v: number | string | boolean) => {
  if (typeof v === 'boolean') return key === 'maintenance_mode' ? (v ? 'On' : 'Off') : v ? 'On' : 'Paused'
  const n = Number(v)
  if (key === 'daily_rate' || key.startsWith('referral_level_')) return `${Number((n * 100).toPrecision(12))}%`
  return `${formatDecimal(n)} USDT`
}
