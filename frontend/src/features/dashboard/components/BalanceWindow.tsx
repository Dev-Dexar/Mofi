import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CenterWindow from '@/components/ui/CenterWindow'
import type { WalletData } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { money, num } from '../utils'

const R = 42
const C = 2 * Math.PI * R

/**
 * Opened from the big number: where the balance is, as shares of one ring (locked principal, daily returns, referral bonus), what can
 * be taken out right now, and the lifetime totals underneath.
 */
export default function BalanceWindow({ wallet, onClosed }: { wallet: WalletData; onClosed: () => void }) {
  const parts = [
    { label: 'Locked principal', value: num(wallet.deposit_balance), color: '#64748b' },
    { label: 'Daily returns', value: num(wallet.returns_balance), color: '#10b981' },
    { label: 'Referral bonus', value: num(wallet.referral_balance), color: '#c084fc' },
  ]
  const total = parts.reduce((s, p) => s + p.value, 0)
  const available = num(wallet.usdt_balance)
  // the total sits inside the ring (7rem across on a phone, 11rem from 640px up), so a long figure steps down in size to stay inside it
  const totalText = money(total)
  const totalSize =
    totalText.length <= 9
      ? 'text-base sm:text-xl'
      : totalText.length <= 11
        ? 'text-sm sm:text-lg'
        : totalText.length <= 13
          ? 'text-xs sm:text-[16px]'
          : 'text-[11px] sm:text-sm'

  // each share is an arc of the ring, with a small gap between neighbours (square ends, so an arc is exactly as long as its share)
  const GAP = 1
  let offset = 0
  const arcs = parts.map((p) => {
    const share = total > 0 ? p.value / total : 0
    const len = share > 0 ? Math.max(share * C - (share < 1 ? GAP : 0), 0.5) : 0
    const arc = { ...p, share, len, offset: offset + (share < 1 ? GAP / 2 : 0) }
    offset += share * C
    return arc
  })

  // the arcs fill in one after another when the window opens
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setFilled(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <CenterWindow title="Your balance" onClosed={onClosed} width="narrow">
      {(close) => (
        <div>
          <div className="flex items-center justify-center gap-5 sm:gap-10">
          <div className="relative size-28 shrink-0 sm:size-44">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-ink)" strokeOpacity="0.06" strokeWidth="5" />
              {arcs.map((a, i) =>
                a.len > 0 ? (
                  <circle
                    key={a.label}
                    cx="50"
                    cy="50"
                    r={R}
                    fill="none"
                    stroke={a.color}
                    strokeWidth="5"
                    strokeDasharray={`${filled ? a.len : 0} ${C}`}
                    strokeDashoffset={-a.offset}
                    className="motion-reduce:transition-none"
                    style={{ transition: `stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1) ${200 + i * 180}ms` }}
                  />
                ) : null,
              )}
            </svg>
            <div className="absolute inset-0 grid place-content-center px-5 text-center sm:px-9">
              <p className="text-[11px] text-muted">Total</p>
              <p className={`mt-0.5 font-black tabular-nums text-text ${totalSize}`}>{totalText}</p>
            </div>
          </div>

          <ul className="min-w-0 space-y-3 sm:space-y-4">
            {arcs.map((a) => (
              <li key={a.label}>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden="true" />
                  {a.label}
                </p>
                <p className="mt-0.5 flex items-baseline gap-1.5 pl-4">
                  <span className="text-[16px] font-bold tabular-nums text-text">{money(a.value)}</span>
                  <span className="text-[11px] tabular-nums text-muted/70">{formatDecimal(a.share * 100, 0)}%</span>
                </p>
              </li>
            ))}
          </ul>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 border-t border-ink/[0.06] pt-4 sm:mt-7 sm:pt-5">
            <div className="min-w-0">
              <p className="text-xs text-muted">Available to withdraw</p>
              <p className="mt-1 text-2xl font-black leading-none tabular-nums text-primary">{money(available)}</p>
            </div>
            <Link
              to="/wallet?tab=withdraw"
              onClick={close}
              className="inline-flex h-10 shrink-0 items-center rounded-full bg-ink/[0.08] px-5 text-sm font-bold text-text transition-[background-color,scale] hover:bg-ink/15 active:scale-95"
            >
              Withdraw
            </Link>
          </div>
        </div>
      )}
    </CenterWindow>
  )
}
