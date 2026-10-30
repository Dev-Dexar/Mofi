import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { TransactionIcon } from '@/icons'
import type { TransactionItem } from '@/lib/api'
import { Tile } from '@/components/ui/SettingsUI'
import { AmountLink, Glyph } from '@/features/transactions/parts'
import { LABEL, timeOf } from '@/features/transactions/txConfig'
import { panel, pillLink } from '../styles'
import { dayOf } from '../utils'

/** 5. The latest rows of every kind, in the look of the Wallet page's history */
/** An empty row's stand-in: the same height and shape as a real one, as bones */
function BoneRow() {
  const bone = 'animate-pulse rounded-full bg-ink/[0.07]'
  return (
    <li aria-hidden="true" className="flex h-16 items-center gap-3 px-4 sm:px-5">
      <span className={`size-10 shrink-0 ${bone}`} />
      <div className="min-w-0 flex-1 space-y-2">
        <span className={`block h-3 w-24 ${bone}`} />
        <span className={`block h-2.5 w-32 ${bone}`} />
      </div>
      <span className={`h-3 w-14 shrink-0 ${bone}`} />
    </li>
  )
}

export default function ActivityCard({
  recent,
  flashId,
  bones = 0,
}: {
  recent: TransactionItem[]
  /** the landing page's demo lights up the row that has just arrived */
  flashId?: string
  /** and shows the rows it does not need as bones (this many after the real ones, and instead of "Nothing here yet") */
  bones?: number
}) {
  return (
    <section className={`${panel} flex min-w-0 flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Tile icon={TransactionIcon} tone="slate" />
          <h2 className="truncate text-sm font-semibold text-text">Recent activity</h2>
        </div>
        <Link to="/history" className={pillLink}>
          View all
          <ArrowUpRight className="size-3.5 text-muted" />
        </Link>
      </div>

      {/* five rows of room (a row is 4rem), so the card keeps its height empty or full */}
      <div className="h-80 overflow-hidden border-t border-ink/5">
        {recent.length === 0 && bones === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <TransactionIcon className="size-8 text-muted/50" />
            <p className="mt-4 text-sm font-semibold text-text">Nothing here yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted">Deposits, daily payouts and withdrawals will show up here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink/5">
            {recent.map((tx) => (
              <li
                key={tx.id}
                className={`flex h-16 items-center gap-3 px-4 sm:px-5 ${tx.id === flashId ? 'bg-primary/[0.12]' : tx.status === 'pending' ? 'bg-amber-400/[0.07]' : tx.status === 'failed' ? 'bg-rose-400/[0.07]' : ''} transition-colors duration-700`}
              >
                <Glyph tx={tx} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{LABEL[tx.type]}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {dayOf(tx.created_at)} · {timeOf(tx.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-sm">
                    <AmountLink tx={tx} />
                  </p>
                  {tx.status !== 'completed' && (
                    <span className={`text-[11px] font-semibold ${tx.status === 'pending' ? 'text-amber-400' : 'text-rose-400'}`}>
                      {tx.status === 'pending' ? 'Pending' : 'Failed'}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {Array.from({ length: bones }, (_, i) => (
              <BoneRow key={`bone-${i}`} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
