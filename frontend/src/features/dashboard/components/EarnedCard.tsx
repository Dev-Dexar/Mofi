import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartIcon } from '@/icons'
import type { WalletData } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { useCountUp } from '@/hooks/useCountUp'
import { pct } from '@/hooks/useAppSettings'
import { Tile } from '@/components/ui/SettingsUI'
import BalanceWindow from './BalanceWindow'
import EarningsChart, { EarningsChartSkeleton } from '@/components/charts/EarningsChart'
import { panel } from '../styles'
import { money, num } from '../utils'

const smallBtn = 'inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-bold transition-[background-color,opacity,scale] active:scale-95'

/**
 * What the money has earned: the total, what it pays a day, and the last six months as a line. The balance breakdown is
 * a window that opens from the big number, and the two ways money moves are in the corner, where they are always one tap away.
 */
export default function EarnedCard({
  wallet,
  perDay,
  rate,
  monthly,
  shownValue,
}: {
  wallet: WalletData
  perDay: number
  rate: number
  monthly: { month: string; amount: string }[] | null
  /** the landing page's demo counts the figure itself */
  shownValue?: number
}) {
  const [open, setOpen] = useState(false)
  const earned = num(wallet.total_earned)
  const principal = num(wallet.deposit_balance)
  const counted = useCountUp(earned)
  const shown = shownValue ?? counted
  const [dollars, cents] = formatDecimal(shown).split('.')

  return (
    <section className={`${panel} min-w-0 self-start p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Tile icon={ChartIcon} tone="green" />
          <p className="truncate text-sm font-semibold text-text">Earned so far</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/wallet?tab=withdraw" className={`${smallBtn} bg-ink/[0.06] text-text hover:bg-ink/10`}>
            Withdraw
          </Link>
          <Link to="/wallet" className={`${smallBtn} bg-primary text-[color:var(--color-base)] hover:opacity-90`}>
            Deposit
          </Link>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open your balance breakdown"
          className="rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span className="text-4xl font-black leading-none tracking-tight text-text tabular-nums sm:text-5xl">
            <span className="mr-1 align-top text-xl font-bold text-muted sm:text-2xl">$</span>
            {dollars}
            <span className="text-muted">.{cents}</span>
          </span>
        </button>
        {principal > 0 && <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold tabular-nums text-primary">+{money(perDay)} a day</span>}
      </div>
      <p className="mt-2 text-sm text-muted">
        {principal > 0 ? (
          <>
            Your <span className="tabular-nums text-text">{money(principal)}</span> earns {pct(rate)} a day, for as long as it&apos;s here
          </>
        ) : (
          'Your first deposit starts this'
        )}
      </p>

      <div className="mt-4 h-36">{monthly ? <EarningsChart monthly={monthly} label="Earnings over the last six months" /> : <EarningsChartSkeleton />}</div>

      {open && <BalanceWindow wallet={wallet} onClosed={() => setOpen(false)} />}
    </section>
  )
}
