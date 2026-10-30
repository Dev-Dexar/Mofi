import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatDecimal } from '@/lib/formatters'
import { panel } from './ui'

/**
 * A day-by-day chart for the admin panel: columns for what happened in a day (flows), a line with a soft wash for what was held at the
 * end of it (a level). One y-axis, hairline grid, thin marks, a hover crosshair with a tooltip (the arrow keys step through the days too),
 * and a table of the same numbers for screen readers. Longer than 90 days, days are added up into weeks so the columns stay readable.
 *
 * Colours are the panel's validated chart steps (dark surface #111318): each chart's pair passes the CVD and normal-vision
 * checks; text always stays in text colours, the colour lives on the marks. Depth comes from a gradient inside each mark, never a shadow.
 */
export const SERIES_COLORS = {
  principal: '#199e70', // aqua
  deposits: '#3987e5', // blue
  withdrawals: '#d95926', // orange
  payouts: '#c98500', // amber
  reinvested: '#9085e9', // violet
  signups: '#94a3b8', // slate: a count, not money
} as const

export type Point = { date: string; values: Record<string, number> }
export type Series = { key: string; label: string; color: string }


const compact = (v: number, money: boolean) => {
  const a = Math.abs(v)
  const s = a >= 1e6 ? `${formatDecimal(v / 1e6, 1)}M` : a >= 1e3 ? `${formatDecimal(v / 1e3, 1)}K` : formatDecimal(v, money && a < 10 && a > 0 ? 2 : 0)
  const t = s.replace(/\.0([KM])$/, '$1')
  return money ? `$${t}` : t
}
const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** A clean step between the y-axis lines: 1, 2, 2.5 or 5 times a power of ten, just above `v` (four steps reach the top) */
function niceStep(v: number) {
  if (v <= 0) return 25 // nothing to show: a $0 to $100 axis rather than a $0.25 one
  const p = 10 ** Math.floor(Math.log10(v))
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p
}

/** Days into weeks (flows add up; a level keeps the week's last value) */
function bucket(points: Point[], level: boolean): Point[] {
  if (points.length <= 90) return points
  const out: Point[] = []
  for (let i = 0; i < points.length; i += 7) {
    const week = points.slice(i, i + 7)
    const values: Record<string, number> = {}
    for (const k of Object.keys(week[0].values)) values[k] = level ? week[week.length - 1].values[k] : week.reduce((s, p) => s + p.values[k], 0)
    out.push({ date: week[0].date, values })
  }
  return out
}

export default function TimeChart({
  title,
  lead,
  points: raw,
  series,
  kind,
  height = 200,
  money = true,
}: {
  title: string
  /** a figure shown between the title and the plot */
  lead?: ReactNode
  points: Point[]
  series: Series[]
  kind: 'bars' | 'line'
  height?: number
  /** dollars, or a plain count (sign-ups) */
  money?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const uid = useId().replace(/:/g, '') // a gradient's id sits in a url(#…), where colons are best avoided
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)

  // measured before the first paint (so a phone never shows a frame of a too-wide chart), then followed
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    setWidth(Math.max(200, el.clientWidth))
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const level = kind === 'line'
  const weekly = raw.length > 90
  const points = useMemo(() => bucket(raw, level), [raw, level])
  const n = points.length
  const last = n - 1
  const biggest = Math.max(0, ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)))
  // a count's ticks should be whole numbers: the top is a multiple of four (0, 1, 2, 3, 4 at the least)
  const top = money ? niceStep(biggest / 4) * 4 : Math.max(4, Math.ceil(biggest / 4) * 4)
  // the room round the plot: the y labels on the left, and on the right the room a single line's latest-value label needs (none otherwise).
  // A narrow screen gets less of both, so the plot keeps most of its width.
  const narrow = width < 440
  const PAD = { top: 20, bottom: 26, left: narrow ? 44 : 52, right: series.length === 1 && level ? (narrow ? 50 : 60) : 12 }
  const plotW = width - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const slot = plotW / Math.max(1, n)
  const x = (i: number) => PAD.left + slot * i + slot / 2
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * top)
  // a column per series in each slot, 2px of surface between neighbours, never wider than 24px
  const barW = Math.max(1, Math.min(24, (slot - 2) / series.length - 2))
  const only = series.length === 1 ? series[0] : null
  const peak = only && !level ? points.reduce((best, p, i) => ((p.values[only.key] ?? 0) > (points[best]?.values[only.key] ?? 0) ? i : best), 0) : -1
  const fmt = (v: number) => (money ? `$${formatDecimal(v)}` : formatDecimal(v, 0))
  const empty = points.every((p) => series.every((s) => !(p.values[s.key] > 0)))
  const when = (i: number) => (weekly ? `Week of ${label(points[i].date)}` : label(points[i].date))

  const step = (e: React.KeyboardEvent) => {
    const to = (i: number) => {
      e.preventDefault()
      setHover(Math.max(0, Math.min(last, i)))
    }
    if (e.key === 'ArrowRight') to((hover ?? -1) + 1)
    else if (e.key === 'ArrowLeft') to((hover ?? n) - 1)
    else if (e.key === 'Home') to(0)
    else if (e.key === 'End') to(last)
    else if (e.key === 'Escape') setHover(null)
  }

  return (
    <div className={`${panel} min-w-0 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {/* the legend mirrors the mark */}
        {!only && (
          <ul className="flex items-center gap-3.5 text-xs text-muted" aria-label="Legend">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className={level ? 'h-0.5 w-3 rounded-full' : 'h-2.5 w-1.5 rounded-t-[2px] rounded-b-[1px]'} style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {lead && <div className="mt-4">{lead}</div>}

      {/* the box is as wide as its card and exactly as tall as the plot, whatever is drawn in it: the drawing is taken out of the flow, so its
          width can never push the card (and the box it is measured from) wider */}
      <div ref={box} className="relative mt-4 w-full min-w-0" style={{ height }}>
        {/* tabIndex: the arrow keys step through the days, with the same readout the pointer gives */}
        <div
          tabIndex={0}
          onKeyDown={step}
          // only when reached by keyboard: a click is its own choice
          onFocus={(e) => e.currentTarget.matches(':focus-visible') && hover === null && n > 0 && setHover(last)}
          onBlur={() => setHover(null)}
          className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ink/15"
        >
          <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={`${title}, ${label(points[0]?.date ?? '')} to ${label(points[last]?.date ?? '')}`}>
            <defs>
              {series.map((s) => (
                <g key={s.key}>
                  {/* columns: full colour at the cap, deepening toward the baseline */}
                  <linearGradient id={`${uid}b${s.key}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor={s.color} stopOpacity={1} />
                    <stop offset="1" stopColor={s.color} stopOpacity={0.55} />
                  </linearGradient>
                  {/* line: a wash that fades into the surface */}
                  <linearGradient id={`${uid}a${s.key}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor={s.color} stopOpacity={0.22} />
                    <stop offset="1" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                </g>
              ))}
            </defs>

            {/* recessive grid, round ticks */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#fff" strokeOpacity={t === 0 ? 0.12 : 0.05} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[10px]">
                  {compact(t, money)}
                </text>
              </g>
            ))}
            {[0, Math.floor(last / 2), last]
              .filter((v, i, a) => a.indexOf(v) === i)
              .map((i) => (
                <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-muted text-[10px]">
                  {points[i] && label(points[i].date)}
                </text>
              ))}

            {/* the day being read */}
            {hover !== null &&
              (level ? (
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="#fff" strokeOpacity={0.18} />
              ) : (
                <rect x={PAD.left + slot * hover} y={PAD.top} width={slot} height={plotH} rx={6} fill="#fff" fillOpacity={0.05} />
              ))}

            {level
              ? series.map((s) => {
                  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.values[s.key] ?? 0)}`).join(' ')
                  return (
                    <g key={s.key}>
                      <path d={`${line} L${x(last)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`} fill={`url(#${uid}a${s.key})`} />
                      <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                      {n > 0 && <circle cx={x(last)} cy={y(points[last].values[s.key] ?? 0)} r={4} fill={s.color} stroke="#111318" strokeWidth={2} />}
                      {hover !== null && points[hover] && <circle cx={x(hover)} cy={y(points[hover].values[s.key] ?? 0)} r={4} fill={s.color} stroke="#111318" strokeWidth={2} />}
                    </g>
                  )
                })
              : points.map((p, i) =>
                  series.map((s, k) => {
                    const v = p.values[s.key] ?? 0
                    if (v <= 0) return null
                    const h = Math.max(1, plotH - (y(v) - PAD.top))
                    const bx = x(i) - (series.length * (barW + 2) - 2) / 2 + k * (barW + 2)
                    const r = Math.min(4, barW / 2, h)
                    // rounded data end, square at the baseline
                    const d = `M${bx},${PAD.top + plotH} V${y(v) + r} Q${bx},${y(v)} ${bx + r},${y(v)} H${bx + barW - r} Q${bx + barW},${y(v)} ${bx + barW},${y(v) + r} V${PAD.top + plotH} Z`
                    return <path key={`${i}-${s.key}`} d={d} fill={`url(#${uid}b${s.key})`} opacity={hover === null || hover === i ? 1 : 0.5} />
                  }),
                )}

            {/* selective labels: the latest value of a line, or the best day of single columns */}
            {n > 0 && only && level && (
              <text x={x(last) + 8} y={y(points[last].values[only.key] ?? 0)} dy="0.32em" className="fill-text text-[11px] font-semibold">
                {compact(points[last].values[only.key] ?? 0, money)}
              </text>
            )}
            {n > 0 && only && peak >= 0 && (points[peak].values[only.key] ?? 0) > 0 && (
              <text x={Math.min(Math.max(x(peak), PAD.left + 14), width - PAD.right - 6)} y={y(points[peak].values[only.key] ?? 0) - 7} textAnchor="middle" className="fill-text text-[11px] font-semibold">
                {compact(points[peak].values[only.key] ?? 0, money)}
              </text>
            )}

            {/* hit targets: the whole slot, taller and wider than any mark */}
            {points.map((_, i) => (
              <rect
                key={i}
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              />
            ))}
          </svg>
        </div>

        {empty && <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted">Nothing in this period yet</p>}

        {hover !== null && points[hover] && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-44 rounded-xl border border-ink/10 bg-popover px-3.5 py-3 text-xs"
            style={{ left: Math.min(Math.max(x(hover) - 88, 0), width - 184) }}
          >
            <p className="text-muted">{when(hover)}</p>
            {series.map((s) => (
              <p key={s.key} className="mt-1.5 flex items-center justify-between gap-5">
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-text">{fmt(points[hover].values[s.key] ?? 0)}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* the same numbers for a screen reader */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>{weekly ? 'Week of' : 'Day'}</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{label(p.date)}</td>
              {series.map((s) => (
                <td key={s.key}>{fmt(p.values[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
