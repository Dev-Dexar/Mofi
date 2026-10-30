import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import type { TransactionItem } from '@/lib/api'
import { TransactionIcon } from '@/icons'
import { AmountLink, Glyph } from '@/features/transactions/parts'
import { dateOf, timeOf } from '@/features/transactions/txConfig'

const COPY = {
  deposit: { title: 'Recent deposits', empty: 'No deposits yet', hint: 'Your deposits will show up here, with a link to pay while one is pending.' },
  withdraw: { title: 'Recent withdrawals', empty: 'No withdrawals yet', hint: 'Withdrawals you make will show up here as they are sent.' },
}

// a light wash over the whole row carries the status; the small word under the amount says it in text too
const ROW_TONE: Record<string, { row: string; text: string; label: string }> = {
  completed: { row: 'bg-emerald-400/[0.05]', text: 'text-emerald-400', label: 'Completed' },
  pending: { row: 'bg-amber-400/[0.07]', text: 'text-amber-400', label: 'Pending' },
  failed: { row: 'bg-rose-400/[0.07]', text: 'text-rose-400', label: 'Failed' },
}

function RowSkeleton({ i }: { i: number }) {
  return (
    <li className="flex h-16 items-center gap-3 px-4 sm:px-5" style={{ opacity: 1 - i * 0.14 }}>
      <div className="sk size-9 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="sk h-3 w-24" />
        <div className="sk h-2.5 w-32" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="sk h-3 w-14" />
        <div className="sk h-5 w-16" />
      </div>
    </li>
  )
}

/** The latest rows of one kind (deposits or withdrawals), in the same look as the History page */
export default function WalletHistory({
  kind,
  items,
  loading,
  className = '',
}: {
  className?: string
  kind: 'deposit' | 'withdraw'
  items: TransactionItem[]
  loading: boolean
}) {
  const c = COPY[kind]
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-3xl border border-ink/10 bg-surface ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <h2 className="text-sm font-semibold text-text">{c.title}</h2>
        <Link
          to={`/history?type=${kind}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink/[0.06] pl-3.5 pr-3 text-xs font-bold text-text transition-[background-color,scale] hover:bg-ink/10 active:scale-95"
        >
          View all
          <ArrowUpRight className="size-3.5 text-muted" />
        </Link>
      </div>

      {/* Always five rows of room (a row is 4rem), so the card is the same height loading, empty, or full, on either tab */}
      <div className="h-80 overflow-hidden border-t border-ink/5">
        {loading ? (
          <ul className="divide-y divide-ink/5" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <RowSkeleton key={i} i={i} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <TransactionIcon className="size-8 text-muted/50" />
            <p className="mt-4 text-sm font-semibold text-text">{c.empty}</p>
            <p className="mt-1 max-w-xs text-xs text-muted">{c.hint}</p>
          </div>
        ) : (
          <ul key={kind} className="sk-fade divide-y divide-ink/5">
            {items.map((tx) => {
              const tone = ROW_TONE[tx.status] ?? ROW_TONE.failed
              return (
                <li key={tx.id} className={`flex h-16 items-center gap-3 px-4 sm:px-5 ${tone.row}`}>
                  <Glyph tx={tx} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{dateOf(tx.created_at)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{timeOf(tx.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <p className="text-sm">
                      <AmountLink tx={tx} />
                    </p>
                    <span className={`text-[11px] font-semibold ${tone.text}`}>{tone.label}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
