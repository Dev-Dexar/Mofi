import { useEffect, useState } from 'react'
import { LockIcon } from '@/icons'
import { api } from '@/lib/api'
import { isPausedError, pausedMessage, pct, refreshSettings, type AppSettings } from '@/hooks/useAppSettings'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/context/ToastContext'
import { primaryBtn, secondaryBtn } from '../styles'
import { money } from '../utils'

const floorCents = (v: number) => String(Math.floor(v * 100) / 100)

/** Moves withdrawable earnings into locked principal, where they earn like a new deposit. Opens with everything filled in. */
export default function ReinvestEarningsModal({
  open,
  available,
  perDay,
  cfg,
  initial,
  onClose,
  onDone,
}: {
  open: boolean
  available: number
  perDay: number
  cfg: AppSettings
  /** what to start from (the amount typed on the withdraw form); all of it when left out */
  initial?: number
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  // each time it opens, it starts from what was asked for, or all of it
  useEffect(() => {
    if (open) setAmount(floorCents(Math.min(initial ?? available, available)))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = parseFloat(amount)
  const paused = pausedMessage(cfg, 'reinvest')
  const valid = !paused && Number.isFinite(value) && value >= cfg.min_reinvest_usdt && value <= available + 1e-9

  const confirm = async () => {
    if (!valid) return
    try {
      setBusy(true)
      // the very top of the range goes as "everything", so no fraction of a cent is left behind
      const all = Math.abs(value - available) < 0.01
      await api.reinvestEarnings(all ? {} : { amount: value })
      toast.success('Reinvested. It earns from the next payout.')
      onClose()
      onDone()
    } catch (err: any) {
      if (isPausedError(err.code)) void refreshSettings()
      toast.error(err.message || 'Reinvestment failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={open} onClose={() => !busy && onClose()} title="Reinvest your earnings">
      <div className="space-y-5">
        <p className="text-sm text-muted">
          Move what you have earned into your locked principal. It earns {pct(cfg.daily_rate)} a day from the next payout, for as long as it&apos;s here, like a new deposit.
        </p>

        <div>
          <div className="flex items-center justify-between text-xs text-muted">
            <label htmlFor="reinvest-amount">Amount (USDT)</label>
            <span>
              Available <span className="tabular-nums text-text">{money(available)}</span>
            </span>
          </div>
          <div className="mt-2 flex h-12 items-center gap-2 rounded-2xl border border-ink/10 bg-base pl-4 pr-2 focus-within:border-ink/25">
            <span className="text-muted">$</span>
            <input
              id="reinvest-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              className="min-w-0 flex-1 bg-transparent text-lg font-semibold tabular-nums text-text outline-none"
            />
            <button
              type="button"
              onClick={() => setAmount(floorCents(available))}
              className="h-8 rounded-full bg-ink/5 px-3 text-xs font-semibold text-text transition hover:bg-ink/10"
            >
              Max
            </button>
          </div>
          {amount && !valid && (
            <p className="mt-2 text-xs text-rose-400">
              {value > available ? 'That is more than you have available.' : `The minimum is ${money(cfg.min_reinvest_usdt)}.`}
            </p>
          )}
        </div>

        <dl className="divide-y divide-ink/5 rounded-2xl border border-ink/5 bg-base px-5 text-sm">
          {[
            ['Your daily income', `+${money(perDay)} → +${money(perDay + (valid ? value * cfg.daily_rate : 0))}`],
            ['That adds', `+${money(valid ? value * cfg.daily_rate * 30 : 0)} a month, every month`],
            ['Left to withdraw', money(Math.max(0, available - (valid ? value : 0)))],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-3">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-semibold tabular-nums text-text">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="flex gap-2 text-xs text-muted">
          <LockIcon className="mt-px size-3.5 shrink-0" />
          Principal is locked for good. Once reinvested, this money can&apos;t be withdrawn, only what it earns can.
        </p>

        <div className="flex gap-3">
          <button onClick={onClose} disabled={busy} className={`${secondaryBtn} flex-1 disabled:opacity-50`}>
            Cancel
          </button>
          <button onClick={confirm} disabled={busy || !valid} className={`${primaryBtn} flex-1 disabled:opacity-50`}>
            {busy ? 'Reinvesting…' : 'Reinvest and lock'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
