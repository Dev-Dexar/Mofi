import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { DepositCurrency } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { isPausedError, pausedMessage, refreshSettings, useAppSettings, useSettingsReady } from '@/hooks/useAppSettings'
import { COINS } from '@/lib/coins'
import CoinPicker from './CoinPicker'
import AmountField from './AmountField'
import PausedNotice from './PausedNotice'

export default function DepositPanel({ onCreated }: { onCreated: (reference: string) => void }) {
  const toast = useToast()
  const cfg = useAppSettings()
  const live = useSettingsReady()
  const paused = live ? pausedMessage(cfg, 'deposit') : null

  const [amount, setAmount] = useState('')
  const [currencies, setCurrencies] = useState<DepositCurrency[] | null>(null)
  const [currency, setCurrency] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .getDepositCurrencies()
      .then((r) => {
        setCurrencies(r.currencies)
      })
      .catch((err) => {
        setCurrencies([])
        toast.error(err.message || 'Could not load payment currencies')
      })
    // load once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // only our five coins, in our order, and only the ones the gateway has switched on
  const available = useMemo(() => COINS.filter((c) => currencies?.some((x) => x.code === c.code)), [currencies])

  const num = parseFloat(amount)

  const amountIssue = !live
    ? 'Loading…'
    : !(num > 0) || num < cfg.min_deposit_usdt ? `Minimum ${cfg.min_deposit_usdt} USDT` : num > cfg.max_deposit_usdt ? `Maximum ${cfg.max_deposit_usdt} USDT` : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (paused) return toast.error(paused)
    if (isNaN(num) || num <= 0) return toast.error('Enter a deposit amount')
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim().replace(/\.$/, ''))) return toast.error('Use at most 2 decimal places')
    if (num < cfg.min_deposit_usdt || num > cfg.max_deposit_usdt)
      return toast.error(`Deposit must be between ${cfg.min_deposit_usdt} and ${cfg.max_deposit_usdt} USDT`)
    if (!currency) return toast.error('Pick how you want to pay')
    try {
      setBusy(true)
      const res = await api.createDeposit({ amount: num, pay_currency: currency })
      onCreated(res.reference)
    } catch (err: any) {
      if (isPausedError(err.code)) void refreshSettings() // the page then shows the pause, not just this message
      toast.error(err.message || 'Failed to start the deposit')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      {/* on a phone they sit in a tinted container of their own; the fields stay at the top, under the tabs (on a phone, with the whole screen to fill), the button at the bottom */}
      <div className="flex-1">
        {paused && <div className="mb-4"><PausedNotice message={paused} /></div>}
        <div className="flex flex-col gap-4 max-sm:rounded-3xl max-sm:bg-ink/[0.04] max-sm:p-4">
        <section>
          {currencies === null ? (
            <div className="h-10 animate-pulse rounded-[1.25rem] bg-ink/5" aria-hidden="true" />
          ) : available.length === 0 ? (
            <p className="text-sm text-muted">Payment methods are unavailable right now. Please try again shortly.</p>
          ) : (
            <CoinPicker coins={available} value={currency} onChange={setCurrency} />
          )}
        </section>

        <AmountField
          id="deposit-amount"
          label="You receive"
          max={cfg.max_deposit_usdt}
          value={amount}
          onChange={setAmount}
        />
        </div>
      </div>

      <div className="pt-1">
        <button
          type="submit"
          disabled={!!paused || busy || !!amountIssue || !currency || !(num > 0)}
          className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-base transition hover:opacity-90 disabled:opacity-50"
        >
          {paused ? 'Deposits paused' : busy ? 'Creating payment…' : (amountIssue ?? 'Continue to payment')}
        </button>
      </div>
    </form>
  )
}
