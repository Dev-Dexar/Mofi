import { useMemo } from 'react'
import type { TransactionItem, WalletData } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { WalletMinusIcon, WalletPlusIcon } from '@/icons'
import EarningsChart, { EarningsChartSkeleton } from '@/components/charts/EarningsChart'

const COPY = {
  deposit: { title: 'Deposits', label: 'Deposits over the last six months', color: '#34d399', sideLabel: 'Locked principal', sideKey: 'deposit_balance' as const },
  withdraw: { title: 'Withdrawals', label: 'Withdrawals over the last six months', color: '#fb7185', sideLabel: 'Available to withdraw', sideKey: 'usdt_balance' as const },
}

/** Completed money moved per month for the last six months, oldest first */
function monthly(items: TransactionItem[]) {
  const now = new Date()
  const keys = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const sums = new Map(keys.map((k) => [k, 0]))
  for (const t of items) {
    if (t.status !== 'completed') continue
    const d = new Date(t.created_at)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (sums.has(k)) sums.set(k, sums.get(k)! + parseFloat(t.amount))
  }
  return keys.map((k) => ({ month: k, amount: String(sums.get(k)) }))
}

/** The right-hand card of the Wallet page: the active flow's last six months as a line, with its totals underneath */
export default function WalletChart({
  kind,
  items,
  wallet,
  loading,
  className = '',
}: {
  className?: string
  kind: 'deposit' | 'withdraw'
  items: TransactionItem[]
  wallet: WalletData | null
  loading: boolean
}) {
  const c = COPY[kind]
  const Icon = kind === 'deposit' ? WalletPlusIcon : WalletMinusIcon
  const data = useMemo(() => monthly(items), [items])
  const total = data.reduce((a, m) => a + parseFloat(m.amount), 0)
  const thisMonth = parseFloat(data[data.length - 1].amount)
  const lifetime = kind === 'deposit' ? wallet?.total_deposited : wallet?.total_withdrawn

  return (
    <section className={`flex min-w-0 flex-col rounded-3xl border border-ink/10 bg-surface p-4 sm:p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          <span style={{ color: c.color }} aria-hidden="true">
            <Icon className="size-[18px]" />
          </span>
          {c.title}
        </p>
        <span className="text-xs text-muted">Last 6 months</span>
      </div>

      <div className="mt-4 flex min-h-9 flex-wrap items-end justify-between gap-x-4 gap-y-2 sm:min-h-12">
        {loading ? (
          <div className="sk h-10 w-44" />
        ) : (
          <p className="sk-fade text-4xl font-black leading-none tracking-tight text-text tabular-nums sm:text-5xl">
            <span className="mr-1.5 align-top text-xl font-bold text-muted sm:text-2xl">$</span>
            {formatDecimal(total)}
          </p>
        )}
        {!loading && (
          <span className="sk-fade rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-bold tabular-nums text-text">
            ${formatDecimal(thisMonth)} this month
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-col pb-5">
        {loading ? <EarningsChartSkeleton /> : <EarningsChart key={kind} monthly={data} label={c.label} color={c.color} />}
      </div>

      <div className="mt-auto grid grid-cols-2 divide-x divide-ink/[0.06] border-t border-ink/[0.06] pt-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{kind === 'deposit' ? 'Total deposited' : 'Total withdrawn'}</p>
          {wallet ? (
            <p className="mt-1 truncate text-lg font-bold tabular-nums text-text">${formatDecimal(lifetime)}</p>
          ) : (
            <div className="sk mt-1 h-7 w-24" />
          )}
        </div>
        <div className="min-w-0 pl-5">
          <p className="truncate text-xs text-muted">{c.sideLabel}</p>
          {wallet ? (
            <p className="mt-1 truncate text-lg font-bold tabular-nums text-text">${formatDecimal(wallet[c.sideKey])}</p>
          ) : (
            <div className="sk mt-1 h-7 w-24" />
          )}
        </div>
      </div>
    </section>
  )
}
