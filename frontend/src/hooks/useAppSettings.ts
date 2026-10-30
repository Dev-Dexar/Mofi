import { API_BASE_URL } from '@/config/env'
import { useEffect, useState } from 'react'

export interface AppSettings {
  min_deposit_usdt: number
  max_deposit_usdt: number
  min_withdraw_usdt: number
  min_reinvest_usdt: number
  // the admin's switches: a paused feature is closed to every account at once
  deposits_enabled: boolean
  withdrawals_enabled: boolean
  reinvest_enabled: boolean
  maintenance_mode: boolean
  daily_rate: number // fraction per day, 0.002 = 0.20%: paid on all principal, for as long as it is held (no cap)
  direct_bonus_pct: number // tier 1 of referral_levels (derived by the API), 0.1 = 10%
  referral_levels: ReferralLevel[] // admin-controlled tiers: 1 = direct sponsor, N = N-th sponsor up the chain
}

export interface ReferralLevel {
  level: number
  percentage: number // fraction of the deposit
}

// Shown until the server answers (and if it is unreachable)
const DEFAULT_SETTINGS: AppSettings = {
  min_deposit_usdt: 30,
  max_deposit_usdt: 100000,
  min_withdraw_usdt: 30,
  min_reinvest_usdt: 1,
  deposits_enabled: true,
  withdrawals_enabled: true,
  reinvest_enabled: true,
  maintenance_mode: false,
  daily_rate: 0.002,
  direct_bonus_pct: 0.1,
  referral_levels: [
    { level: 1, percentage: 0.1 },
    { level: 2, percentage: 0.02 },
    { level: 3, percentage: 0.004 },
    { level: 4, percentage: 0.0008 },
    { level: 5, percentage: 0.00016 },
  ],
}


// One copy shared by every component on the page. While any component is showing it (and the tab is visible) it is asked for again every
// few seconds and whenever the tab is looked at again, so a switch an admin flips (deposits, withdrawals, reinvesting, maintenance)
// reaches an open page within moments.
//
// The values are never guessed on screen. The last answer is kept in this browser, so a returning visitor sees the real figures on the first
// paint (and they are refreshed quietly behind it). A first-ever visit has nothing to show yet, so `ready` is false until the server has
// answered (or has been given a fair try), and the page shows placeholders for those figures instead of the fallbacks above.
const POLL_MS = 5_000
const STORE = 'mofi_settings_v1'

function remembered(): AppSettings | null {
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) } : null
  } catch {
    return null
  }
}

const saved = typeof window !== 'undefined' ? remembered() : null
let current: AppSettings = saved ?? DEFAULT_SETTINGS
let ready = !!saved
let inflight: Promise<AppSettings> | null = null
let misses = 0
const listeners = new Set<() => void>()
let timer: number | undefined

const sameSettings = (a: AppSettings, b: AppSettings) => JSON.stringify(a) === JSON.stringify(b)
const notify = () => listeners.forEach((fn) => fn())

/** Asks the server now. Resolves with the latest settings (the last known ones if it cannot be reached). */
export function refreshSettings(): Promise<AppSettings> {
  inflight ??= fetch(`${API_BASE_URL}/settings`, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok) throw new Error(`settings ${r.status}`)
      return r.json() as Promise<AppSettings>
    })
    .then((s) => {
      const next = { ...DEFAULT_SETTINGS, ...s }
      misses = 0
      const changed = !sameSettings(next, current) || !ready
      current = next
      ready = true
      try {
        localStorage.setItem(STORE, JSON.stringify(next))
      } catch {
        /* private mode: it is just not remembered */
      }
      if (changed) notify()
      return current
    })
    .catch(() => {
      // unreachable: keep what is known; after a few failed tries with nothing known, show the page with the fallbacks rather than
      // placeholders forever
      if (!ready && ++misses >= 3) {
        ready = true
        notify()
      }
      return current
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

const onVisible = () => document.visibilityState === 'visible' && void refreshSettings()

let waiting = false

// asks again every few seconds while something is showing (every 1.5 s until the first answer, so a slow start does not linger)
function schedule() {
  if (timer !== undefined) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    if (document.visibilityState === 'visible') void refreshSettings()
    schedule()
  }, ready ? POLL_MS : 1_500)
}

function startPolling() {
  if (waiting) return
  waiting = true
  schedule()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onVisible)
}

function stopPolling() {
  if (listeners.size > 0 || !waiting) return
  waiting = false
  if (timer !== undefined) window.clearTimeout(timer)
  timer = undefined
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', onVisible)
}

function useStore() {
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump((n) => n + 1)
    listeners.add(fn)
    startPolling()
    void refreshSettings()
    return () => {
      listeners.delete(fn)
      stopPolling()
    }
  }, [])
  return { settings: current, ready }
}

export function useAppSettings(): AppSettings {
  return useStore().settings
}

/** False only on a first-ever visit, until the server has answered: show placeholders for the live figures, not the fallbacks */
export function useSettingsReady(): boolean {
  return useStore().ready
}

// Asked for as soon as this file is loaded, before any component asks, so the answer is usually in by the first paint
if (typeof window !== 'undefined') void refreshSettings()

/** What a paused feature should tell the user, or null when it is open. Maintenance pauses all three. */
export function pausedMessage(s: AppSettings, feature: 'deposit' | 'withdraw' | 'reinvest'): string | null {
  if (s.maintenance_mode) return 'MoFi Life is under maintenance. Deposits, withdrawals and reinvesting are paused for a short while.'
  if (feature === 'deposit' && !s.deposits_enabled) return 'Deposits are paused right now. Please check back soon.'
  if (feature === 'withdraw' && !s.withdrawals_enabled) return 'Withdrawals are paused right now. Your balance is safe. Please check back soon.'
  if (feature === 'reinvest' && !s.reinvest_enabled) return 'Reinvesting is paused right now. Your earnings stay available.'
  return null
}

/** Whether an API error means "this feature is switched off" (so the page should look at the settings again) */
export const isPausedError = (code?: string) => code === 'maintenance' || (!!code && code.endsWith('_paused'))

// Derived figures used across the UI
export const tierRates = (s: AppSettings) => [...s.referral_levels].sort((a, b) => a.level - b.level).map((l) => l.percentage)
export const pct = (fraction: number, digits = 2) => `${parseFloat((fraction * 100).toFixed(digits))}%`
