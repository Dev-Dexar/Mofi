import { useRef, useState } from 'react'
import { DailyReturnIcon } from '@/icons'
import { pct } from '@/hooks/useAppSettings'
import { Tile } from '@/components/ui/SettingsUI'
import { panel } from '../styles'
import { money, yearAhead } from '../utils'

/** $1,234 -> $1.2k, $25,873 -> $25.9k: the chart's scale has to be short */
const short = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `$${(v / 1e3).toFixed(0)}k` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}k` : `$${Math.round(v)}`)
const TICKS = [0, 0.5, 1] // where the scale lines sit, as a share of the top of the chart
const AXIS = [0, 3, 6, 9, 12] // the months labelled under the chart
const monthLabel = (m: number) => (m === 0 ? 'Today' : m === 12 ? '1 year' : `${m} ${m === 1 ? 'month' : 'months'}`)

/**
 * The year ahead, two ways: taking each payout out, or putting it back in. Principal pays for as long as it is there, so the
 * difference is all in what happens to the payouts, and seeing the two lines part is the plainest case for reinvesting.
 */
export default function GrowthCard({ principal, rate, fresh }: { principal: number; rate: number; fresh: boolean }) {
  const points = yearAhead(principal, rate)
  const [hover, setHover] = useState<number | null>(null) // the month being pointed at; the end of the year when nothing is
  const plot = useRef<HTMLDivElement>(null)
  const last = points[points.length - 1]
  const top = last.reinvest || 1
  const x = (i: number) => (i / (points.length - 1)) * 100
  const y = (v: number) => 100 - (v / top) * 90
  const line = (key: 'withdraw' | 'reinvest') => points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p[key])}`).join(' ')
  const at = hover ?? points.length - 1
  const now = points[at]
  const extra = now.reinvest - now.withdraw
  // what a day pays at that point: a flat amount when withdrawing, a growing one when every payout goes back in
  const incomeWithdraw = principal * rate
  const incomeReinvest = principal * (1 + rate) ** now.day * rate
  const pick = (clientX: number) => {
    const r = plot.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((clientX - r.left) / r.width) * (points.length - 1)))))
  }

  return (
    <section className={`${panel} flex min-w-0 flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <Tile icon={DailyReturnIcon} tone="green" />
          <p className="truncate text-sm font-semibold text-text">Withdraw or reinvest</p>
        </div>
        {principal > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted">{hover === null ? `At ${pct(rate)} a day` : <span className="font-semibold text-text">{monthLabel(hover)}</span>}</span>
        )}
      </div>

      {principal <= 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center border-t border-ink/5 px-6 py-10 text-center">
          <DailyReturnIcon className="size-8 text-muted/50" />
          <p className="mt-4 text-sm font-semibold text-text">{fresh ? 'No income yet' : 'Nothing earning right now'}</p>
          <p className="mt-1 max-w-xs text-xs text-muted">
            Once you deposit, this shows what your money earns over the next year, and how much more it earns if you reinvest.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 divide-x divide-ink/5 border-t border-ink/5">
            <div className="min-w-0 px-4 py-4 sm:px-5">
              <p className="flex items-center gap-2 text-xs text-muted">
                <span className="h-0.5 w-3 rounded-full bg-ink/40" />
                If you withdraw
              </p>
              <p className="mt-1.5 truncate text-xl font-black tabular-nums text-text sm:text-2xl">+{money(now.withdraw)}</p>
            </div>
            <div className="min-w-0 bg-accent2/[0.05] px-4 py-4 sm:px-5">
              <p className="flex items-center gap-2 text-xs text-muted">
                <span className="h-0.5 w-3 rounded-full bg-accent2" />
                If you reinvest
              </p>
              <p className="mt-1.5 truncate text-xl font-black tabular-nums text-accent2 sm:text-2xl">+{money(now.reinvest)}</p>
            </div>
          </div>

          <div className="flex flex-1 flex-col border-t border-ink/5 px-4 pb-3 pt-5 sm:px-5">
          <div
            ref={plot}
            role="img"
            aria-label={`Income over the next year: ${money(now.withdraw)} if you withdraw, ${money(now.reinvest)} if you reinvest, at ${monthLabel(at)}`}
            tabIndex={0}
            onPointerDown={(e) => pick(e.clientX)}
            onPointerMove={(e) => pick(e.clientX)}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault()
                setHover(Math.max(0, Math.min(points.length - 1, (hover ?? points.length - 1) + (e.key === 'ArrowRight' ? 1 : -1))))
              }
            }}
            className="relative min-h-32 flex-1 cursor-crosshair touch-pan-y outline-none"
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              <defs>
                {/* the gap between the two lines is what reinvesting adds, so it is the part that is coloured */}
                <linearGradient id="growth-fill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--color-accent2)" stopOpacity="0.04" />
                  <stop offset="1" stopColor="var(--color-accent2)" stopOpacity="0.32" />
                </linearGradient>
                <linearGradient id="floor-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--color-ink)" stopOpacity="0.06" />
                  <stop offset="1" stopColor="var(--color-ink)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {TICKS.map((t) => (
                <line key={t} x1="0" x2="100" y1={y(top * t)} y2={y(top * t)} stroke="var(--color-ink)" strokeOpacity={t === 0 ? 0.1 : 0.045} vectorEffect="non-scaling-stroke" />
              ))}
              <path d={`${line('withdraw')} L100 100 L0 100 Z`} fill="url(#floor-fill)" />
              <path
                d={`${line('reinvest')} ${points.map((_, i) => points.length - 1 - i).map((i) => `L${x(i)} ${y(points[i].withdraw)}`).join(' ')} Z`}
                fill="url(#growth-fill)"
              />
              <path d={line('withdraw')} fill="none" stroke="var(--color-ink)" strokeOpacity="0.28" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <path d={line('reinvest')} fill="none" stroke="var(--color-accent2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {TICKS.slice(1).map((t) => (
              <span key={t} className="pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-[9px] tabular-nums text-muted/45" style={{ top: `${y(top * t)}%` }}>
                {short(top * t)}
              </span>
            ))}
            {hover !== null && <span className="pointer-events-none absolute inset-y-0 w-px bg-ink/15" style={{ left: `${x(at)}%` }} />}
            {/* the gap at this point: a gold bracket between the two lines, and what it comes to */}
            <span
              className={`pointer-events-none absolute w-px -translate-x-1/2 bg-accent2/70 transition-[left,top,height,opacity] duration-100 ${hover === null ? 'opacity-0' : 'opacity-100'}`}
              style={{ left: `${x(at)}%`, top: `${y(now.reinvest)}%`, height: `${y(now.withdraw) - y(now.reinvest)}%` }}
            />
            <span
              className={`pointer-events-none absolute -translate-y-1/2 whitespace-nowrap rounded-full bg-accent2 px-2 py-0.5 text-[11px] font-bold tabular-nums text-[color:var(--color-base)] shadow-[0_2px_8px_color-mix(in_srgb,var(--color-shade)_40%,transparent)] transition-[left,top,opacity] duration-100 ${
                x(at) < 24 ? 'ml-2.5' : '-translate-x-full -ml-2.5'
              } ${hover === null ? 'opacity-0' : 'opacity-100'}`}
              style={{ left: `${x(at)}%`, top: `${(y(now.reinvest) + y(now.withdraw)) / 2}%` }}
            >
              +{money(extra)}
            </span>
            <span
              className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink/80 transition-[left,top] duration-100"
              style={{ left: `${x(at)}%`, top: `${y(now.withdraw)}%` }}
            />
            <span
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent2 transition-[left,top] duration-100"
              style={{ left: `${x(at)}%`, top: `${y(now.reinvest)}%` }}
            />
          </div>
          {/* each label sits at its own spot under the chart, so lighting one up never moves the others */}
          <div className="relative mt-2 h-4 text-[11px] text-muted" aria-hidden="true">
            {AXIS.map((m) => {
              const origin = m === 0 ? 'left' : m === 12 ? 'right' : 'center'
              return (
                <span
                  key={m}
                  className={`absolute top-0 whitespace-nowrap transition-[color,transform] duration-150 ${
                    m === 0 ? '' : m === 12 ? '-translate-x-full' : '-translate-x-1/2'
                  } ${at === m ? 'text-text' : ''}`}
                  style={{ left: `${x(m)}%`, scale: at === m ? '1.12' : '1', transformOrigin: origin }}
                >
                  {monthLabel(m)}
                </span>
              )
            })}
          </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-ink/5 border-t border-ink/5">
            <div className="min-w-0 px-4 py-3.5 sm:px-5">
              <p className="text-xs text-muted">Extra from reinvesting</p>
              <p className="mt-1 truncate text-sm font-bold tabular-nums text-accent2">+{money(extra)}</p>
            </div>
            <div className="min-w-0 px-4 py-3.5 sm:px-5">
              <p className="text-xs text-muted">Daily income then</p>
              <p className="mt-1 truncate text-sm font-bold tabular-nums text-text">
                {money(incomeWithdraw)} <span className="font-normal text-muted">→</span> <span className="text-accent2">{money(incomeReinvest)}</span>
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
