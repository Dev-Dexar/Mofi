import { useMemo } from 'react'
import CenterWindow from '@/components/ui/CenterWindow'
import type { AdminAnalytics, AdminStatsResponse, PayoutRunResult } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { Badge, ago, money } from './ui'

type LastRun = NonNullable<AdminStatsResponse['stats']['last_run']>

const RUN: Record<LastRun['status'], { badge: 'green' | 'amber' | 'red'; note?: string }> = {
  completed: { badge: 'green' },
  partial: { badge: 'amber', note: 'Some members were skipped. Run it again: a day is never paid twice, so only what is missing is paid.' },
  failed: { badge: 'red', note: 'Nothing was paid by that run. Run it again once the cause is fixed.' },
  running: { badge: 'amber' },
}

const DAYS = 14

/** The last days of the trend, each one: paid (with how much), owed (a day with principal that was not paid), or nothing to pay */
export function lastDays(trend: AdminAnalytics | null) {
  const series = trend?.series ?? []
  const shown = series.slice(-DAYS)
  const offset = series.length - shown.length
  const peak = Math.max(0, ...shown.map((d) => Number(d.payouts)))
  return shown.map((d, i) => {
    const paid = Number(d.payouts)
    // a day pays the principal that was already there when it began, i.e. what the day before ended with
    const before = offset + i > 0 ? Number(series[offset + i - 1].principal) : null
    const state: 'paid' | 'owed' | 'none' | 'unknown' = paid > 0 ? 'paid' : before === null ? 'unknown' : before > 0 ? 'owed' : 'none'
    return { date: d.date, paid, state, share: peak ? paid / peak : 0 }
  })
}

const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/**
 * The daily payout, in a small window: how the last run went (and what to do if it did not go well), the last two weeks day by day (paid,
 * owed or nothing to pay, so a missed day cannot hide), what tonight pays, and the button that pays whatever is owed. It runs at once (a day is never paid twice, so
 * there is nothing to confirm) and what it did is shown here afterwards.
 */
export default function PayoutsWindow({
  s,
  trend,
  trendFailed,
  run,
  running,
  onRun,
  onClosed,
}: {
  s: AdminStatsResponse['stats'] | null
  trend: AdminAnalytics | null
  trendFailed: boolean
  run: PayoutRunResult | null
  running: boolean
  onRun: () => void
  onClosed: () => void
}) {
  const days = useMemo(() => lastDays(trend), [trend])
  const owed = days.filter((d) => d.state === 'owed').length
  const last = s?.last_run ?? null
  const meta = last ? RUN[last.status] : null

  return (
    <CenterWindow title="Payouts" width="narrow" onClosed={onClosed}>
      <div>
        {/* how the last run went: one line for the verdict, one for the detail */}
        {!s ? (
          <div className="space-y-2">
            <div className="sk h-4 w-40" />
            <div className="sk h-3.5 w-64" />
          </div>
        ) : last && meta ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-text">{last.status === 'running' ? 'Running now' : 'Last run'}</p>
              <Badge tone={meta.badge}>{last.status}</Badge>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              <span className="tabular-nums">{last.run_date}</span>
              {last.status !== 'running' && (
                <>
                  {' · '}
                  {formatDecimal(last.payouts, 0)} {last.payouts === 1 ? 'payout' : 'payouts'} · {money(last.total_paid)}
                </>
              )}
              {' · '}
              {last.days_paid > 1 && `${last.days_paid} days · `}
              {last.auto_reinvested > 0 && `${formatDecimal(last.auto_reinvested, 0)} auto-reinvested · `}
              {last.triggered_by}
              {last.finished_at && `, ${ago(last.finished_at)}`}
            </p>
            {meta.note && <p className="mt-3 rounded-2xl bg-ink/[0.04] px-4 py-2.5 text-xs leading-relaxed text-muted">{meta.note}</p>}
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-text">No payout yet</p>
            <p className="mt-1.5 text-xs text-muted">The first one goes out at midnight UTC, or you can run it now.</p>
          </div>
        )}

        {/* the last two weeks, day by day: gold paid, red owed, a dot when there was nothing to pay (each has its detail on hover) */}
        {!trendFailed && (
          <div className="mt-5 border-t border-ink/10 pt-4">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <p className="text-muted">Last {DAYS} days</p>
              {trend && (
                <p className={owed ? 'font-semibold text-rose-300' : 'text-muted'}>
                  {owed ? `${owed} ${owed === 1 ? 'day' : 'days'} owed` : days.some((d) => d.state === 'paid') ? 'All paid' : 'Nothing to pay yet'}
                </p>
              )}
            </div>
            {!trend ? (
              <div className="sk mt-3 h-8 !rounded-xl" />
            ) : (
              <>
                <div className="mt-3 flex h-8 items-end gap-1" role="img" aria-label={`Payouts over the last ${DAYS} days: ${owed} owed`}>
                  {days.map((d) => (
                    <span
                      key={d.date}
                      title={`${shortDay(d.date)} · ${d.state === 'paid' ? `${money(d.paid)} paid` : d.state === 'owed' ? 'not paid yet' : 'nothing to pay'}`}
                      className={`min-w-0 flex-1 rounded-[3px] ${
                        d.state === 'paid' ? 'bg-accent2' : d.state === 'owed' ? 'h-full bg-rose-400/30' : 'h-0.5 bg-ink/15'
                      }`}
                      style={d.state === 'paid' ? { height: `${Math.max(16, d.share * 100)}%` } : undefined}
                    />
                  ))}
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-muted/70">
                  <span>{days[0] ? shortDay(days[0].date) : ''}</span>
                  <span>Today</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* what tonight pays */}
        {s && (
          <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-ink/10 pt-4 text-sm">
            <span className="text-muted">Tonight, midnight UTC</span>
            <span className="font-semibold tabular-nums text-accent2" title={`${formatDecimal(Number(s.daily_rate) * 100, 2)}% of ${money(s.principal_locked)} principal`}>
              {money(s.next_payout_estimate)}
            </span>
          </p>
        )}

        {/* what the last press of the button did */}
        {run && (
          <div className={`mt-4 rounded-2xl px-4 py-3 text-xs ${run.status === 'error' ? 'bg-rose-500/10 text-rose-300' : run.status === 'busy' ? 'bg-amber-500/10 text-amber-300' : 'bg-ink/[0.04] text-muted'}`}>
            <p className="font-semibold text-text">
              {run.status === 'success' && 'Run complete'}
              {run.status === 'up_to_date' && 'Nothing was owed'}
              {run.status === 'busy' && 'Another run is already going'}
              {run.status === 'error' && 'The run stopped on an error'}
            </p>
            {(run.status === 'success' || run.status === 'error') && (
              <p className="mt-0.5">
                {run.days_paid} {run.days_paid === 1 ? 'day' : 'days'} · {run.payouts} payouts · {money(run.total_paid)} paid · {run.auto_reinvested} auto-reinvested
              </p>
            )}
            {run.status === 'up_to_date' && <p className="mt-0.5">Every day up to today is already paid.</p>}
            {run.status === 'busy' && <p className="mt-0.5">Try again in a moment.</p>}
            {run.errors && run.errors.length > 0 && (
              <ul className="mt-1.5 max-h-24 space-y-1 overflow-y-auto">
                {run.errors.map((e, i) => (
                  <li key={i}>
                    {e.date ?? e.user_id?.slice(0, 8)}
                    {e.step ? ` · ${e.step}` : ''}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onRun}
          disabled={running}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2.5 rounded-full bg-accent2 text-[13px] font-bold text-[color:var(--color-base)] outline-none transition-[opacity,scale] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ink/60 active:scale-95 disabled:opacity-60 disabled:active:scale-100"
        >
          {running && <span className="size-4 animate-spin rounded-full border-2 border-[color:var(--color-base)]/30 border-t-[color:var(--color-base)]" />}
          {running ? 'Paying…' : owed > 0 ? `Pay ${owed} owed ${owed === 1 ? 'day' : 'days'} now` : 'Run now'}
        </button>
      </div>
    </CenterWindow>
  )
}
