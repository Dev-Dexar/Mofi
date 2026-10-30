import { useEffect, useId, useState } from 'react'
import type { ReferralOverview } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'

const monthName = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })
}

type P = { x: number; y: number }

/** A smooth curve through the points that never dips below or above them (monotone cubic), as an SVG path in a 0..100 box */
function curve(pts: P[]) {
  const n = pts.length
  if (n < 2) return ''
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x)
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / dx[i])
  const m = [slope[0]]
  for (let i = 1; i < n - 1; i++) m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2)
  m.push(slope[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) m[i] = m[i + 1] = 0
    else {
      const a = m[i] / slope[i]
      const b = m[i + 1] / slope[i]
      const h = Math.hypot(a, b)
      if (h > 3) {
        m[i] = (3 * a * slope[i]) / h
        m[i + 1] = (3 * b * slope[i]) / h
      }
    }
  }
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < n - 1; i++)
    d += ` C${pts[i].x + dx[i] / 3} ${pts[i].y + (m[i] * dx[i]) / 3} ${pts[i + 1].x - dx[i] / 3} ${pts[i + 1].y - (m[i + 1] * dx[i]) / 3} ${pts[i + 1].x} ${pts[i + 1].y}`
  return d
}

/**
 * Six months as one smooth line over a soft fill. It draws itself in; move over it (or touch it) and a marker follows to the nearest
 * month with its figure. The line and fill are stretched to the card, while the dots and words are plain HTML so they never distort.
 */
export default function EarningsChart({
  monthly,
  label = 'Referral earnings over the last six months',
  color = 'var(--color-primary)',
  emptyText = 'Your earnings will show here',
}: {
  monthly: ReferralOverview['monthly']
  label?: string
  color?: string // any css colour; the line, fill and dots all take it
  /** said over the chart while there is nothing to draw yet */
  emptyText?: string
}) {
  const gid = useId().replace(/:/g, '')
  const [shown, setShown] = useState(false)
  const [active, setActive] = useState(monthly.length - 1)
  const [hovering, setHovering] = useState(false) // the figure and guide only show while a month is being pointed at
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const values = monthly.map((m) => parseFloat(m.amount))
  // Nothing earned yet: a real line would be a flat stripe that says nothing. Like any good empty chart, it shows the frame (scale, months),
  // a faint dashed shape of what is to come, and a line of words, and it stays still: no figures, no markers, nothing to point at.
  const empty = values.every((v) => !(v > 0))
  const top = Math.max(...values, 0)
  const n = monthly.length
  const px = (i: number) => (100 * i) / Math.max(n - 1, 1) // edge to edge
  const py = (v: number) => (top > 0 ? 92 - (v / top) * 74 : 92) // the highest month stops a little short of the top, where its figure appears
  const pts = values.map((v, i) => ({ x: px(i), y: py(v) }))
  const line = curve(pts)
  const area = line ? `${line} L${px(n - 1)} 100 L${px(0)} 100 Z` : ''

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (empty) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * 100
    let best = 0
    for (let i = 1; i < n; i++) if (Math.abs(px(i) - x) < Math.abs(px(best) - x)) best = i
    setActive(best)
    setHovering(true)
  }

  return (
    // (the plot is 7rem tall, and takes any room its parent gives it: the Wallet page stretches it to fill its card)
    <div role="img" aria-label={label} className="flex h-full flex-col">
      <div className="relative min-h-28 flex-1 touch-pan-y select-none" onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => {
          setActive(n - 1)
          setHovering(false)
        }}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          aria-hidden="true"
          // the line and fill are drawn in from the left
          style={{ clipPath: `inset(-8px ${shown ? -8 : 100}% -8px -8px)`, transition: 'clip-path 1200ms cubic-bezier(0.22,1,0.36,1)' }}
        >
          <defs>
            <linearGradient id={`earn-fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.32" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[18, 92].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--color-ink)" strokeOpacity={y === 92 ? 0.1 : 0.045} vectorEffect="non-scaling-stroke" />
          ))}
          {empty ? (
            <path d={GHOST} fill="none" stroke="var(--color-ink)" strokeOpacity="0.16" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ) : (
            <path d={area} fill={`url(#earn-fill-${gid})`} />
          )}
          <path
            style={empty ? { display: 'none' } : undefined}
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {empty && <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-xs text-muted">{emptyText}</p>}
        {/* the guide and marker for the month under the pointer */}
        <div
          className={`pointer-events-none absolute w-px border-l border-dashed border-ink/20 transition-[left,top,height,opacity] duration-200 ease-out ${hovering && !empty ? 'opacity-100' : 'opacity-0'}`}
          style={{ left: `${px(active)}%`, top: `${pts[active].y}%`, height: `${92 - pts[active].y}%` }}
        />
        {pts.map((p, i) => (
          <span
            key={monthly[i].month}
            className={`pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface transition-[scale,background-color] duration-200 ${
              i === active ? 'scale-[1.5]' : 'scale-75'
            }`}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              backgroundColor: color,
              opacity: shown && !empty ? (i === active ? 1 : 0.35) : 0,
              transitionProperty: 'scale, background-color, opacity',
              transitionDelay: shown ? `${400 + i * 90}ms` : '0ms',
            }}
          />
        ))}
        <div
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-[0.6875rem] font-bold tabular-nums text-surface transition-[left,top,opacity] duration-200 ease-out ${hovering && !empty ? 'opacity-100' : 'opacity-0'}`}
          style={{ left: `${Math.min(Math.max(pts[active].x, 10), 90)}%`, top: `calc(${pts[active].y}% - 12px)` }}
        >
          ${formatDecimal(monthly[active].amount)}
        </div>
      </div>

      <div className="relative mt-2 h-4">
        {monthly.map((m, i) => (
          <span
            key={m.month}
            className={`absolute text-[0.6875rem] font-medium transition-colors ${i === 0 ? '' : i === n - 1 ? '-translate-x-full' : '-translate-x-1/2'} ${i === active && !empty ? 'text-text' : 'text-muted'}`}
            style={{ left: `${px(i)}%` }}
          >
            {monthName(m.month)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The shape of the faint dashed line in an empty chart: a gentle rise, the same on every screen (it is a drawing, not data) */
const GHOST = curve([0, 20, 40, 60, 80, 100].map((x, i) => ({ x, y: [78, 70, 66, 52, 44, 30][i] })))

/** The chart's stand-in while the numbers load: the same height and guide lines, a pulsing ghost of a line, and the month names as bars */
export function EarningsChartSkeleton() {
  const ghost = curve([0, 20, 40, 60, 80, 100].map((x, i) => ({ x, y: [70, 52, 62, 38, 48, 30][i] })))
  return (
    <div aria-hidden="true" className="flex h-full animate-pulse flex-col">
      <div className="relative min-h-28 flex-1">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
          {[18, 92].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--color-ink)" strokeOpacity="0.05" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${ghost} L100 100 L0 100 Z`} fill="var(--color-ink)" fillOpacity="0.035" />
          <path d={ghost} fill="none" stroke="var(--color-ink)" strokeOpacity="0.1" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="relative mt-2 h-4">
        {[0, 20, 40, 60, 80, 100].map((x, i) => (
          <span key={i} className={`absolute h-2.5 w-7 rounded-full bg-ink/[0.07] ${i === 0 ? '' : i === 5 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${x}%`, top: 3 }} />
        ))}
      </div>
    </div>
  )
}
