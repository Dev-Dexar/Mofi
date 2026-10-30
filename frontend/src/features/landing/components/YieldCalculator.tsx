import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatDecimal } from '@/lib/formatters'
import { useAppSettings } from '@/hooks/useAppSettings'

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const PERIODS = [
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '180D', days: 180 },
  { label: '1Y', days: 365 },
  { label: '3Y', days: 1095 },
]

export default function YieldCalculator() {
  const cfg = useAppSettings()
  // Deposits in any coin are saved as USDT, so the calculator is USDT-only
  const cur = {
    min: cfg.min_deposit_usdt,
    max: cfg.max_deposit_usdt,
    start: clampTo(1000, cfg.min_deposit_usdt, cfg.max_deposit_usdt),
    presets: [100, 500, 1000, 5000, 10000].filter((p) => p >= cfg.min_deposit_usdt && p <= cfg.max_deposit_usdt),
    money: (v: number) => `$${formatDecimal(v, 2)}`,
    short: (v: number) => `$${v >= 1000 ? `${v / 1000}k` : v}`,
  }
  const DAILY_RATE = cfg.daily_rate // paid for as long as the principal is held: there is no cap
  const [raw, setRaw] = useState(String(cur.start))
  const [days, setDays] = useState(365)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const parsed = Number(raw.replace(/,/g, ''))
  const amount = Number.isFinite(parsed) ? Math.min(parsed, cur.max * 10) : 0
  const valid = amount >= cur.min && amount <= cur.max
  const money = cur.money

  // Two ways to spend the same days: take each payout out (the principal stays put, so earnings grow in a straight line), or
  // put each one back in (the principal grows with it, so every day pays a little more than the last)
  const daily = valid ? amount * DAILY_RATE : 0
  const earned = daily * days
  const compounded = valid ? amount * ((1 + DAILY_RATE) ** days - 1) : 0
  const dailyThen = valid ? amount * (1 + DAILY_RATE) ** days * DAILY_RATE : 0
  const progress = valid ? earned / amount : 0

  // The two lines over the chosen period, sampled evenly: straight when withdrawing, curving up when reinvesting
  const STEPS = 24
  const top = compounded > 0 ? compounded : 1
  const pointAt = (i: number, key: 'withdraw' | 'reinvest') => {
    const d = (i / STEPS) * days
    return key === 'withdraw' ? amount * DAILY_RATE * d : amount * ((1 + DAILY_RATE) ** d - 1)
  }
  const y = (v: number) => 100 - (valid ? (v / top) * 90 : 0)
  // a smooth wave through the sampled points (each segment bends through the midpoints)
  const curve = (key: 'withdraw' | 'reinvest') => {
    const pts = Array.from({ length: STEPS + 1 }, (_, i) => [(i / STEPS) * 100, y(pointAt(i, key))] as const)
    let d = `M${pts[0][0]} ${pts[0][1]}`
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2
      const my = (pts[i][1] + pts[i + 1][1]) / 2
      d += ` Q${pts[i][0]} ${pts[i][1]} ${mx} ${my}`
    }
    const last = pts[pts.length - 1]
    return `${d} L${last[0]} ${last[1]}`
  }

  // Old value fades out while the new one pops in with a tiny hop
  const earnedText = money(earned)
  const [swap, setSwap] = useState({ cur: earnedText, prev: earnedText, n: 0 })
  if (swap.cur !== earnedText) setSwap({ cur: earnedText, prev: swap.cur, n: swap.n + 1 })

  const setAmount = (v: number) => setRaw(String(v))
  return (
    <div className="rounded-2xl border border-ink/10 bg-surface shadow-2xl shadow-shade/60">
      <div>
        <div>
            <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-2 lg:gap-0">
              {/* Inputs */}
              <div className="space-y-6 lg:pr-8">
                <div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label htmlFor="calc-amount" className="text-sm text-muted">
                        Deposit
                      </label>
                      <span className="inline-flex items-center gap-2 rounded-full bg-ink/5 py-1 pl-2 pr-3 text-sm font-bold text-text">
                        <img src="/crypto/usdt.svg" alt="" className="size-5" draggable={false} />
                        USDT
                      </span>
                    </div>
                    <div className="group relative mt-1 flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-muted/60">$</span>
                      <input
                        id="calc-amount"
                        inputMode="decimal"
                        value={raw}
                        onChange={(e) => setRaw(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-full min-w-0 bg-transparent text-5xl font-black tracking-tight tabular-nums text-text outline-none"
                      />
                      <span
                        className={`pointer-events-none absolute -bottom-2 left-1/2 h-px -translate-x-1/2 transition-all duration-500 ${
                          valid
                            ? 'w-0 bg-primary group-focus-within:w-full'
                            : 'w-full bg-danger'
                        }`}
                      />
                    </div>
                  </div>
                  <p className={`mt-2 h-4 text-xs ${valid ? 'text-transparent' : 'text-danger'}`}>
                    Deposit between {money(cur.min)} and {money(cur.max)}
                  </p>
                </div>

                <div className="flex rounded-full bg-ink/5 p-1" role="group" aria-label="Quick amounts">
                  {cur.presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(p)}
                      aria-pressed={amount === p}
                      className={`flex-1 rounded-full py-1.5 text-xs font-bold tabular-nums transition ${
                        amount === p ? 'bg-ink/10 text-text' : 'text-muted hover:text-text'
                      }`}
                    >
                      {cur.short(p)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Results */}
              <div className="space-y-5 lg:pl-8">
                {/* Result panel: one tinted container, same fill as the pill tab bars above */}
                <div className="space-y-4 rounded-2xl bg-ink/5 p-4">
                <div className="flex rounded-full bg-base/50 p-1" role="group" aria-label="Period">
                  {PERIODS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setDays(p.days)}
                      aria-pressed={days === p.days}
                      className={`flex-1 rounded-full py-1.5 text-xs font-bold transition ${
                        days === p.days ? 'bg-ink/10 text-text' : 'text-muted hover:text-text'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted">
                    Earnings · {days} days
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">
                      +{formatDecimal(progress * 100, 1)}%
                    </span>
                  </div>
                  <p className="mt-1.5 text-5xl font-black tracking-tight tabular-nums text-text" aria-label={swap.cur}>
                    {swap.cur.split('').map((ch, i, arr) => {
                      // Align from the right so cents stay with cents when the length changes
                      const prevCh = swap.prev[swap.prev.length - (arr.length - i)]
                      const changed = swap.n > 0 && prevCh !== ch
                      return (
                        <span key={changed ? `${i}-${swap.n}` : `${i}-s`} aria-hidden className="relative inline-block overflow-hidden py-[0.08em] -my-[0.08em]">
                          <span className={changed ? 'num-in inline-block' : 'inline-block'}>{ch}</span>
                          {changed && prevCh !== undefined && (
                            <span className="num-out pointer-events-none absolute left-0 top-0">{prevCh}</span>
                          )}
                        </span>
                      )
                    })}
                  </p>
                </div>

                {/* The same days, two ways: withdraw every payout (straight) or put it back in (curving up) */}
                <div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="flex items-center gap-1.5 text-muted">
                        <span className="w-3 border-t border-dashed border-ink/50" />
                        Withdraw
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-text">+{money(earned)}</p>
                    </div>
                    <div className="text-right">
                      <p className="flex items-center justify-end gap-1.5 text-muted">
                        <span className="w-3 border-t border-accent2" />
                        Reinvest
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-accent2">+{money(compounded)}</p>
                    </div>
                  </div>

                  <div className="relative mt-3 h-16">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
                      <defs>
                        <linearGradient id="calc-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="var(--color-accent2)" stopOpacity="0.18" />
                          <stop offset="1" stopColor="var(--color-accent2)" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={`${curve('reinvest')} L100 100 L0 100 Z`} fill="url(#calc-fill)" />
                      <path d={curve('withdraw')} fill="none" stroke="var(--color-ink)" strokeOpacity="0.35" strokeWidth="1.25" strokeDasharray="3 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                      <path d={curve('reinvest')} fill="none" stroke="var(--color-accent2)" strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    </svg>
                  </div>
                </div>

                <p className="flex items-baseline justify-between border-t border-ink/10 pt-3 text-xs text-muted">
                  Daily payout
                  <span className="font-semibold tabular-nums text-text">
                    {money(daily)} <span className="text-muted">→</span> <span className="text-accent2">{money(dailyThen)}</span>
                    <span className="ml-1 font-normal text-muted">day {days}</span>
                  </span>
                </p>

                <button
                  type="button"
                  onClick={() => setShowBreakdown((v) => !v)}
                  aria-expanded={showBreakdown}
                  className="mx-auto flex items-center gap-1 text-xs font-semibold text-muted transition hover:text-text"
                >
                  {showBreakdown ? 'Hide breakdown' : 'View breakdown'}
                  <ChevronDown
                    className={`size-3.5 transition-transform duration-300 ${showBreakdown ? 'rotate-180' : ''}`}
                  />
                </button>

                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                    showBreakdown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                  inert={!showBreakdown}
                >
                  <div className="min-h-0 overflow-hidden">
                    <dl className="space-y-2 rounded-xl bg-base/50 p-4 text-sm tabular-nums">
                      {[
                        ['Deposit', money(valid ? amount : 0)],
                        ['Daily rate', `${formatDecimal(DAILY_RATE * 100, 2)}%`],
                        ['Days', String(days)],
                        ['Return, withdrawing', `${formatDecimal(progress * 100, 1)}%`],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <dt className="text-muted">{k}</dt>
                          <dd className="font-semibold">{v}</dd>
                        </div>
                      ))}
                      <div className="flex justify-between border-t border-ink/10 pt-2">
                        <dt className="text-muted">
                          {money(valid ? amount : 0)} × {formatDecimal(DAILY_RATE * 100, 2)}% × {days}
                        </dt>
                        <dd className="font-semibold text-primary">{money(earned)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  )
}
