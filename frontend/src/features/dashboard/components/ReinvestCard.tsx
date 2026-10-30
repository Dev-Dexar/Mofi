import { useState } from 'react'
import { ArrowRight, Power } from 'lucide-react'
import { ReinvestIcon } from '@/icons'
import { api } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { pausedMessage, type AppSettings } from '@/hooks/useAppSettings'
import { useToast } from '@/context/ToastContext'
import CenterWindow from '@/components/ui/CenterWindow'
import { Tile } from '@/components/ui/SettingsUI'
import { panel } from '../styles'
import { money } from '../utils'

/**
 * Earnings can be put to work. Principal pays for as long as it is held, so reinvesting raises the daily income for good: the card
 * shows the income now and after, what the difference adds up to, and a switch that does it after every payout. Withdrawing stays
 * one quiet link away, never hidden.
 */
export default function ReinvestCard({
  available,
  perDay,
  cfg,
  auto,
  onAutoChange,
  onOpen,
}: {
  available: number
  perDay: number
  cfg: AppSettings
  auto: boolean
  onAutoChange: (auto: boolean) => void
  onOpen: () => void
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState(false)
  const paused = pausedMessage(cfg, 'reinvest')
  const can = available >= cfg.min_reinvest_usdt && !paused
  const more = can ? available * cfg.daily_rate : 0

  const toggleAuto = async (next: boolean) => {
    onAutoChange(next) // the switch moves at once; it moves back if the change does not go through
    setSaving(true)
    try {
      await api.setAutoReinvest(next)
      if (next) toast.success('Auto-reinvest is on. Your earnings join your principal after every payout.', 'reinvest')
      else toast.error('Auto-reinvest is off. Your earnings stay available.', 'reinvest')
    } catch (err: any) {
      onAutoChange(!next)
      toast.error(err.message || 'Could not change auto-reinvest')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`${panel} flex flex-1 flex-col p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Tile icon={ReinvestIcon} tone="amber" size="sm" />
          <p className="truncate text-sm font-semibold text-text">Reinvest earnings</p>
        </div>
        {/* auto-reinvest: a power pill that says which way it is, lit when it is on. Either way it asks first, because it changes where every payout goes. */}
        <button
          type="button"
          onClick={() => setAsking(true)}
          disabled={saving}
          aria-pressed={auto}
          aria-label={auto ? 'Auto-reinvest is on. Turn it off' : 'Auto-reinvest is off. Turn it on'}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-full pl-2 pr-2.5 text-[11px] font-bold transition-[background-color,color,box-shadow,scale] active:scale-95 disabled:opacity-50 ${
            auto ? 'bg-primary/15 text-primary shadow-[0_0_18px_rgba(16,185,129,0.25)]' : 'bg-ink/[0.06] text-muted hover:bg-ink/10 hover:text-text'
          }`}
        >
          <Power className="size-3" strokeWidth={2.75} />
          Auto {auto ? 'on' : 'off'}
        </button>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 py-4 text-center tabular-nums">
        <p className="text-xs text-muted">Daily income</p>
        <p className="flex items-center gap-2 text-sm">
          <span className="text-muted">+{money(perDay)}</span>
          <ArrowRight className="size-3 text-muted/70" aria-hidden="true" />
          <span className="text-lg font-bold leading-none text-accent2">+{money(perDay + more)}</span>
          {can && perDay > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">+{formatDecimal((more / perDay) * 100, 1)}%</span>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={!can}
        className="mt-auto flex h-10 w-full items-center justify-center rounded-full bg-gradient-to-b from-[#e2c050] to-[#c9a232] text-[13px] font-bold text-[color:var(--color-base)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[opacity,scale] hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:from-ink/[0.04] disabled:to-ink/[0.04] disabled:text-muted disabled:shadow-none disabled:active:scale-100"
      >
        {paused ? 'Reinvesting paused' : can ? `Reinvest ${money(available)}` : `Reinvest from ${money(cfg.min_reinvest_usdt)}`}
      </button>

      {asking && (
        <CenterWindow title={auto ? 'Turn off auto-reinvest?' : 'Turn on auto-reinvest?'} onClosed={() => setAsking(false)} width="narrow">
          {(close) => (
            <div>
              <p className="text-sm leading-relaxed text-muted">
                {auto
                  ? 'From the next payout, daily returns go to your available balance again. What was already reinvested stays locked.'
                  : 'Each daily return goes into your locked principal at 00:00 UTC and earns like a deposit.'}
              </p>
              {!auto && (
                <ul className="mt-4 space-y-2 text-xs leading-relaxed text-muted">
                  <li>
                    <span className="text-amber-400">·</span> Reinvested money is locked for good and cannot be withdrawn.
                  </li>
                  <li>
                    <span className="text-muted/60">·</span> Only future returns. Your {money(available)} available now stays put.
                  </li>
                </ul>
              )}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="flex h-11 items-center justify-center rounded-full bg-ink/[0.06] text-sm font-bold text-text transition-[background-color,scale] hover:bg-ink/10 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleAuto(!auto)
                    close()
                  }}
                  className={`flex h-11 items-center justify-center rounded-full text-sm font-bold transition-[opacity,scale] hover:opacity-90 active:scale-95 ${
                    auto ? 'bg-danger text-white' : 'bg-primary text-[color:var(--color-base)]'
                  }`}
                >
                  {auto ? 'Turn off' : 'Turn on'}
                </button>
              </div>
            </div>
          )}
        </CenterWindow>
      )}
    </section>
  )
}
