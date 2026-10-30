import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import type { AdminAnalytics } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { useToast } from '@/context/ToastContext'
import { DownloadIcon } from '@/icons'
import TimeChart, { SERIES_COLORS, type Point } from './components/TimeChart'
import AnalyticsExport from './components/AnalyticsExport'
import { Segmented, money, panel } from './components/ui'

const PERIODS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
]

type Cell = { label: string; value?: string; note?: string }

/** The headline figures in one card, cells divided by hairlines */
function Figures({ cells }: { cells: Cell[] }) {
  return (
    <div className={`${panel} grid grid-cols-2 lg:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-ink/10 max-lg:[&>*:nth-child(3)]:border-l-0 max-lg:[&>*:nth-child(n+3)]:border-t`}>
      {cells.map((c) => (
        <div key={c.label} className="min-w-0 px-5 py-5">
          <p className="truncate text-xs text-muted">{c.label}</p>
          {c.value === undefined ? (
            <>
              <div className="sk mt-2 h-8 w-28" />
              <div className="sk mt-1.5 h-4 w-full max-w-36" />
            </>
          ) : (
            <>
              <p className="sk-fade mt-2 truncate text-2xl font-semibold tracking-tight text-text">{c.value}</p>
              <p className="sk-fade mt-1.5 text-xs text-muted sm:truncate">{c.note}</p>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/** A chart card while its data is on the way: the same frame, so nothing moves when it arrives */
const ChartSkeleton = ({ tall, height }: { tall?: boolean; height?: number }) => (
  <div className={`${panel} p-4`}>
    <div className="sk h-5 w-32" />
    {tall && <div className="sk mt-4 h-10 w-44" />}
    <div className="sk mt-4 !rounded-2xl" style={{ height: height ?? (tall ? 280 : 200) }} />
  </div>
)

/**
 * How the platform is moving, in the order it is read: what it holds, then what moved. Principal first as a large chart with its
 * number; the headline figures; then money in against out, and what is paid against what is reinvested. The days can be saved
 * through Export.
 */
export default function AdminAnalyticsPage() {
  const toast = useToast()
  const [days, setDays] = useState(30)
  const [data, setData] = useState<AdminAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let live = true
    setLoading(true)
    setFailed(false)
    api
      .adminAnalytics(days)
      .then((r) => live && (setData(r), setLoading(false)))
      .catch((e) => {
        if (!live) return
        setLoading(false)
        setFailed(true)
        toast.error(e.message || 'Could not load analytics')
      })
    return () => {
      live = false
    }
  }, [days, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const points: Point[] = useMemo(
    () =>
      (data?.series ?? []).map((d) => ({
        date: d.date,
        values: {
          principal: Number(d.principal),
          deposits: Number(d.deposits),
          withdrawals: Number(d.withdrawals),
          payouts: Number(d.payouts),
          reinvested: Number(d.reinvested),
          signups: d.signups,
        },
      })),
    [data],
  )

  const t = data?.totals
  const n = (v: string | number | undefined) => Number(v ?? 0)
  const reinvestRate = t && n(t.payouts) > 0 ? (n(t.reinvested) / n(t.payouts)) * 100 : null
  const growth = t ? n(t.principal_end) - n(t.principal_start) : 0
  const growthPct = t && n(t.principal_start) > 0 ? (growth / n(t.principal_start)) * 100 : null

  return (
    <div className="sk-fade space-y-4">
      <div className="flex justify-end pb-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!data}
            onClick={() => setExporting(true)}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-ink/[0.05] px-4 text-xs font-semibold text-text outline-none transition-[background-color,scale] hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-ink/40 active:scale-95 disabled:opacity-40"
          >
            <DownloadIcon className="size-4 text-muted" />
            Export
          </button>
          <Segmented value={days} options={PERIODS} onChange={setDays} />
        </div>
      </div>

      {/* a new period keeps what is on screen, dimmed, until the new figures arrive: nothing jumps */}
      <div className={`space-y-4 transition-opacity duration-300 ${loading && data ? 'pointer-events-none opacity-50' : ''}`}>
        {failed && !data ? (
          <div className={`${panel} flex flex-col items-center gap-3 px-5 py-16 text-center`}>
            <p className="text-sm text-muted">The analytics could not be loaded.</p>
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="inline-flex h-9 items-center rounded-full bg-ink/[0.06] px-4 text-xs font-bold text-text transition-[background-color,scale] hover:bg-ink/10 active:scale-95"
            >
              Try again
            </button>
          </div>
        ) : !data ? (
          <ChartSkeleton tall />
        ) : (
          <TimeChart
            title="Principal held"
            kind="line"
            height={280}
            points={points}
            series={[{ key: 'principal', label: 'Principal', color: SERIES_COLORS.principal }]}
            lead={
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-4xl font-semibold tracking-tight text-text">{money(t?.principal_end)}</span>
                <span className={`text-sm font-semibold tabular-nums ${growth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {growth >= 0 ? '+' : '−'}
                  {money(Math.abs(growth))}
                  {growthPct !== null && ` · ${formatDecimal(Math.abs(growthPct), 1)}%`}
                </span>
                <span className="text-xs text-muted">over the period</span>
              </p>
            }
          />
        )}

        {!(failed && !data) && (
        <Figures
          cells={[
            { label: 'Net inflow', value: t && money(t.net_inflow), note: t && `${money(t.deposits)} in · ${money(t.withdrawals)} out` },
            { label: 'Paid out', value: t && money(t.payouts), note: t && `${money(t.commissions)} commission on top` },
            {
              label: 'Reinvested',
              value: t && (reinvestRate === null ? money(t.reinvested) : `${formatDecimal(reinvestRate, 0)}%`),
              note: t && `${money(t.reinvested)} of payouts back in`,
            },
            { label: 'New accounts', value: t && String(t.signups), note: t && `${t.deposits_count} deposits · ${t.withdrawals_count} withdrawals` },
          ]}
        />
        )}

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {failed && !data ? null : !data ? (
            <>
              <ChartSkeleton />
              <ChartSkeleton />
              <div className="lg:col-span-2">
                <ChartSkeleton height={140} />
              </div>
            </>
          ) : (
            <>
              <TimeChart
                title="Money in and out"
                kind="bars"
                points={points}
                series={[
                  { key: 'deposits', label: 'Deposits', color: SERIES_COLORS.deposits },
                  { key: 'withdrawals', label: 'Withdrawals', color: SERIES_COLORS.withdrawals },
                ]}
              />
              <TimeChart
                title="Payouts and reinvesting"
                kind="bars"
                points={points}
                series={[
                  { key: 'payouts', label: 'Payouts', color: SERIES_COLORS.payouts },
                  { key: 'reinvested', label: 'Reinvested', color: SERIES_COLORS.reinvested },
                ]}
              />
              <div className="lg:col-span-2">
                <TimeChart title="New accounts" kind="bars" money={false} height={150} points={points} series={[{ key: 'signups', label: 'Sign-ups', color: SERIES_COLORS.signups }]} />
              </div>
            </>
          )}
        </div>
      </div>

      {exporting && data && <AnalyticsExport days={data.series} onClosed={() => setExporting(false)} />}
    </div>
  )
}
