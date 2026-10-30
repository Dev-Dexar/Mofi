import { useEffect, useRef, type ReactNode } from 'react'

// Where the burst starts inside the 7s loop (the keyframes in index.css glitch from 90% on)
const BURST_AT_MS = 6300

/**
 * Text (or, with `mask`, a picture) with a CRT glitch: faint scanlines always, and every few seconds a short burst where red and cyan copies of the
 * text jump sideways in sliced bands. Pointing at the surrounding link plays the burst at once. CSS only (index.css,
 * `.glitch`); stepped keyframes, so the browser repaints at each jump rather than every frame.
 */
export default function GlitchText({
  children,
  className = '',
  mask,
}: {
  children: ReactNode
  className?: string
  /** For a picture (the logo): the image whose shape the red and cyan copies take, instead of copying the text */
  mask?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    const host = el?.closest('a') ?? el
    if (!el || !host) return
    const burst = () => el.getAnimations({ subtree: true }).forEach((a) => (a.currentTime = BURST_AT_MS))
    host.addEventListener('pointerenter', burst)
    return () => host.removeEventListener('pointerenter', burst)
  }, [])

  return (
    <span ref={ref} className={`glitch ${className}`}>
      <span className={`glitch-main ${mask ? 'size-full' : ''}`}>{children}</span>
      {(['glitch-r', 'glitch-c'] as const).map((tint) =>
        mask ? (
          <span key={tint} aria-hidden="true" className={`glitch-copy glitch-mask ${tint}`} style={{ maskImage: `url(${mask})` }} />
        ) : (
          <span key={tint} aria-hidden="true" className={`glitch-copy ${tint}`}>{children}</span>
        ),
      )}
    </span>
  )
}
