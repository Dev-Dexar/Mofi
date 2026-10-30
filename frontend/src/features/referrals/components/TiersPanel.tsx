import type { ReferralOverview } from '@/lib/api'
import { formatDecimal, formatPercent } from '@/lib/formatters'
import { bone, inner } from './shared'

const cols = 'grid-cols-[3rem_1fr_3.5rem] sm:grid-cols-[3.5rem_1fr_4.5rem_5rem_6.5rem]'
const head = 'text-[0.6875rem] font-semibold uppercase tracking-wider text-muted/70'

/** How the commissions work, one quiet line per tier: its share of a deposit, who is in it and what it has paid */
export default function TiersPanel({ data }: { data: ReferralOverview | null }) {
  const levels = data?.levels ?? []
  const top = Math.max(...levels.map((l) => parseFloat(l.percentage)), 0)
  const sum = levels.reduce((n, l) => n + parseFloat(l.percentage), 0)

  return (
    <section className={`${inner} p-5 sm:p-6`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h3 className="text-sm font-semibold text-text">Commission tiers</h3>
        {data ? (
          sum > 0 && <p className="text-xs text-muted">{formatPercent(sum)} of every deposit is shared across your network</p>
        ) : (
          <span className={`h-3.5 w-56 ${bone}`} aria-hidden="true" />
        )}
      </div>

      {/* Phones: a chip with the tier number, name and member count over a full-width bar, the share and what it earned on the right */}
      <ul className="mt-4 divide-y divide-ink/[0.05] sm:hidden">
        {data
          ? levels.map((l) => {
              const pct = parseFloat(l.percentage)
              const earned = parseFloat(l.earned) > 0
              return (
                <li key={l.level} className="flex items-center gap-3.5 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{l.level}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      Tier {l.level}
                      <span className="ml-2 text-xs font-normal text-muted">
                        {l.members} {l.members === 1 ? 'member' : 'members'}
                      </span>
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${top > 0 ? Math.max((pct / top) * 100, 3) : 0}%`, opacity: 1 - (l.level - 1) * 0.14 }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-text">{formatPercent(l.percentage)}</p>
                    <p className={`mt-0.5 text-xs tabular-nums ${earned ? 'font-semibold text-primary' : 'text-muted'}`}>${formatDecimal(l.earned)}</p>
                  </div>
                </li>
              )
            })
          : Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-3.5 py-3.5" aria-hidden="true">
                <span className={`size-9 shrink-0 ${bone}`} />
                <div className="flex-1 space-y-2.5">
                  <span className={`block h-3.5 w-24 ${bone}`} />
                  <div className="h-1.5 rounded-full bg-ink/[0.07]" />
                </div>
                <div className="space-y-1.5">
                  <span className={`ml-auto block h-3.5 w-12 ${bone}`} />
                  <span className={`ml-auto block h-3 w-10 ${bone}`} />
                </div>
              </li>
            ))}
      </ul>

      <div className={`mt-5 hidden items-center gap-x-4 px-0.5 pb-2 sm:grid ${cols}`} aria-hidden="true">
        <span className={head}>Tier</span>
        <span />
        <span className={`${head} text-right`}>Share</span>
        <span className={`${head} text-right`}>Members</span>
        <span className={`${head} text-right`}>Earned</span>
      </div>

      <ul className="hidden divide-y divide-ink/[0.05] sm:block">
        {data
          ? levels.map((l) => {
              const pct = parseFloat(l.percentage)
              const earned = parseFloat(l.earned) > 0
              return (
                <li key={l.level} className={`grid items-center gap-x-4 gap-y-1.5 py-3.5 ${cols}`}>
                  <span className="text-sm font-semibold text-text">Tier {l.level}</span>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${top > 0 ? Math.max((pct / top) * 100, 3) : 0}%`, opacity: 1 - (l.level - 1) * 0.14 }}
                    />
                  </div>
                  <span className="text-right text-sm font-bold tabular-nums text-text">{formatPercent(l.percentage)}</span>
                  <span className="col-span-3 flex justify-between text-xs text-muted sm:contents">
                    <span className="sm:text-right sm:text-sm">
                      {l.members}
                      <span className="sm:hidden"> {l.members === 1 ? 'member' : 'members'}</span>
                    </span>
                    <span className={`tabular-nums sm:text-right sm:text-sm ${earned ? 'font-semibold text-primary' : ''}`}>
                      <span className="sm:hidden">Earned </span>${formatDecimal(l.earned)}
                    </span>
                  </span>
                </li>
              )
            })
          : Array.from({ length: 5 }, (_, i) => (
              <li key={i} className={`grid items-center gap-x-4 gap-y-1.5 py-3.5 ${cols}`} aria-hidden="true">
                <span className={`h-3.5 w-9 ${bone}`} />
                <div className="h-1.5 rounded-full bg-ink/[0.07]" />
                <span className={`ml-auto h-3.5 w-10 ${bone}`} />
                <span className="col-span-3 flex justify-between sm:contents">
                  <span className={`h-3.5 w-12 sm:ml-auto ${bone}`} />
                  <span className={`h-3.5 w-16 sm:ml-auto ${bone}`} />
                </span>
              </li>
            ))}
      </ul>
    </section>
  )
}
