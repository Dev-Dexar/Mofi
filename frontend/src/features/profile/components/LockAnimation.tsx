import { useEffect, useRef } from 'react'

/**
 * The padlock is a Lottie (public/animations/lock-unlock-key.json): a key slides in, turns, and the shackle opens at frame
 * ~70; it turns back and the shackle shuts at frame ~105; the key leaves. That clip holds BOTH directions, so each
 * mode plays only its own stretch of it, as drawn, with nothing added around it.
 */
const FPS = 60
// the stretch of the clip each mode plays, and the frame at which the shackle moves
const CLIP = {
  on: { from: 84, to: 156, click: 114 }, // key already in the lock, shackle open: it turns, the shackle shuts, the key leaves
  off: { from: 0, to: 100, click: 66 }, // key arrives, turns, the shackle opens
} as const

/** Seconds into the clip at which the shackle moves: what the rest of the screen times itself to */
export const lockClickSeconds = (mode: 'on' | 'off') => (CLIP[mode].click - CLIP[mode].from) / FPS

/** Starts fetching the player and the clip, so the animation begins the instant it is needed instead of after a download */
export const preloadLockAnimation = () => {
  void import('lottie-web/build/player/lottie_light')
  void clip()
}

// fetched once, from public/animations next to the rocket
let clipRequest: Promise<unknown> | undefined
const clip = () => (clipRequest ??= fetch('/animations/lock-unlock-key.json').then((r) => r.json()))

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The clip only has its white burst where the shackle opens (frames 66 to 82). A copy of that layer, moved later so it
 * starts as the shackle lands shut (frame 114, where the clip's own thump is), gives locking the same burst.
 */
const LOCK_FLASH_SHIFT = 48
function withLockFlash(source: unknown) {
  const data = structuredClone(source) as { layers: { ind: number; ip: number; op: number; ks: unknown; shapes: unknown }[] }
  const burst = data.layers.find((l) => l.ind === 1)
  if (!burst) return data
  const copy = structuredClone(burst)
  copy.ind = Math.max(...data.layers.map((l) => l.ind)) + 1
  copy.ip += LOCK_FLASH_SHIFT
  copy.op += LOCK_FLASH_SHIFT
  const shift = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(shift)
    if (!node || typeof node !== 'object') return
    const o = node as { t?: unknown }
    if (typeof o.t === 'number') o.t += LOCK_FLASH_SHIFT // a keyframe
    Object.values(node).forEach(shift)
  }
  shift(copy.ks)
  shift(copy.shapes)
  data.layers.splice(data.layers.indexOf(burst) + 1, 0, copy)
  return data
}

/** Plays this mode's stretch of the Lottie once and holds the last frame. Loaded on demand so it stays out of the main bundle. */
function LockLottie({ mode }: { mode: 'on' | 'off' }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let anim: { destroy: () => void } | undefined
    let gone = false
    void Promise.all([import('lottie-web/build/player/lottie_light'), clip()]).then(([lottie, json]) => {
      if (gone || !box.current) return
      const { from, to } = CLIP[mode]
      const still = prefersReducedMotion()
      const a = lottie.default.loadAnimation({
        container: box.current,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        animationData: withLockFlash(json),
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      })
      a.addEventListener('DOMLoaded', () => (still ? a.goToAndStop(to, true) : a.playSegments([from, to], true)))
      anim = a
    })
    return () => {
      gone = true
      anim?.destroy()
    }
  }, [mode])
  return <div ref={box} className="absolute inset-0" aria-hidden="true" />
}

export default function LockAnimation({ mode, className = 'size-44' }: { mode: 'on' | 'off'; className?: string }) {
  const on = mode === 'on'
  // when the shackle moves, seconds from the start of this mode's stretch of the clip
  const I = lockClickSeconds(mode)
  return (
    <div className={`relative ${className}`} role="img" aria-label={on ? 'Two-factor authentication switched on' : 'Two-factor authentication switched off'}>
      <div className="lock-bump absolute inset-0" style={{ animationDelay: `${I}s` }}>
        <LockLottie mode={mode} />
      </div>
    </div>
  )
}
