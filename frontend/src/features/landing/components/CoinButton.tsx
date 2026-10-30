import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const SIZES = {
  sm: 'px-6 py-2.5 text-sm', // navbar
  md: 'px-7 py-3 text-sm', // mobile menu
  lg: 'px-8 py-3.5 text-base', // hero and closing section
}

/**
 * Primary call-to-action. On hover a USDT coin rolls in from the right edge and settles on the left while
 * the label (arrow included) slides over. The side padding is sized so both still fit. Position is a spring (so it overshoots and settles with
 * weight) and the coin turns a whole number of times over the trip, so it rolls rather than slides and
 * always lands upright. Leaving rolls it back out. Everything scales from the button's own height.
 */
export default function CoinButton({
  to,
  children,
  size = 'lg',
  className = '',
}: {
  to: string
  children: ReactNode
  size?: keyof typeof SIZES
  className?: string
}) {
  const root = useRef<HTMLAnchorElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const coin = useRef<HTMLImageElement>(null)
  const sim = useRef({ active: false, raf: 0, last: 0, p: 0, v: 0, w: 0, size: 0, rest: 0, shift: 0, turns: 2 })

  const tick = (now: number) => {
    const m = sim.current
    const dt = Math.min(0.032, (now - m.last) / 1000 || 0.016)
    m.last = now

    // spring toward 1 (coin settled on the left) or 0 (coin off the right edge)
    m.v += ((m.active ? 1 : 0) - m.p) * 85 * dt - m.v * 12 * dt
    m.p += m.v * dt

    const start = m.w + 6
    const x = start + (m.rest - start) * m.p
    if (coin.current) {
      coin.current.style.opacity = m.p > 0.001 ? '1' : '0'
      coin.current.style.transform = `translate(${x}px, -50%) rotate(${(-2 * Math.PI * m.turns * m.p).toFixed(4)}rad)`
    }
    if (label.current) label.current.style.transform = `translateX(${m.shift * Math.max(0, m.p)}px)`

    const settled = !m.active && Math.abs(m.p) < 0.002 && Math.abs(m.v) < 0.01
    if (settled) m.p = m.v = 0
    m.raf = settled ? 0 : requestAnimationFrame(tick)
  }

  const set = (active: boolean) => {
    const m = sim.current
    if (prefersReducedMotion()) return
    m.active = active
    const el = root.current
    if (el && label.current && coin.current) {
      m.w = el.offsetWidth
      m.size = Math.round(el.offsetHeight * 0.66)
      m.rest = Math.round((el.offsetHeight - m.size) / 2)
      const pad = parseFloat(getComputedStyle(label.current).paddingLeft) || 0
      m.shift = Math.max(0, m.rest + m.size + 7 - pad)
      m.turns = Math.max(1, Math.round((m.w + 6 - m.rest) / (Math.PI * m.size)))
      coin.current.style.width = coin.current.style.height = `${m.size}px`
    }
    if (!m.raf) {
      m.last = performance.now()
      m.raf = requestAnimationFrame(tick)
    }
  }

  useEffect(() => () => cancelAnimationFrame(sim.current.raf), [])

  return (
    <Link
      ref={root}
      to={to}
      onPointerEnter={() => set(true)}
      onPointerLeave={() => set(false)}
      onFocus={() => set(true)}
      onBlur={() => set(false)}
      className={`relative inline-flex overflow-hidden rounded-full bg-primary transition-transform duration-200 active:scale-95 ${className}`}
    >
      <span
        ref={label}
        className={`relative flex flex-1 items-center justify-center gap-2 font-bold text-base ${SIZES[size]}`}
      >
        {children}
        <ArrowRight className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      </span>
      <img
        ref={coin}
        src="/crypto/usdt.svg"
        alt=""
        draggable={false}
        className="pointer-events-none absolute left-0 top-1/2 rounded-full opacity-0"
      />
    </Link>
  )
}
