import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A pill track with a thumb that slides (with a little spring) to the open tab, the way the wallet's Deposit / Withdraw switch does.
 * The thumb is measured from the tab itself, so labels of different lengths (and counts that change a tab's width) still fit, and it
 * is re-measured if the track is resized. The first paint puts it in place without sliding. `fill` shares the track out evenly;
 * without it the tabs are only as wide as their labels. When there is not room, the track scrolls sideways rather than squeezing.
 */
export default function SlideTabs<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  fill = true,
  glass = false,
}: {
  value: T
  options: { value: T; label: ReactNode; count?: number }[]
  onChange: (v: T) => void
  label: string
  size?: 'md' | 'sm'
  fill?: boolean
  /** a floating look for use over scrolling content: see-through, blurred and lightly outlined */
  glass?: boolean
}) {
  const track = useRef<HTMLDivElement>(null)
  const els = useRef(new Map<T, HTMLButtonElement>())
  const [thumb, setThumb] = useState({ left: 0, width: 0 })
  const [slide, setSlide] = useState(false) // off for the first placement, so it does not slide in from the corner

  const current = useRef(value)
  current.current = value // the resize observer below outlives a render, so it must read the open tab from here, not from the render it was made in
  const measure = () => {
    const el = els.current.get(current.current)
    if (el) setThumb((t) => (t.left === el.offsetLeft && t.width === el.offsetWidth ? t : { left: el.offsetLeft, width: el.offsetWidth }))
  }
  const key = options.map((o) => `${o.value}${o.count ?? ''}`).join('|')
  useLayoutEffect(measure, [value, key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = requestAnimationFrame(() => setSlide(true))
    const ro = new ResizeObserver(measure)
    if (track.current) ro.observe(track.current)
    return () => {
      cancelAnimationFrame(id)
      ro.disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={track}
      role="tablist"
      aria-label={label}
      className={`relative flex max-w-full overflow-x-auto rounded-full p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        glass ? 'bg-surface/70 ring-1 ring-inset ring-ink/[0.08] backdrop-blur-xl' : 'bg-ink/[0.04]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0.5 rounded-full bg-ink/10 ${slide ? 'transition-[left,width] duration-[450ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]' : ''}`}
        style={{ left: thumb.left, width: thumb.width }}
      />
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              if (el) els.current.set(o.value, el)
              else els.current.delete(o.value)
            }}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`relative z-10 flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-ink/40 ${
              size === 'sm' ? 'h-8 px-3.5 text-xs' : 'h-9 px-4 text-[13px]'
            } ${fill ? 'flex-1' : ''} ${on ? 'text-text' : 'text-muted hover:text-text'}`}
          >
            {o.label}
            {!!o.count && <span className={`text-[11px] font-bold tabular-nums transition-colors ${on ? 'text-primary' : 'text-muted/70'}`}>{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
