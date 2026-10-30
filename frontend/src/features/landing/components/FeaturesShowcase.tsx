import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatDecimal } from '@/lib/formatters'

interface Props {
  dailyRate: number // fraction per day, 0.002 = 0.20%, paid for as long as the principal is held
  levels: number[] // admin-set referral rates, index 0 = tier 1 (direct sponsor)
}

const ease = 'ease-[cubic-bezier(0.22,1,0.36,1)]'
const still = 'motion-reduce:transition-none motion-reduce:animate-none'
const rate = (r: number) => `${+(r * 100).toFixed(3)}%`

/** True while the element is on screen (a fifth of it or more); false once it has fully left, so its animation plays again next time. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.2) setSeen(true)
        else if (!e.isIntersecting) setSeen(false)
      },
      { threshold: [0, 0.2] },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, seen] as const
}

/** One feature: the picture, then its words. The four share one block and are told apart by dividers (no cards). */
function Feature({
  index,
  total,
  title,
  text,
  children,
}: {
  index: number
  total: number
  title: string
  text: ReactNode
  children: (shown: boolean) => ReactNode
}) {
  const [ref, shown] = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`relative flex flex-col justify-between gap-8 p-6 transition-[opacity,translate] duration-700 ${ease} ${still} sm:p-10 ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ transitionDelay: `${(index % 2) * 120}ms` }}
    >
      <div className="flex min-h-40 items-center">
        <div className="w-full">{children(shown)}</div>
      </div>
      {/* dividers: short lines kept clear of the corners and of each other, so nothing joins up */}
      {index < total - 1 && (
        <span aria-hidden="true" className={`absolute inset-x-8 bottom-0 h-px bg-ink/10 sm:inset-x-10 ${index >= total - 2 ? 'md:hidden' : ''}`} />
      )}
      {index % 2 === 0 && <span aria-hidden="true" className="absolute inset-y-10 right-0 hidden w-px bg-ink/10 md:block" />}
      <div>
        <p className="text-xs font-semibold tabular-nums text-muted">{String(index + 1).padStart(2, '0')}</p>
        <h3 className="mt-2 text-xl font-black tracking-tight text-text sm:text-2xl">{title}</h3>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{text}</p>
      </div>
    </div>
  )
}

/* 1. Every day pays: a slim bar per day, each a touch taller than the last, fading in towards today (green) */
const DAYS = 42
function DailyVisual({ shown, rateText }: { shown: boolean; rateText: string }) {
  return (
    <div>
      <div className="flex h-8 items-start justify-end">
        <span
          className={`rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold tabular-nums text-primary transition-[opacity,translate,filter] duration-700 ${ease} ${still} ${
            shown ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-2 opacity-0 blur-[4px]'
          }`}
          style={{ transitionDelay: `${400 + DAYS * 22}ms` }}
        >
          +{rateText} today
        </span>
      </div>
      <div className="flex h-20 items-end gap-[3px] sm:gap-1" aria-hidden="true">
        {Array.from({ length: DAYS }, (_, i) => {
          const last = i === DAYS - 1
          return (
            <span
              key={i}
              className={`flex-1 origin-bottom rounded-full transition-[transform,opacity] duration-700 ${ease} ${still} ${last ? 'bg-primary' : 'bg-ink'}`}
              style={{
                height: `${24 + (i / (DAYS - 1)) * 76}%`,
                opacity: shown ? (last ? 1 : 0.1 + (i / DAYS) * 0.3) : 0,
                transform: shown ? 'scaleY(1)' : 'scaleY(0.1)',
                transitionDelay: `${250 + i * 22}ms`,
              }}
            />
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>{DAYS} days ago</span>
        <span>Today, 00:00 UTC</span>
      </div>
    </div>
  )
}

/* 2. Locked and earning: the padlock arrives open and grey (shackle raised a little), the shackle slides down, the body thuds,
   and the whole thing turns green. The body is the supplied drawing; the shackle is redrawn as a thick arch so it can move on its own. */
const LOCK_PATH =
  'M120.7 68c-9.1 2.3-16.9 8.6-21.4 17.3-2.4 4.6-2.8 6.6-3.1 16.9l-.4 11.8-4.4 1.9c-7.7 3.5-8.5 5.9-8.2 25.1.3 16.2.4 16.6 3.5 23.3 5.8 12.2 17.4 21.3 30.2 23.7 23.2 4.3 43.4-4.8 52.4-23.7 3.1-6.7 3.2-7.1 3.5-23.3.3-19.2-.5-21.6-8.2-25.1l-4.4-1.9-.4-11.8c-.3-10.2-.7-12.3-3-16.7-5.5-10.6-15.1-17.1-26.4-18-3.2-.2-7.6 0-9.7.5m13.6 14.4c8.6 3.1 11.6 8.9 11.7 22.3v9.3h-36v-9.3c0-9.8 1.7-15.4 5.8-19 2.5-2.3 8.8-4.6 12.2-4.6 1.4 0 4.2.6 6.3 1.3m-1.8 55.2c2 .8 4.5 5.6 4.5 8.8 0 1.3-1.1 3.8-2.4 5.3-1.8 2.2-2.6 4.4-2.8 8.4l-.3 5.4h-7l-.3-5.4c-.2-4-1-6.2-2.8-8.4-6.5-7.8 1.3-17.8 11.1-14.1'
function LockVisual({ shown }: { shown: boolean }) {
  const drop = 'cubic-bezier(0.55,0,0.8,0.3)' // the shackle falls: slow to start, quick at the end
  return (
    <div className="grid place-items-center py-2" aria-hidden="true">
      <svg viewBox="76 40 104 134" className="h-24 overflow-visible">
        <defs>
          <clipPath id="lock-body">
            <rect x="60" y="114.1" width="140" height="80" />
          </clipPath>
        </defs>
        <g
          className={`${shown ? 'lock-thud' : ''} ${still}`}
          style={{ color: shown ? 'var(--color-primary)' : 'var(--color-muted)', transition: shown ? 'color 500ms ease 1500ms, opacity 500ms ease' : 'none', opacity: shown ? 1 : 0 }}
        >
          {/* the shackle sits behind the body, its legs running down into it. Open, it is simply raised a little; shutting, it slides back down. */}
          <g
            style={{
              transform: shown ? 'translateY(0)' : 'translateY(-13px)',
              transition: shown ? `transform 600ms ${drop} 900ms` : 'none', // off screen it resets at once, ready to play again
            }}
          >
            <path d="M103.1 132V100.4A24.9 24.9 0 0 1 152.9 100.4V132" fill="none" stroke="currentColor" strokeWidth="13.8" />
          </g>
          <g clipPath="url(#lock-body)" fill="currentColor" style={{ opacity: shown ? 1 : 0 }}>
            <path d={LOCK_PATH} />
          </g>
        </g>
      </svg>
    </div>
  )
}

/* 3. Any coin in, USDT out: USDT in the middle, two coins stacked on each side. On appear the coins slide out from behind it, overlapping. */
const SIDES: [file: string, x: number, z: number][] = [
  ['btc', -66, 1],
  ['eth', -40, 2],
  ['sol', 40, 2],
  ['gram', 66, 1],
]
function CoinsVisual({ shown }: { shown: boolean }) {
  const glide = 'cubic-bezier(0.22,1,0.36,1)'
  return (
    <div aria-hidden="true">
      <div className="relative mx-auto h-[72px] w-full max-w-[220px]">
        {SIDES.map(([file, x, z], i) => {
          const wait = 300 + (z === 2 ? 0 : 140) // the pair next to USDT leave first
          return (
            <img
              key={file}
              src={`/crypto/${file}.svg`}
              alt=""
              draggable={false}
              className={`absolute left-1/2 top-1/2 -ml-[20px] -mt-[20px] size-10 rounded-full bg-surface ring-2 ring-surface ${still}`}
              style={{
                zIndex: z,
                transform: shown ? `translateX(${x}px) scale(1)` : 'translateX(0) scale(0.3)',
                opacity: shown ? 1 : 0,
                filter: shown ? 'blur(0)' : 'blur(6px)',
                transition: `transform 900ms ${glide} ${wait + (i % 2) * 30}ms, opacity 500ms ease ${wait}ms, filter 600ms ease ${wait}ms`,
              }}
            />
          )
        })}

        <img
          src="/crypto/usdt.svg"
          alt=""
          draggable={false}
          className={`absolute left-1/2 top-1/2 -ml-[34px] -mt-[34px] z-[3] size-[68px] ${still}`}
          style={{
            transform: shown ? 'scale(1)' : 'scale(0.4)',
            opacity: shown ? 1 : 0,
            filter: shown ? 'blur(0)' : 'blur(8px)',
            transition: 'transform 800ms cubic-bezier(0.34,1.4,0.64,1), opacity 500ms ease, filter 600ms ease',
          }}
        />
      </div>
    </div>
  )
}

/* 6. Referral tiers: a small line chart of the rate at each tier. Move over it (or touch it) to read a tier; the readout shows what that tier pays on $1,000. */
const glideCurve = 'cubic-bezier(0.22,1,0.36,1)'
const EXAMPLE = 1000
const dollars = (v: number) => `$${formatDecimal(v, Number.isInteger(v) ? 0 : 2)}`

function TierVisual({ levels, shown }: { levels: number[]; shown: boolean }) {
  const [active, setActive] = useState(0)
  const n = levels.length
  const top = Math.max(...levels, 0.0001)
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (r: number) => 94 - (r / top) * 80
  const line = levels.map((r, i) => `${i ? 'L' : 'M'}${x(i)} ${y(r)}`).join(' ')
  const name = (i: number) => (i === 0 ? 'Direct' : `Tier ${i + 1}`)

  // the tier nearest the pointer
  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    setActive(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * n))))
  }

  return (
    <div>
      <div className={`flex items-baseline justify-between gap-3 transition-[opacity,filter] duration-700 ${ease} ${still} ${shown ? 'opacity-100 blur-0' : 'opacity-0 blur-[4px]'}`}>
        <span className="text-xs text-muted">{name(active)}</span>
        <span className="text-right">
          <span className="text-xl font-black tabular-nums text-primary">+{dollars(levels[active] * EXAMPLE)}</span>
          <span className="ml-2 text-xs tabular-nums text-muted">
            {rate(levels[active])} of {dollars(EXAMPLE)}
          </span>
        </span>
      </div>

      <div
        className="relative mt-3 h-24 cursor-crosshair touch-pan-y select-none"
        onPointerMove={pick}
        onPointerDown={pick}
        role="img"
        aria-label={`Referral rates by tier: ${levels.map((r, i) => `${name(i)} ${rate(r)}`).join(', ')}`}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={`absolute inset-0 size-full overflow-visible ${still}`}
          style={{ clipPath: shown ? 'inset(-10% -2% -10% -2%)' : 'inset(-10% 100% -10% -2%)', transition: `clip-path 1400ms ${glideCurve} 200ms` }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="tier-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-primary)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[14, 54, 94].map((g) => (
            <line key={g} x1="0" x2="100" y1={g} y2={g} stroke="var(--color-ink)" strokeOpacity="0.06" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={`${line} L${x(n - 1)} 100 L${x(0)} 100 Z`} fill="url(#tier-fill)" />
          <path d={line} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line
            x1={x(active)} x2={x(active)} y1="0" y2="100"
            stroke="var(--color-ink)" strokeOpacity="0.25" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
            className="transition-[x1,x2] duration-200"
          />
        </svg>
        {levels.map((r, i) => (
          <span
            key={i}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-[opacity,scale] duration-500 ${still} ${shown ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
            style={{ left: `${x(i)}%`, top: `${y(r)}%`, transitionDelay: shown ? `${400 + i * (1000 / n)}ms` : '0ms' }}
          >
            <span
              className={`block rounded-full border-2 border-surface transition-[width,height,background-color] duration-200 ${
                i === active ? 'size-3.5 bg-primary ring-4 ring-primary/20' : 'size-2.5 bg-primary/60'
              }`}
            />
          </span>
        ))}
      </div>

      <div className="mt-2 flex text-[11px] text-muted" aria-hidden="true">
        {levels.map((_, i) => (
          <span key={i} className={`flex-1 text-center transition-colors ${i === active ? 'text-text' : ''}`}>
            {i === 0 ? 'Direct' : i + 1}
          </span>
        ))}
      </div>
    </div>
  )
}

/** What the platform actually does: four facts in one view. Figures come from the live settings. */
export default function FeaturesShowcase({ dailyRate, levels }: Props) {
  const features: { title: string; text: ReactNode; visual: (shown: boolean) => ReactNode }[] = [
    { title: `${rate(dailyRate)} a day`, text: 'Paid at 00:00 UTC on your whole balance.', visual: (shown) => <DailyVisual shown={shown} rateText={rate(dailyRate)} /> },
    { title: 'Locked, no cap', text: 'Your deposit stays locked and always earns. You withdraw the earnings.', visual: (shown) => <LockVisual shown={shown} /> },
    { title: 'Any coin in, USDT out', text: 'Deposit in five coins. Held and paid as USDT.', visual: (shown) => <CoinsVisual shown={shown} /> },
    { title: `Earn ${levels.length} tiers deep`, text: 'You earn when your friends deposit, and when the people they invite do.', visual: (shown) => <TierVisual levels={levels} shown={shown} /> },
  ]

  return (
    <div className="grid md:grid-cols-2">
      {features.map((f, i) => (
        <Feature key={f.title} index={i} total={features.length} title={f.title} text={f.text}>
          {f.visual}
        </Feature>
      ))}
    </div>
  )
}
