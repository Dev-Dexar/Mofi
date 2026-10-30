import { useEffect, useId, useImperativeHandle, useRef, type Ref } from 'react'
import { currentTheme } from '@/lib/theme'

export interface AnimatedLogoHandle {
  /** Play the animation. Ignored while it is already playing. */
  ignite: () => void
}

/*
 * The MoFi Life mark (public/logo.svg), drawn inline so every part can move: three flames standing on a
 * chevron hearth. ignite() makes the fire "breathe" once, in about a second:
 *
 *   1. Lift-off. Each flame lets go of the hearth and rises like a real flame: it accelerates upward (hot gas
 *      is buoyant, so it speeds up as it goes), stretches tall and thin, licks from side to side and warms
 *      from white to brand gold toward its tip. It stays solid and burns out by shrinking to nothing, not by
 *      turning see-through, so it never reads as smoke. Centre first, the sides a beat later.
 *   2. Rebirth. Out of nothing at the same spot, an identical flame grows up from its base. Its height is an
 *      underdamped spring from 0 to 1, so it shoots up, overshoots a little and settles. Its width follows
 *      sqrt(height) while growing and 1/sqrt(height) past full size, so it keeps roughly a flame's area.
 *   3. The hearth dips as the flames leave and springs back.
 *
 * "Licking" displaces every control point of the flame's path sideways by layered noise, weighted by how far up
 * the flame the point sits (weight^1.6), so the base stays planted while the tip moves the most.
 *
 * All units are SVG viewBox units (the mark is 780 wide). Motion is integrated with a fixed physics step, so it
 * plays the same at 60 or 120 Hz. Nothing runs between plays, and once everything settles the attributes are
 * reset, so the mark is pixel-identical to logo.svg.
 */

type Vec = { x: number; y: number }

interface FlameDef {
  d: string
  base: Vec
  tip: Vec
  delay: number // seconds after the click before this flame lifts off
  phase: number // de-syncs the noise between flames
}

const FLAMES: FlameDef[] = [
  {
    d: 'M460 180C505 215 548 265 545 335C542 410 490 470 430 520C400 545 372 558 350 557C344 500 346 450 372 410C400 365 440 335 456 290C466 258 470 215 460 180Z',
    base: { x: 380, y: 548 },
    tip: { x: 460, y: 180 },
    delay: 0,
    phase: 0.0,
  },
  {
    d: 'M327 408C260 470 165 560 140 660C128 730 160 775 203 797C185 750 190 700 235 625C280 555 292 500 300 465C305 440 315 420 327 408Z',
    base: { x: 178, y: 790 },
    tip: { x: 327, y: 408 },
    delay: 0.06,
    phase: 2.1,
  },
  {
    d: 'M597 357C615 400 650 430 700 480C780 550 830 610 826 690C823 740 800 775 762 797C770 750 765 700 720 640C665 570 598 520 590 410C589 385 592 368 597 357Z',
    base: { x: 790, y: 790 },
    tip: { x: 597, y: 357 },
    delay: 0.1,
    phase: 4.3,
  },
]

const HEARTH = 'M268 772L487 568L712 772'
// the mark's own colour is the page's ink (white on dark, near-black on light); the flame turns hot from that and cools back to it
const INK_VAR = 'var(--color-ink)'
const inkHex = () => (currentTheme() === 'light' ? '#0F172A' : '#FFFFFF')
const HOT = '#FFF1BF'
const GOLD = '#D4AF37'

// lift-off
const RISE_LIFE = 0.75 // seconds from leaving to burnt out
const RISE_V0 = 200 // initial upward speed (units/s)
const RISE_ACCEL = 1100 // buoyancy (units/s²)
const RISE_STRETCH = 0.6 // extra height by the end
const RISE_THIN = 0.85 // width lost by the end
const RISE_LICK = 0.12 // sideways tip displacement, as a share of the flame's length
const RISE_SWAY = 9 // degrees of skew

// rebirth
const REBIRTH_GAP = 0.28 // seconds between a flame leaving and its replacement starting to grow
const GROW_K = 95 // spring stiffness
const GROW_C = 9 // damping (ζ ≈ 0.46)
const GROW_LICK = 0.06
const GROW_LICK_DECAY = 0.35

// hearth
const HEARTH_K = 300
const HEARTH_C = 19
const HEARTH_DIP_V = 420

const STEP = 1 / 240
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// smooth-ish 1D noise from incommensurate sines, roughly [-1, 1]
const noise = (t: number, p: number) =>
  0.5 * Math.sin(2 * Math.PI * 3.1 * t + p) + 0.3 * Math.sin(2 * Math.PI * 5.9 * t + 1.7 * p) + 0.2 * Math.sin(2 * Math.PI * 9.7 * t + 2.9 * p)

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const mix = (a: string, b: string, k: number) => {
  const A = hex(a)
  const B = hex(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * clamp01(k))).join(',')})`
}

// A flame's path split into commands and coordinate pairs, with each pair's position up the flame (0 base, 1 tip)
interface Geometry {
  cmds: { c: string; pts: number }[]
  pts: Vec[]
  along: number[]
  axis: Vec
  normal: Vec
  length: number
  angle: number // degrees clockwise from straight up
}

function geometry(f: FlameDef): Geometry {
  const tokens = f.d.match(/[MCLZ]|-?\d*\.?\d+/g) ?? []
  const cmds: Geometry['cmds'] = []
  const pts: Vec[] = []
  let nums: number[] = []
  const flush = () => {
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] })
    if (cmds.length) cmds[cmds.length - 1].pts = nums.length / 2
    nums = []
  }
  for (const t of tokens) {
    if (/[MCLZ]/.test(t)) {
      flush()
      cmds.push({ c: t, pts: 0 })
    } else nums.push(parseFloat(t))
  }
  flush()
  const dx = f.tip.x - f.base.x
  const dy = f.tip.y - f.base.y
  const length = Math.hypot(dx, dy)
  const axis = { x: dx / length, y: dy / length }
  return {
    cmds,
    pts,
    along: pts.map((p) => clamp01(((p.x - f.base.x) * axis.x + (p.y - f.base.y) * axis.y) / length)),
    axis,
    normal: { x: -axis.y, y: axis.x },
    length,
    angle: (Math.atan2(dx, -dy) * 180) / Math.PI,
  }
}

const GEO = FLAMES.map(geometry)

// the flame's outline with its points pushed sideways, more the higher they sit
function lickedPath(i: number, amount: number, t: number) {
  const g = GEO[i]
  const f = FLAMES[i]
  let k = 0
  let d = ''
  for (const c of g.cmds) {
    d += c.c
    for (let n = 0; n < c.pts; n++, k++) {
      const p = g.pts[k]
      const side = amount * g.length * Math.pow(g.along[k], 1.6) * noise(t, f.phase + g.along[k] * 2.3)
      d += `${n ? ' ' : ''}${(p.x + g.normal.x * side).toFixed(1)} ${(p.y + g.normal.y * side).toFixed(1)}`
    }
  }
  return d
}

// scale (w across, h along) and skew a flame in its own frame, pivoting on its base, then move it
function frame(i: number, w: number, h: number, skew: number, dy = 0) {
  const { base } = FLAMES[i]
  const a = GEO[i].angle
  return `translate(${base.x} ${(base.y + dy).toFixed(1)}) rotate(${a.toFixed(2)}) skewX(${skew.toFixed(2)}) scale(${w.toFixed(4)} ${h.toFixed(4)}) rotate(${(-a).toFixed(2)}) translate(${-base.x} ${-base.y})`
}

export default function AnimatedLogo({ className = 'size-8', ref }: { className?: string; ref?: Ref<AnimatedLogoHandle> }) {
  const uid = useId().replace(/:/g, '')
  const flameEls = useRef<(SVGPathElement | null)[]>([]) // the resting flames; these are the ones reborn
  const ghostEls = useRef<(SVGPathElement | null)[]>([]) // the copies that rise away
  const tipStops = useRef<(SVGStopElement | null)[]>([])
  const hearthEl = useRef<SVGPathElement | null>(null)

  const sim = useRef({
    raf: 0,
    last: 0,
    acc: 0,
    t: 0,
    running: false,
    hearth: { y: 0, v: 0, dipped: true },
    flames: FLAMES.map(() => ({ h: 1, v: 0, growing: false })),
  })

  const step = (dt: number) => {
    const m = sim.current
    m.t += dt
    if (!m.hearth.dipped) {
      m.hearth.dipped = true
      m.hearth.v += HEARTH_DIP_V
    }
    m.hearth.v += (-HEARTH_K * m.hearth.y - HEARTH_C * m.hearth.v) * dt
    m.hearth.y += m.hearth.v * dt

    FLAMES.forEach((f, i) => {
      const s = m.flames[i]
      if (!s.growing && m.t >= f.delay + REBIRTH_GAP) s.growing = true
      if (!s.growing) return
      s.v += (-GROW_K * (s.h - 1) - GROW_C * s.v) * dt
      s.h = Math.max(0, s.h + s.v * dt)
    })
  }

  const render = () => {
    const m = sim.current
    FLAMES.forEach((f, i) => {
      // the rising ghost
      const ghost = ghostEls.current[i]
      const age = m.t - f.delay
      if (ghost) {
        if (age < 0 || age >= RISE_LIFE) {
          ghost.setAttribute('opacity', age < 0 ? '1' : '0')
          if (age < 0) ghost.removeAttribute('transform')
        } else {
          const p = age / RISE_LIFE
          const rise = RISE_V0 * age + 0.5 * RISE_ACCEL * age * age
          const swayDeg = RISE_SWAY * p * noise(m.t * 0.9, f.phase + 1.3)
          ghost.setAttribute('d', lickedPath(i, RISE_LICK * Math.sin(Math.PI * Math.min(1, p * 1.4)), m.t))
          const burnOut = 1 - Math.pow(p, 3) // shrinks away at the end of its life
          ghost.setAttribute('transform', frame(i, (1 - RISE_THIN * p) * burnOut, (1 + RISE_STRETCH * p) * burnOut, swayDeg, -rise))
          ghost.setAttribute('opacity', (1 - Math.pow(p, 6)).toFixed(3))
          tipStops.current[i]?.setAttribute('stop-color', p < 0.3 ? mix(inkHex(), HOT, p / 0.3) : mix(HOT, GOLD, (p - 0.3) / 0.4))
        }
      }

      // the reborn flame
      const el = flameEls.current[i]
      const s = m.flames[i]
      if (el) {
        if (!s.growing) {
          el.setAttribute('opacity', '0')
        } else {
          const h = s.h
          const w = h < 1 ? Math.sqrt(h) : 1 / Math.sqrt(h)
          const sinceGrow = m.t - f.delay - REBIRTH_GAP
          const lick = GROW_LICK * Math.exp(-sinceGrow / GROW_LICK_DECAY)
          el.setAttribute('opacity', Math.min(1, h * 2.5).toFixed(3))
          el.setAttribute('d', lickedPath(i, lick, m.t))
          el.setAttribute('transform', frame(i, w, h, 0))
        }
      }
    })
    hearthEl.current?.setAttribute('transform', `translate(0 ${m.hearth.y.toFixed(2)})`)
  }

  const settled = () => {
    const m = sim.current
    const lastGrow = Math.max(...FLAMES.map((f) => f.delay)) + REBIRTH_GAP
    return (
      m.t > Math.max(...FLAMES.map((f) => f.delay)) + RISE_LIFE &&
      m.t > lastGrow + 4 * GROW_LICK_DECAY &&
      Math.abs(m.hearth.y) < 0.05 &&
      Math.abs(m.hearth.v) < 0.5 &&
      m.flames.every((s) => s.growing && Math.abs(s.h - 1) < 0.0005 && Math.abs(s.v) < 0.005)
    )
  }

  const reset = () => {
    FLAMES.forEach((f, i) => {
      const el = flameEls.current[i]
      el?.setAttribute('d', f.d)
      el?.removeAttribute('transform')
      el?.setAttribute('opacity', '1')
      const ghost = ghostEls.current[i]
      ghost?.setAttribute('d', f.d)
      ghost?.removeAttribute('transform')
      ghost?.setAttribute('opacity', '0')
      tipStops.current[i]?.setAttribute('stop-color', INK_VAR)
    })
    hearthEl.current?.removeAttribute('transform')
  }

  const tick = (now: number) => {
    const m = sim.current
    m.acc += Math.min(0.05, (now - m.last) / 1000) // a background tab must not fast-forward the whole thing
    m.last = now
    while (m.acc >= STEP) {
      step(STEP)
      m.acc -= STEP
    }
    if (settled()) {
      m.raf = 0
      m.running = false
      reset()
      return
    }
    render()
    m.raf = requestAnimationFrame(tick)
  }

  useImperativeHandle(ref, () => ({
    ignite() {
      const m = sim.current
      if (m.running || reducedMotion()) return
      m.running = true
      m.t = 0
      m.hearth.dipped = false
      m.flames.forEach((s) => {
        s.h = 0
        s.v = 0
        s.growing = false
      })
      // the resting flames hand over to their ghosts in the same frame, so nothing visibly jumps
      flameEls.current.forEach((el) => el?.setAttribute('opacity', '0'))
      ghostEls.current.forEach((el) => el?.setAttribute('opacity', '1'))
      m.last = performance.now()
      m.acc = 0
      m.raf = requestAnimationFrame(tick)
    },
  }))

  useEffect(() => () => cancelAnimationFrame(sim.current.raf), [])

  return (
    <svg viewBox="90 110 780 780" overflow="visible" className={className} role="img" aria-label="MoFi Life">
      <defs>
        {FLAMES.map((f, i) => (
          <linearGradient key={i} id={`${uid}-heat-${i}`} gradientUnits="userSpaceOnUse" x1={f.base.x} y1={f.base.y} x2={f.tip.x} y2={f.tip.y}>
            <stop offset="0.35" stopColor={INK_VAR} />
            <stop ref={(el) => void (tipStops.current[i] = el)} offset="1" stopColor={INK_VAR} />
          </linearGradient>
        ))}
      </defs>

      {FLAMES.map((f, i) => (
        <path key={`g${i}`} ref={(el) => void (ghostEls.current[i] = el)} d={f.d} fill={`url(#${uid}-heat-${i})`} opacity="0" aria-hidden="true" />
      ))}
      {FLAMES.map((f, i) => (
        <path key={`f${i}`} ref={(el) => void (flameEls.current[i] = el)} d={f.d} fill={INK_VAR} />
      ))}
      <path ref={hearthEl} d={HEARTH} fill="none" stroke={INK_VAR} strokeWidth={84} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
