import { useEffect, useRef, useState, type RefObject } from 'react'
import { CursorIcon } from '@/icons'

/** A demo's CSS loop: `name`'s keyframes over `ms`, forever. Every keyframe and the pointer use fractions of the same loop, so they stay in sync. */
export const loop = (name: string, ms: number) => ({ animation: `${name} ${ms}ms linear infinite` })

/*
 * The pointer that acts a demo out. It is driven by the Web Animations API on the same clock as the demo's CSS
 * loop (its start time is copied from the loop's own animation), so its clicks land exactly when each target
 * reacts. Its path is measured from the real elements (offset positions, which ignore the travelling
 * window's transforms), so it stays on target at any size.
 *
 * A click (fractions of the loop): the pointer arrives `approach` before `at`, dips and sends out a ripple from its
 * tip at `at`, and rests there until `leave`. After the last one (or one marked `fade`) it drifts off and fades (by
 * `leave` + 0.08); after a `fade` the next click brings it back in from the corner.
 */
export interface DemoClick {
  target: string // data-demo name
  fx: number // where on the target, as fractions of its width and height
  fy: number
  at: number
  leave: number
  approach?: number
  /** drift off and fade after it, and come back in from the corner for the next one */
  fade?: boolean
  /** the target is in the maximised card (see DepositDemo) */
  popped?: boolean
}
const MOVE = 'cubic-bezier(0.45, 0, 0.2, 1)'

export function DemoPointer({
  root,
  sync,
  playing,
  clicks,
  duration,
  place,
  layoutKey,
}: {
  root: RefObject<HTMLDivElement | null>
  sync: RefObject<HTMLSpanElement | null>
  playing: boolean
  clicks: DemoClick[]
  duration: number
  /** where a point in the root's coordinates is in the pointer's own layer, when that is not the root itself (a scaled demo) */
  place?: (p: { x: number; y: number }, click?: DemoClick) => { x: number; y: number }
  /** changes whenever `place` would give different answers, so the path is measured again */
  layoutKey?: string
}) {
  const pointer = useRef<HTMLDivElement>(null)
  const ripple = useRef<HTMLSpanElement>(null)
  const anims = useRef<Animation[]>([])

  useEffect(() => {
    const host = root.current
    const el = pointer.current
    const rp = ripple.current
    if (!host || !el || !rp || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // a point on a target, in the host's coordinates; fx/fy are fractions of the target's width/height
    const at = (name: string, fx: number, fy: number) => {
      const t = host.querySelector<HTMLElement>(`[data-demo="${name}"]`)
      if (!t) return { x: 0, y: 0 }
      let x = 0
      let y = 0
      for (let node: HTMLElement | null = t; node && node !== host; node = node.offsetParent as HTMLElement | null) {
        x += node.offsetLeft
        y += node.offsetTop
      }
      return { x: x + t.offsetWidth * fx, y: y + t.offsetHeight * fy }
    }

    const build = () => {
      anims.current.forEach((a) => a.cancel())
      const map = place ?? ((p: { x: number; y: number }) => p)
      const start = map({ x: host.offsetWidth * 0.95, y: host.offsetHeight * 1.08 })
      const k = (offset: number, p: { x: number; y: number }, scale = 1, opacity = 1): Keyframe => ({
        offset,
        transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${scale})`,
        opacity,
        easing: MOVE,
      })

      const frames: Keyframe[] = [k(0, start, 1, 0)]
      let away = true // out of sight, in the corner it comes in from
      for (const [i, c] of clicks.entries()) {
        const p = map(at(c.target, c.fx, c.fy), c)
        const arrive = c.at - (c.approach ?? 0.012)
        if (away) frames.push(k(i === 0 ? 0.03 : arrive - 0.06, start, 1, i === 0 ? 1 : 0))
        frames.push(k(arrive, p), k(c.at - 0.006, p), k(c.at, p, 0.8), k(c.at + 0.015, p), k(c.leave, p))
        away = !!c.fade || i === clicks.length - 1
        if (away) frames.push(k(c.leave + 0.08, { x: p.x + 26, y: p.y + 34 }, 1, 0))
      }
      frames.push(k(1, start, 1, 0))

      const rippleFrames: Keyframe[] = [{ offset: 0, opacity: 0, transform: 'scale(0.2)' }]
      for (const c of clicks) {
        rippleFrames.push(
          { offset: c.at - 0.001, opacity: 0, transform: 'scale(0.2)' },
          { offset: c.at, opacity: 0.7, transform: 'scale(0.3)', easing: 'ease-out' },
          { offset: c.at + 0.035, opacity: 0, transform: 'scale(2)' },
        )
      }
      rippleFrames.push({ offset: 1, opacity: 0, transform: 'scale(0.2)' })

      const timing = { duration, iterations: Infinity }
      anims.current = [el.animate(frames, timing), rp.animate(rippleFrames, timing)]
      resync()
    }

    build()
    const ro = new ResizeObserver(build)
    ro.observe(host)
    return () => {
      ro.disconnect()
      anims.current.forEach((a) => a.cancel())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, sync, layoutKey])

  // run on the CSS loop's clock, so the clicks land on their targets
  const resync = () => {
    const ref = sync.current?.getAnimations()[0]
    if (ref) ref.ready.then(() => anims.current.forEach((a) => (a.startTime = ref.startTime)))
  }

  // paused together with the CSS loop while off screen, and lined up with it again on the way back
  useEffect(() => {
    if (!playing) anims.current.forEach((a) => a.pause())
    else resync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  return (
    <div ref={pointer} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-40 origin-top-left opacity-0">
      <span ref={ripple} className="absolute -left-2.5 -top-2.5 size-5 rounded-full border-2 border-primary opacity-0" />
      {/* brand cursor: a soft rounded arrowhead in green with a white edge, tip at the origin, carrying a name tag */}
      <CursorIcon className="relative -left-px -top-px drop-shadow-[0_2px_4px_color-mix(in_srgb,var(--color-shade)_55%,transparent)]" />
      <span className="absolute left-3 top-3.5 whitespace-nowrap rounded-full rounded-tl-sm bg-primary px-1.5 py-[3px] text-[8px] font-bold leading-none text-[color:var(--color-base)] shadow-[0_2px_6px_color-mix(in_srgb,var(--color-shade)_45%,transparent)]">
        Alex
      </span>
    </div>
  )
}

/** The loop only runs while it can be seen: on screen, and (in the travelling window) not on a screen that is faded out */
export function usePlaying(el: RefObject<HTMLDivElement | null>) {
  const [playing, setPlaying] = useState(true)
  useEffect(() => {
    const node = el.current
    if (!node) return
    const screen = node.closest('[data-demo-screen]')
    let onScreen = true
    const update = () => setPlaying(onScreen && !screen?.hasAttribute('data-idle'))
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      update()
    })
    io.observe(node)
    const mo = screen ? new MutationObserver(update) : null
    if (screen) mo?.observe(screen, { attributes: true, attributeFilter: ['data-idle'] })
    return () => {
      io.disconnect()
      mo?.disconnect()
    }
  }, [el])
  return playing
}
