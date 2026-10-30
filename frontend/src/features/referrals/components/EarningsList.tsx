import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ReferralEarning, ReferralPage } from '@/lib/api'
import { formatDecimal, formatPercent } from '@/lib/formatters'
import { MoneyBagIcon } from '@/icons'
import { useToast } from '@/context/ToastContext'
import { EmptyBlock, Pager, bone, inner, shortDate } from './shared'

const LIMIT = 10
const cols = 'grid-cols-[minmax(0,1.6fr)_4.5rem_7rem_4.5rem_7.5rem_6.5rem]'
const head = 'text-[0.6875rem] font-semibold uppercase tracking-wider text-muted/70'

const Avatar = ({ name }: { name: string }) => (
  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/10 text-sm font-bold text-text">{name[0]?.toUpperCase()}</span>
)

/** Tier 1 (the direct invite) is green; the deeper tiers are quiet */
const TierPill = ({ level }: { level: number }) => (
  <span
    className={`inline-flex h-6 w-fit items-center rounded-full px-2.5 text-[0.6875rem] font-bold ${level === 1 ? 'bg-primary/15 text-primary' : 'bg-ink/[0.07] text-muted'}`}
  >
    Tier {level}
  </span>
)

/** Every commission paid to the user, newest first. `level` is the tier chosen in the filter (0 = all); the page number comes from the address (`page`). */
export default function EarningsList({ level, page, onPage }: { level: number; page: number; onPage: (page: number, replace?: boolean) => void }) {
  const toast = useToast()
  const [data, setData] = useState<ReferralPage<ReferralEarning> | null>(null)
  const [loading, setLoading] = useState(true) // the list on screen stays put (dimmed) while the next page loads

  useEffect(() => {
    let live = true
    setLoading(true)
    api
      .getReferralEarnings({ page, limit: LIMIT, level: level || undefined })
      .then((d) => {
        if (!live) return
        if (d.page > d.total_pages) return onPage(d.total_pages, true) // a page past the end: show the last one instead
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (!live) return
        setLoading(false)
        toast.error('Could not load your referral earnings')
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, level])

  return (
    <div className="space-y-4">
      {data && data.items.length === 0 ? (
        <EmptyBlock
          icon={<MoneyBagIcon className="size-6" />}
          title="No commissions yet"
          description={level ? 'Nothing has been earned from this tier yet.' : 'When someone you invited makes a deposit, your commission shows up here.'}
        />
      ) : (
        <div className={`${inner} overflow-hidden transition-opacity duration-200 ${loading && data ? 'opacity-50' : ''}`}>
          {/* Column headings (wider screens): what each figure in a row is */}
          <div className={`hidden items-center gap-x-4 border-b border-ink/[0.06] px-5 py-3 sm:grid ${cols}`} aria-hidden="true">
            <span className={head}>Member</span>
            <span className={head}>Tier</span>
            <span className={`${head} text-right`}>Deposit</span>
            <span className={`${head} text-right`}>Share</span>
            <span className={`${head} text-right`}>Date</span>
            <span className={`${head} text-right`}>Earned</span>
          </div>

          <ul className="divide-y divide-ink/[0.06]">
            {data
              ? data.items.map((e) => (
                  <li key={e.id} className="h-16">
                    {/* Wider screens: one line, one column per figure */}
                    <div className={`hidden h-full items-center gap-x-4 px-5 sm:grid ${cols}`}>
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar name={e.from} />
                        <span className="truncate text-sm font-semibold text-text">{e.from}</span>
                      </span>
                      <TierPill level={e.level} />
                      <span className="text-right text-sm tabular-nums text-muted">{e.deposit_amount ? `$${formatDecimal(e.deposit_amount)}` : '—'}</span>
                      <span className="text-right text-sm tabular-nums text-muted">{formatPercent(e.percentage)}</span>
                      <span className="text-right text-sm tabular-nums text-muted">{shortDate(e.created_at)}</span>
                      <span className="text-right text-sm font-bold tabular-nums text-primary">+${formatDecimal(e.amount)}</span>
                    </div>

                    {/* Phones: the member and the amount, with the details beneath */}
                    <div className="flex h-full items-center gap-3 px-4 sm:hidden">
                      <Avatar name={e.from} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-text">
                          {e.from}
                          <TierPill level={e.level} />
                        </p>
                        <p className="truncate text-xs text-muted">
                          {formatPercent(e.percentage)}
                          {e.deposit_amount ? ` of $${formatDecimal(e.deposit_amount)}` : ''} · {shortDate(e.created_at)}
                        </p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-primary">+${formatDecimal(e.amount)}</span>
                    </div>
                  </li>
                ))
              : Array.from({ length: LIMIT }, (_, i) => (
                  <li key={i} className="h-16" aria-hidden="true">
                    {/* the same two layouts as a real row, with bars where the figures go */}
                    <div className={`hidden h-full items-center gap-x-4 px-5 sm:grid ${cols}`}>
                      <span className="flex items-center gap-3">
                        <span className={`size-9 shrink-0 ${bone}`} />
                        <span className={`h-3.5 w-24 ${bone}`} />
                      </span>
                      <span className={`h-6 w-14 ${bone}`} />
                      <span className={`ml-auto h-3.5 w-16 ${bone}`} />
                      <span className={`ml-auto h-3.5 w-10 ${bone}`} />
                      <span className={`ml-auto h-3.5 w-20 ${bone}`} />
                      <span className={`ml-auto h-4 w-16 ${bone}`} />
                    </div>
                    <div className="flex h-full items-center gap-3 px-4 sm:hidden">
                      <span className={`size-9 shrink-0 ${bone}`} />
                      <span className="flex-1 space-y-2">
                        <span className={`block h-3.5 w-32 ${bone}`} />
                        <span className={`block h-3 w-40 ${bone}`} />
                      </span>
                      <span className={`h-4 w-14 ${bone}`} />
                    </div>
                  </li>
                ))}
          </ul>
        </div>
      )}
      {data ? <Pager page={data.page} pages={data.total_pages} onPage={onPage} /> : <div className="h-9" />}
    </div>
  )
}
