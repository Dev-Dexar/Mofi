import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuditIcon, PayoutsIcon } from '@/icons'
import { api } from '@/lib/api'
import type { AdminAnalytics, AdminStatsResponse, AnalyticsDay, PayoutRunResult } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { useToast } from '@/context/ToastContext'
import { overviewSource } from './overviewSource'
import Sparkline from './components/Sparkline'
import PayoutsWindow from './components/PayoutsWindow'
import AuditWindow, { type AuditResult } from './components/AuditWindow'
import { SERIES_COLORS } from './components/TimeChart'
import { Glyph } from '@/features/transactions/parts'
import { ago, money, panel, when } from './components/ui'

type Stats = AdminStatsResponse['stats']

const TREND_DAYS = 30

/** $361.8K, $1.88M: a dollar figure shortened for a narrow place */
const shortMoney = (v: number) => {
  const a = Math.abs(v)
  return a >= 1e6 ? `$${formatDecimal(v / 1e6, 2)}M` : a >= 1e3 ? `$${formatDecimal(v / 1e3, 1)}K` : money(v)
}

/** A small arrow pointing up and to the right: "go there" */
const Go = () => (
  <svg className="size-4 shrink-0 text-muted opacity-0 transition-[transform,opacity] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100 max-sm:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
)

const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/**
 * Money in against money out, day by day, mirrored round one baseline: what came in rises above it, what went out hangs below it, so a
 * glance says which way the month leaned. Hovering a day reads it out in the header. It fills the height it is given.
 */
export function FlowMini({ trend, failed, className = '' }: { trend: AdminAnalytics | null; failed: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const days = trend?.series ?? []
  const n = days.length
  const ins = days.map((d) => Number(d.deposits))
  const outs = days.map((d) => Number(d.withdrawals))
  const peak = Math.max(0, ...ins, ...outs)
  const { w, h } = size
  const mid = h / 2
  const reach = Math.max(0, mid - 6)
  const slot = n ? w / n : 0
  const bw = Math.max(2, Math.min(14, slot - 3))
  const cx = (i: number) => slot * i + slot / 2
  const len = (v: number) => (peak ? Math.max(v > 0 ? 2 : 0, (v / peak) * reach) : 0)
  // a rounded data end (3px), square at the baseline
  const up = (i: number, v: number) => {
    const x = cx(i) - bw / 2, t = mid - 1 - len(v), r = Math.min(3, bw / 2, len(v))
    return `M${x},${mid - 1} V${t + r} Q${x},${t} ${x + r},${t} H${x + bw - r} Q${x + bw},${t} ${x + bw},${t + r} V${mid - 1} Z`
  }
  const down = (i: number, v: number) => {
    const x = cx(i) - bw / 2, t = mid + 1 + len(v), r = Math.min(3, bw / 2, len(v))
    return `M${x},${mid + 1} V${t - r} Q${x},${t} ${x + r},${t} H${x + bw - r} Q${x + bw},${t} ${x + bw},${t - r} V${mid + 1} Z`
  }
  const net = trend ? Number(trend.totals.net_inflow) : 0

  return (
    <section className={`${panel} flex flex-col p-5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">In and out</h2>
        <p className="truncate text-xs tabular-nums text-muted">
          {hover !== null && days[hover] ? (
            <>
              {shortDay(days[hover].date)} · <span className="text-text">+{shortMoney(ins[hover])}</span> · <span className="text-text">−{shortMoney(outs[hover])}</span>
            </>
          ) : trend ? (
            <>
              Net <span className="font-semibold text-text">{net < 0 ? '−' : '+'}{shortMoney(Math.abs(net))}</span> in {TREND_DAYS} days
            </>
          ) : (
            ''
          )}
        </p>
      </div>

      <div ref={box} className="relative mt-4 min-h-[120px] flex-1">
        {failed ? (
          <p className="absolute inset-0 grid place-items-center text-xs text-muted">The trend could not be loaded.</p>
        ) : !trend ? (
          <div className="sk absolute inset-0 !rounded-2xl" />
        ) : peak === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-xs text-muted">Nothing moved in this period.</p>
        ) : (
          w > 0 &&
          h > 0 && (
            <svg width={w} height={h} className="absolute left-0 top-0 block" role="img" aria-label={`Money in and out over the last ${TREND_DAYS} days`}>
              <line x1={0} x2={w} y1={mid} y2={mid} stroke="#fff" strokeOpacity={0.12} />
              {hover !== null && <rect x={slot * hover} y={0} width={slot} height={h} rx={6} fill="#fff" fillOpacity={0.05} />}
              {days.map((d, i) => (
                <g key={d.date}>
                  {ins[i] > 0 && <path d={up(i, ins[i])} fill={SERIES_COLORS.deposits} opacity={hover === null || hover === i ? 1 : 0.5} />}
                  {outs[i] > 0 && <path d={down(i, outs[i])} fill={SERIES_COLORS.withdrawals} opacity={hover === null || hover === i ? 1 : 0.5} />}
                  <rect x={slot * i} y={0} width={slot} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((c) => (c === i ? null : c))} />
                </g>
              ))}
            </svg>
          )
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-1.5 rounded-t-[2px] rounded-b-[1px]" style={{ background: SERIES_COLORS.deposits }} />
            In
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-1.5 rounded-b-[2px] rounded-t-[1px]" style={{ background: SERIES_COLORS.withdrawals }} />
            Out
          </span>
        </span>
        {trend && (
          <span className="tabular-nums">
            {shortDay(trend.from)} – {shortDay(trend.to)}
          </span>
        )}
      </div>
    </section>
  )
}

/** What each kind of movement is called (the member's History calls them the same) */
const KIND: Record<string, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  withdraw_refund: 'Withdrawal refund',
  daily_yield: 'Daily return',
  referral_bonus: 'Referral bonus',
  reinvest: 'Reinvestment',
}


const ghostBtn =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 text-xs font-semibold text-muted outline-none transition-[background-color,color,scale] hover:bg-ink/10 hover:text-text focus-visible:ring-2 focus-visible:ring-ink/40 active:scale-95'

/** What needs a person: a count and a name for each, a line apiece, each one a link to where it is dealt with. All zero reads "All clear". */
function NeedsYou({ items }: { items: { label: string; hint: string; n?: number; to: string }[] }) {
  const open = items.reduce((sum, i) => sum + (i.n ?? 0), 0)
  const known = items.every((i) => i.n !== undefined)
  return (
    <section className={`${panel} px-4 pb-1 pt-3.5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">Needs you</h2>
        {known && (
          <p className={`flex items-center gap-1.5 text-xs ${open ? 'text-accent2' : 'text-muted'}`}>
            <span className={`size-1.5 rounded-full ${open ? 'bg-accent2' : 'bg-emerald-400'}`} />
            {open ? `${open} open` : 'All clear'}
          </p>
        )}
      </div>
      <ul className="mt-0.5">
        {items.map((q) => (
          <li key={q.label}>
            <Link to={q.to} title={q.hint} className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-ink/[0.04]">
              {q.n === undefined ? (
                <span className="sk h-5 w-6" />
              ) : (
                <span className={`sk-fade w-6 text-[15px] font-semibold tabular-nums ${q.n ? 'text-accent2' : 'text-muted/60'}`}>{q.n}</span>
              )}
              <span className={`min-w-0 flex-1 truncate text-sm ${q.n ? 'text-text' : 'text-muted'}`}>{q.label}</span>
              <Go />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Where the money held for members sits: one bar cut into what is locked as principal, what is on its way out and what members can take
 * out now, with a line for each (its share beside it; pointing at a line brings its piece of the bar forward), and under it, in one quiet
 * line, what has moved in all.
 */
export function MoneySplit({ s, onAudit, className = '' }: { s: Stats | null; onAudit?: () => void; className?: string }) {
  const [focus, setFocus] = useState<string | null>(null)
  const n = (v: string | number) => Number(v)
  const parts = s
    ? [
        { key: 'locked', label: 'Locked principal', value: n(s.principal_locked), color: SERIES_COLORS.principal },
        { key: 'flight', label: 'On its way out', value: n(s.pending_withdrawals_sum), color: SERIES_COLORS.withdrawals },
        { key: 'free', label: 'Withdrawable now', value: n(s.withdrawable_liability), color: SERIES_COLORS.deposits },
      ]
    : []
  const total = parts.reduce((sum, p) => sum + p.value, 0)
  return (
    <section className={`${panel} p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">Where the money sits</h2>
          {s && (
            <p className="mt-0.5 text-xs tabular-nums text-muted" title={`${money(total)} held for members`}>
              {shortMoney(total)} held
            </p>
          )}
        </div>
        {onAudit && (
          <button type="button" onClick={onAudit} className={ghostBtn} title="Check every balance against its history">
            <AuditIcon className="size-3.5" />
            Audit
          </button>
        )}
      </div>

      {/* the bar: widths are the shares, with a 2px gap between neighbours */}
      <div className="mt-4 flex h-4 gap-0.5 overflow-hidden rounded-full bg-ink/[0.05]" role="img" aria-label="Share of held money by place">
        {!s ? (
          <div className="sk h-full w-full" />
        ) : (
          total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => <span key={p.key} className="h-full min-w-1.5 transition-opacity duration-200" style={{ flex: `${p.value} 1 0`, background: p.color, opacity: focus && focus !== p.key ? 0.3 : 1 }} />)
        )}
      </div>

      <ul className="mt-3" onMouseLeave={() => setFocus(null)}>
        {(s ? parts : [0, 1, 2].map((i) => ({ key: String(i) }) as (typeof parts)[number])).map((p) => (
          <li key={p.key} onMouseEnter={() => setFocus(p.key)} className="flex items-center gap-3 py-1.5">
            {s ? (
              <>
                <span className="size-2 shrink-0 rounded-[3px]" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{p.label}</span>
                <span className="text-sm font-semibold tabular-nums text-text" title={money(p.value)}>
                  {shortMoney(p.value)}
                </span>
                <span className="w-12 text-right text-xs tabular-nums text-muted">{total > 0 ? `${formatDecimal((p.value / total) * 100, 1)}%` : '—'}</span>
              </>
            ) : (
              <div className="sk h-5 w-full" />
            )}
          </li>
        ))}
      </ul>

      {/* all time */}
      <p className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 border-t border-ink/10 pt-3 text-xs text-muted sm:flex sm:flex-wrap">
        {[
          ['Deposited', s && n(s.total_deposited)],
          ['Reinvested', s && n(s.total_reinvested)],
          ['Paid out', s && n(s.total_earned)],
          ['Withdrawn', s && n(s.total_withdrawn)],
        ].map(([label, value]) => (
          <span key={label as string} title={value === null ? undefined : `${label}, all time: ${money(value as number)}`}>
            {label}{' '}
            {value === null ? <span className="sk inline-block h-3 w-10 align-middle" /> : <span className="font-semibold tabular-nums text-text">{shortMoney(value as number)}</span>}
          </span>
        ))}
      </p>
    </section>
  )
}

/**
 * The next payout and today, in one card. A thin ring fills as the UTC day goes by and counts down to midnight, when the payout runs;
 * beside it, what that payout will pay. Under it, four lines of what has moved so far today (the counts are in each line's tooltip).
 */
export function PayoutClock({ s, today, failed = false, onPayouts, className = '' }: { s: Stats | null; today?: AnalyticsDay; failed?: boolean; onPayouts?: () => void; className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const d = new Date(now)
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  const left = Math.max(0, next - now)
  const [hh, mm, ss] = [Math.floor(left / 3_600_000), Math.floor(left / 60_000) % 60, Math.floor(left / 1000) % 60].map((v) => String(v).padStart(2, '0'))
  const R = 54
  const C = 2 * Math.PI * R
  const gone = 1 - left / 86_400_000

  const rows: { label: string; value?: string; title?: string }[] = [
    { label: 'Deposits', value: today ? money(today.deposits) : failed ? '—' : undefined, title: today && `${today.deposits_count} credited` },
    { label: 'Withdrawals', value: today ? money(today.withdrawals) : failed ? '—' : undefined, title: today && `${today.withdrawals_count} requested` },
    { label: 'New members', value: today ? String(today.signups) : failed ? '—' : undefined, title: s ? `${formatDecimal(s.total_users, 0)} in all` : undefined },
    { label: 'Commission', value: today ? money(today.commissions) : failed ? '—' : undefined, title: today && `${money(today.reinvested)} reinvested` },
  ]

  return (
    <section className={`${panel} flex flex-col p-4 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-text">Next payout</h2>
        {onPayouts && (
          <button type="button" onClick={onPayouts} className={ghostBtn} title="How the payouts have gone, and run them">
            <PayoutsIcon className="size-3.5" />
            Payouts
          </button>
        )}
      </div>
      <div className="flex items-center justify-center gap-6">
        <div className="relative size-[84px] shrink-0" role="timer" aria-label={`${hh} hours ${mm} minutes until the next payout`}>
          <svg viewBox="0 0 132 132" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="66" cy="66" r={R} fill="none" strokeWidth="5" className="stroke-ink/[0.07]" />
            <circle cx="66" cy="66" r={R} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-accent2" strokeDasharray={C} strokeDashoffset={C * (1 - gone)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            {/* tabular figures: a ticking clock must not shift as the digits change */}
            <p className="text-xl font-semibold tabular-nums tracking-tight text-text">
              {hh}
              <span className="text-muted">:</span>
              {mm}
            </p>
            <p className="text-[10px] tabular-nums text-muted">{ss}s</p>
          </div>
        </div>
        <div className="min-w-0 text-left" title={s ? `${formatDecimal(Number(s.daily_rate) * 100, 2)}% a day · ${money(s.monthly_payout_estimate)} a month · paid at midnight UTC` : undefined}>
          <p className="text-xs text-muted">Tonight pays</p>
          {s ? <p className="sk-fade mt-0.5 truncate text-xl font-semibold tracking-tight text-accent2">{money(s.next_payout_estimate)}</p> : <div className="sk mt-2 h-8 w-32" />}
        </div>
      </div>

      <dl className="mt-3 grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-2.5 border-t border-ink/10 pt-3">
        {rows.map((r) => (
          <div key={r.label} title={r.title} className="min-w-0">
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-text">{r.value ?? <span className="sk inline-block h-4 w-16 align-middle" />}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * Admin overview, in the order an operator asks: does anything need me, what does the platform hold and owe, what is happening today,
 * did the payouts run and do the balances check out, and what has just happened. Everything links to where it is dealt with.
 */
export default function AdminPage() {
  const toast = useToast()
  const [s, setS] = useState<Stats | null>(() => api.getCached<AdminStatsResponse>('/admin/stats')?.stats || null)
  const [trend, setTrend] = useState<AdminAnalytics | null>(
    () => api.getCached<AdminAnalytics>('/admin/analytics', { days: TREND_DAYS })
  )
  const [trendFailed, setTrendFailed] = useState(false)
  const [running, setRunning] = useState(false)
  const [opened, setOpened] = useState<'payouts' | 'audit' | null>(null)
  const [run, setRun] = useState<PayoutRunResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [audit, setAudit] = useState<AuditResult | null>(null)

  const load = () =>
    overviewSource
      .stats()
      .then(setS)
      .catch((e) => toast.error(e.message || 'Could not load the overview'))

  useEffect(() => {
    load()
    overviewSource
      .trend(TREND_DAYS)
      .then(setTrend)
      .catch(() => setTrendFailed(true)) // the rest of the page stands without it
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // no confirmation first: a day is never paid twice, so pressing it again costs nothing, and the window shows what it did
  const runPayouts = async () => {
    if (running) return
    setRunning(true)
    try {
      const r = await overviewSource.runPayouts()
      setRun(r)
      if (r.status === 'success') toast.success(`Paid ${r.payouts} payouts over ${r.days_paid} day(s): ${money(r.total_paid)}`)
      else if (r.status === 'up_to_date') toast.success('Nothing owed: every day is already paid.')
      else if (r.status === 'busy') toast.error('A payout run is already in progress. Try again in a moment.')
      else toast.error('The payout run stopped on an error.')
      load()
      overviewSource.trend(TREND_DAYS).then(setTrend).catch(() => {}) // the days strip shows what was just paid
    } catch (e: any) {
      toast.error(e.message || 'Could not run the payouts')
    } finally {
      setRunning(false)
    }
  }

  const runAudit = async () => {
    const started = performance.now()
    try {
      setChecking(true)
      const r = await overviewSource.reconcile()
      setAudit({ ...r, at: new Date(), took: performance.now() - started })
    } catch (e: any) {
      toast.error(e.message || 'Could not run the audit')
    } finally {
      setChecking(false)
    }
  }

  const n = (v: string | number | undefined | null) => Number(v ?? 0)
  const today = trend?.series[trend.series.length - 1]
  const principalLine = useMemo(() => (trend?.series ?? []).map((d) => Number(d.principal)), [trend])
  const growth = trend ? n(trend.totals.principal_end) - n(trend.totals.principal_start) : 0
  const growthPct = trend && n(trend.totals.principal_start) > 0 ? (growth / n(trend.totals.principal_start)) * 100 : null

  const queue = [
    { label: 'Underpaid deposits', hint: 'Paid short of what was ordered: someone has to settle them', n: s?.deposits_needing_review, to: '/admin/money/deposits?status=attention' },
    { label: 'Stuck withdrawals', hint: 'In flight for more than half an hour', n: s?.withdrawals_stuck, to: '/admin/money/withdrawals?status=attention' },
    { label: 'Appeals waiting', hint: 'Suspended members asking for a review', n: s?.pending_appeals, to: '/admin/appeals' },
  ]

  return (
    <div className="sk-fade space-y-4">
      {/* The page is a bento: the principal tall on the left with what needs you and the payout clock stacked beside it (on a phone the principal comes first, then what needs you); then the money's split beside the month's flow; then the latest activity, alone, along the bottom */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section className={`${panel} relative min-h-[260px] overflow-hidden lg:col-start-1 lg:col-end-9 lg:row-span-2 lg:row-start-1`}>
          <div className="absolute inset-x-0 bottom-0 top-[42%] flex flex-col">
            {trendFailed ? null : trend ? (
              <Sparkline values={principalLine} color={SERIES_COLORS.principal} label={`Locked principal over the last ${TREND_DAYS} days`} minHeight={140} />
            ) : (
              <div className="sk mx-5 mb-5 mt-auto h-32 !rounded-2xl" />
            )}
          </div>
          <div className="relative z-10 p-4 sm:p-5">
            <p className="text-xs text-muted">Locked principal</p>
            {s ? <p className="sk-fade mt-1 text-4xl font-semibold tracking-tight text-text sm:text-5xl">{money(s.principal_locked)}</p> : <div className="sk mt-2 h-10 w-64 max-w-full" />}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              {trend && (
                <span
                  title={`${growth < 0 ? '−' : '+'}${money(Math.abs(growth))} in ${TREND_DAYS} days`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold tabular-nums ${growth > 0 ? 'bg-[#163a2f] text-emerald-300' : growth < 0 ? 'bg-[#3d1c25] text-rose-300' : 'bg-raised text-muted'}`}
                >
                  {growthPct !== null ? `${growth < 0 ? '−' : '+'}${formatDecimal(Math.abs(growthPct), 1)}%` : shortMoney(Math.abs(growth))}
                  <span className="font-medium opacity-70">
                    {growthPct !== null && `${growth < 0 ? '−' : '+'}${shortMoney(Math.abs(growth))} · `}
                    {TREND_DAYS} days
                  </span>
                </span>
              )}
              {s
                ? [
                    [s.principal_parts, 'parts'],
                    [s.investors, 'investors'],
                    [s.total_users, 'members'],
                  ].map(([count, word]) => (
                    <span key={word} className="inline-flex items-center gap-1.5 rounded-full bg-raised px-2.5 py-1 font-medium text-muted">
                      <span className="font-semibold tabular-nums text-text">{formatDecimal(count as number, 0)}</span>
                      {(count as number) === 1 ? (word as string).replace(/s$/, '') : word}
                    </span>
                  ))
                : [0, 1, 2].map((i) => <div key={i} className="sk h-6 w-20" />)}
            </div>
          </div>
        </section>

        <div className="lg:col-start-9 lg:col-end-13 lg:row-start-1">
          <NeedsYou items={queue} />
        </div>

        <PayoutClock s={s} today={today} failed={trendFailed} onPayouts={() => setOpened('payouts')} className="lg:col-start-9 lg:col-end-13 lg:row-start-2" />

        <MoneySplit s={s} onAudit={() => setOpened('audit')} className="lg:col-span-5 lg:row-start-3" />
        <FlowMini trend={trend} failed={trendFailed} className="lg:col-span-7 lg:row-start-3" />

        {/* what just happened, every member, along the bottom: one line each, with the same round icon the member sees in their history. A pending
            amount is gold and a failed one struck through; the reference, status and exact time are in the tooltip. */}
        <section className={`${panel} flex flex-col overflow-hidden lg:col-span-12 lg:row-start-4`}>
          <h2 className="px-5 pb-1 pt-4 text-sm font-semibold text-text">Latest activity</h2>
          <ul className="pb-2">
            {!s &&
              Array.from({ length: 8 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-1.5" style={{ opacity: 1 - i * 0.09 }}>
                  <span className="sk size-7 shrink-0" />
                  <div className="sk h-4 w-48 max-w-full flex-1" />
                  <div className="sk h-4 w-20" />
                </li>
              ))}
            {s?.recent_transactions.slice(0, 8).map((tx) => (
              <li key={tx.id} title={`${tx.reference} · ${tx.status} · ${when(tx.created_at)}`} className="flex items-center gap-3 px-5 py-1.5 transition-colors hover:bg-ink/[0.02]">
                <Glyph tx={tx} small />
                <p className="min-w-0 flex-1 truncate text-sm">
                  <Link to={`/admin/users/${tx.user_id}`} className="font-medium text-text hover:underline">
                    {tx.user_name || tx.user_email || 'No name'}
                  </Link>
                  <span className="text-muted"> · {KIND[tx.type] ?? tx.type}</span>
                </p>
                <p className={`shrink-0 text-sm font-semibold tabular-nums ${tx.status === 'completed' ? 'text-text' : tx.status === 'pending' ? 'text-accent2' : 'text-muted line-through'}`}>
                  {tx.type === 'withdraw' ? '−' : '+'}
                  {money(tx.amount)}
                </p>
                <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-right text-xs text-muted">{ago(tx.created_at).replace(' ago', '')}</span>
              </li>
            ))}
            {s && s.recent_transactions.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">Nothing yet.</li>}
          </ul>
        </section>
      </div>

      {opened === 'payouts' && <PayoutsWindow s={s} trend={trend} trendFailed={trendFailed} run={run} running={running} onRun={runPayouts} onClosed={() => setOpened(null)} />}
      {opened === 'audit' && <AuditWindow audit={audit} checking={checking} onRun={runAudit} onClosed={() => setOpened(null)} />}
    </div>
  )
}
