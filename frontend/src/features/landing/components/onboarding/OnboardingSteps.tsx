import { useEffect, useRef, useState, type ReactNode } from 'react'
import DashboardDemo from './DashboardDemo'
import DepositDemo from './DepositDemo'
import SignUpDemo from './SignUpDemo'
import './demos.css'

interface Step {
  title: string
  text: string
  /** Real screenshot of the product screen. Until it exists, a skeleton fills the frame. */
  image?: string
  skeleton: ReactNode
  /** The skeleton is a whole page and fills the frame edge to edge */
  bleed?: boolean
}

/** Fires once the element has scrolled into view. */
function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, seen] as const
}


/* The product screens in the frame: animated demos of the real pages (SignUpDemo, DepositDemo, DashboardDemo) */

/** Window chrome around a product screen */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-ink/[0.06] bg-base shadow-2xl shadow-shade/40">
      <div className="flex items-center gap-1.5 border-b border-ink/[0.06] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2.5 rounded-full bg-ink/10" />
        ))}
      </div>
      {/* square on phones, so the sign-up form fits; 4:3 from tablet up */}
      <div className="relative aspect-square sm:aspect-[4/3]">{children}</div>
    </div>
  )
}

function Screen({ step }: { step: Step }) {
  return (
    <div className={`absolute inset-0 flex ${step.bleed && !step.image ? '' : 'p-8'}`}>
      {step.image ? <img src={step.image} alt={step.title} className="size-full rounded-xl object-cover object-top" /> : step.skeleton}
    </div>
  )
}

function StepRow({
  step,
  index,
  total,
  slotRef,
  textRef,
  desktop,
}: {
  step: Step
  index: number
  total: number
  slotRef: (el: HTMLDivElement | null) => void
  textRef: (el: HTMLDivElement | null) => void
  /** the travelling window shows the screens, so this box is only a place-holder of the same size */
  desktop: boolean
}) {
  const [ref, shown] = useInView<HTMLDivElement>()
  const flip = index % 2 === 1 // alternate sides: box right, left, right
  const anim = `transition-[opacity,translate] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
    shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
  }`

  return (
    <div ref={ref} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={`${anim} ${flip ? 'md:order-2' : ''}`}>
        <div ref={textRef} className="transition-opacity duration-500">
          <div className="flex items-center gap-3 text-sm font-semibold text-primary">
            <span className="flex size-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 tabular-nums">
              {index + 1}
            </span>
            Step {index + 1} of {total}
          </div>
          <h3 className="mt-5 text-3xl font-black tracking-tight text-text sm:text-4xl">{step.title}</h3>
          <p className="mt-3 max-w-md text-base leading-relaxed text-muted sm:text-lg">{step.text}</p>
        </div>
      </div>
      {/* On desktop this box only holds the place the travelling window flies to; the window itself is drawn once, above */}
      <div ref={slotRef} className={`${anim} md:invisible ${flip ? 'md:order-1' : ''}`} style={{ transitionDelay: '120ms' }}>
        <Frame>{desktop ? null : <Screen step={step} />}</Frame>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------------------------
 * The travelling window (desktop). Instead of three boxes, one window flies between the three box positions as
 * you scroll: right, across to the left, back to the right, morphing its screen on the way.
 *
 * Scroll picks the destination, never a point in between. The window belongs to the step whose box is nearest
 * the middle of the screen (with a little hysteresis, so it does not flicker at the midpoint). The moment that
 * changes, the window commits to a flight there and always completes it, even if scrolling stops; scrolling
 * back past the midpoint mid-flight simply starts a new flight home from wherever it is.
 *

 * Cost. Everything per frame is transform and opacity, which the GPU composites without repainting. Layout is
 * measured once and on resize, and the loop sleeps whenever nothing is moving.
 *
 * Flight. Progress p runs 0 → 1 over FLIGHT seconds, eased in-out (e). Position goes from where the flight started
 * to the destination box by e, lifting on an arc of height sin(πe)·ARC and shrinking by sin(πe)·SHRINK, as if
 * sucked across. The destination is measured every frame, so it lands exactly even while the page scrolls.
 *
 * Goo. The drawn window chases that flight path on a pair of underdamped springs, so it lags, overshoots and
 * wobbles into place. Its velocity v⃗ deforms it: it stretches along the direction of travel and thins across it
 * (scale 1 + k|v|, 1 − k|v| in the velocity's frame), leans into the turn (skewY ∝ vx) and swings in 3D toward
 * where it is going (rotateY ∝ vx), which together give the pinched, genie-like pull.
 *
 * Screens. Each screen's opacity goes from what it was when the flight began to 1 (destination) or 0 (others)
 * by e, with a little scale, so it reads as a transformation, not a cut. The step text being shown
 * is at full strength; the others dim.
 * ------------------------------------------------------------------------------------------------------------- */
const FLIGHT = 0.95 // seconds
const HYSTERESIS = 40 // px past the midpoint before switching
const ARC = 70 // px the window lifts at mid-flight
const SHRINK = 0.14
const SPRING_K = 140
const SPRING_C = 15 // ζ ≈ 0.63: a soft wobble on arrival
const STRETCH = 1 / 9000 // per px/s of speed
const MAX_STRETCH = 0.16
const LEAN = 1 / 450 // degrees of skewY per px/s
const SWING = 1 / 160 // degrees of rotateY per px/s
const STEP = 1 / 240

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const easeInOut = (x: number) => {
  const k = clamp(x, 0, 1)
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
}

function useDesktop() {
  const query = '(min-width: 768px)'
  const [desktop, setDesktop] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desktop
}

export default function OnboardingSteps({ bonusPct, tiers, minDeposit }: { bonusPct: string; tiers: number; minDeposit: number }) {
  const steps: Step[] = [
    {
      title: 'Create your account',
      text: 'One click with Google, or sign up with your email. Your wallet and personal invite link are ready the moment you are in.',
      skeleton: <SignUpDemo />,
      bleed: true,
    },
    {
      title: 'Make a deposit',
      text: 'Pay with any major coin. It is saved as USDT and your plan starts as soon as the payment confirms.',
      skeleton: <DepositDemo minDeposit={minDeposit} />,
      bleed: true,
    },
    {
      title: 'Collect, every day',
      text: `Yield lands at midnight, every night. Invite friends to earn ${bonusPct} on their deposits and more across ${tiers} tiers.`,
      skeleton: <DashboardDemo />,
      bleed: true,
    },
  ]

  const desktop = useDesktop()
  const container = useRef<HTMLDivElement>(null)
  const slots = useRef<(HTMLDivElement | null)[]>([])
  const texts = useRef<(HTMLDivElement | null)[]>([])
  const box = useRef<HTMLDivElement>(null)
  const screens = useRef<(HTMLDivElement | null)[]>([])
  // bumped each time a screen has faded out, to give it a fresh demo (see the screens loop in the effect)
  const [runs, setRuns] = useState<number[]>(() => steps.map(() => 0))

  useEffect(() => {
    const root = container.current
    if (!desktop || !root) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const n = steps.length
    const spring = { x: 0, y: 0, vx: 0, vy: 0, primed: false }
    // the current flight: from a point (section coordinates) and screen mix, to a step
    const flight = { to: 0, p: 1, fromX: 0, fromY: 0, fromOpacity: Array.from({ length: n }, (_, k): number => (k === 0 ? 1 : 0)) }
    const opacity = [...flight.fromOpacity]
    let path = { x: 0, y: 0, scale: 1 }
    let raf = 0
    let last = 0
    let acc = 0
    let visible = false
    let shownText = -1
    const played = steps.map((_, k) => k === 0) // screens that have been on show since their last reset

    // Layout is measured once (and again on resize), never per frame: the section's position on the page and each
    // box's position inside the section. Per frame, only window.scrollY is read.
    let sectionTop = 0
    let boxes: { x: number; y: number; centre: number; width: number }[] = []
    // offset* positions are layout positions, so the boxes' own reveal slide (a transform) does not skew them
    const measure = () => {
      sectionTop = root.getBoundingClientRect().top + window.scrollY
      boxes = slots.current.map((el) => {
        if (!el) return { x: 0, y: 0, centre: 0, width: 0 }
        let x = 0
        let y = 0
        for (let node: HTMLElement | null = el; node && node !== root; node = node.offsetParent as HTMLElement | null) {
          x += node.offsetLeft
          y += node.offsetTop
        }
        return { x, y, centre: y + el.offsetHeight / 2, width: el.offsetWidth }
      })
    }
    measure()

    // which step the window belongs to now
    const destination = () => {
      const v = window.innerHeight / 2 - (sectionTop - window.scrollY)
      const centres = boxes.map((b) => b.centre)
      let k = flight.to
      while (k < n - 1 && v > (centres[k] + centres[k + 1]) / 2 + HYSTERESIS) k++
      while (k > 0 && v < (centres[k - 1] + centres[k]) / 2 - HYSTERESIS) k--
      return k
    }

    const frame = (now: number) => {
      const el = box.current
      if (!el) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      const next = destination()
      if (next !== flight.to) {
        // commit to a new flight, starting from wherever the window is right now
        Object.assign(flight, { to: next, p: 0, fromX: path.x, fromY: path.y, fromOpacity: [...opacity] })
      }
      flight.p = still ? 1 : Math.min(1, flight.p + dt / FLIGHT)
      const e = easeInOut(flight.p)
      const goal = boxes[flight.to]
      const lift = Math.sin(Math.PI * e)
      path = {
        x: flight.fromX + (goal.x - flight.fromX) * e,
        y: flight.fromY + (goal.y - flight.fromY) * e - lift * ARC,
        scale: 1 - lift * SHRINK,
      }
      if (!spring.primed) {
        // first frame: start parked on the right step with nothing in flight
        Object.assign(flight, { to: next, p: 1 })
        path = { x: goal.x, y: goal.y, scale: 1 }
        opacity.forEach((_, k) => (opacity[k] = k === next ? 1 : 0))
      }
      if (el.style.width !== `${goal.width}px`) el.style.width = `${goal.width}px`

      if (still || !spring.primed) {
        Object.assign(spring, { x: path.x, y: path.y, vx: 0, vy: 0, primed: true })
      } else {
        acc += dt
        while (acc >= STEP) {
          spring.vx += (SPRING_K * (path.x - spring.x) - SPRING_C * spring.vx) * STEP
          spring.vy += (SPRING_K * (path.y - spring.y) - SPRING_C * spring.vy) * STEP
          spring.x += spring.vx * STEP
          spring.y += spring.vy * STEP
          acc -= STEP
        }
      }

      const speed = Math.hypot(spring.vx, spring.vy)
      const stretch = still ? 0 : Math.min(MAX_STRETCH, speed * STRETCH)
      const dir = (Math.atan2(spring.vy, spring.vx) * 180) / Math.PI
      const lean = still ? 0 : clamp(spring.vx * LEAN, -7, 7)
      const swing = still ? 0 : clamp(-spring.vx * SWING, -22, 22)
      el.style.transform =
        `translate3d(${spring.x.toFixed(1)}px, ${spring.y.toFixed(1)}px, 0) perspective(1400px) rotateY(${swing.toFixed(2)}deg) ` +
        `skewY(${lean.toFixed(2)}deg) rotate(${dir.toFixed(2)}deg) scale(${(1 + stretch).toFixed(4)}, ${(1 - stretch).toFixed(4)}) ` +
        `rotate(${(-dir).toFixed(2)}deg) scale(${path.scale.toFixed(4)})`

      // screens: from their mix at take-off to the destination's screen
      screens.current.forEach((s, k) => {
        if (!s) return
        if (spring.primed && flight.p < 1) opacity[k] = flight.fromOpacity[k] + ((k === flight.to ? 1 : 0) - flight.fromOpacity[k]) * e
        else opacity[k] = k === flight.to ? 1 : 0
        const o = opacity[k]
        s.style.opacity = o.toFixed(3)
        s.style.transform = still ? '' : `scale(${(0.96 + 0.04 * o).toFixed(4)})`
        s.style.visibility = o < 0.001 ? 'hidden' : 'visible'
        // a screen nobody can see stops playing (its demo watches this, see usePlaying)
        if (s.hasAttribute('data-idle') !== o < 0.001) s.toggleAttribute('data-idle', o < 0.001)
        // ...and once it has been seen and fades out again, it is replaced by a fresh copy, parked at the start of its loop,
        // so the next time it comes into view it plays from the beginning instead of resuming where it left off
        if (o >= 0.001) played[k] = true
        else if (played[k]) {
          played[k] = false
          setRuns((r) => r.map((v, j) => (j === k ? v + 1 : v)))
        }
      })
      if (shownText !== flight.to) {
        shownText = flight.to
        texts.current.forEach((t, k) => t && (t.style.opacity = k === flight.to ? '1' : '0.35'))
      }

      // sleep once the flight is over and the wobble has died out; scrolling wakes it again
      const resting =
        flight.p >= 1 && Math.abs(spring.vx) < 0.5 && Math.abs(spring.vy) < 0.5 && Math.abs(path.x - spring.x) < 0.1 && Math.abs(path.y - spring.y) < 0.1
      raf = resting ? 0 : requestAnimationFrame(frame)
    }

    // Runs only while the section is on screen and something is moving: scrolling wakes it, and it goes back to
    // sleep on its own once the window has landed and stopped wobbling.
    const wake = () => {
      if (!visible || raf) return
      measure() // content above the section may have changed height while asleep
      last = performance.now()
      acc = 0
      raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        if (visible) wake()
        else {
          cancelAnimationFrame(raf)
          raf = 0
        }
      },
      { rootMargin: '200px 0px' },
    )
    io.observe(root)
    const ro = new ResizeObserver(() => {
      measure()
      wake()
    })
    ro.observe(root)
    window.addEventListener('scroll', wake, { passive: true })
    return () => {
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('scroll', wake)
      cancelAnimationFrame(raf)
      texts.current.forEach((t) => t && (t.style.opacity = ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop])

  return (
    <div ref={container} className="relative space-y-24 sm:space-y-32">
      {steps.map((step, i) => (
        <StepRow
          key={step.title}
          step={step}
          index={i}
          total={steps.length}
          slotRef={(el) => void (slots.current[i] = el)}
          textRef={(el) => void (texts.current[i] = el)}
          desktop={desktop}
        />
      ))}

      {desktop && (
        <div ref={box} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 origin-center will-change-transform">
          <Frame>
            {steps.map((step, i) => (
              <div key={step.title} data-demo-screen ref={(el) => void (screens.current[i] = el)} className="absolute inset-0 will-change-[opacity,transform]" style={{ opacity: i === 0 ? 1 : 0 }}>
                <Screen key={runs[i]} step={step} />
              </div>
            ))}
          </Frame>
        </div>
      )}
    </div>
  )
}
