import { useEffect, useId, useRef, useState } from 'react'

/**
 * A small line with a wash beneath it and a dot on the latest value: the shape of a level over time, with no axes (the figure beside it
 * says where it stands). It fills the box it is given. The scale runs from the lowest value to the highest, so a level that only drifts
 * between 1.5M and 1.9M still shows its climb (starting the scale at zero would flatten it); one that never moves is a flat line, on the
 * floor when it is zero.
 */
export default function Sparkline({
  values,
  color,
  label,
  minHeight = 80,
  emptyText = 'Growth will show here',
}: {
  values: number[]
  color: string
  label: string
  minHeight?: number
  /** said over the chart while there is nothing to draw (every value zero) */
  emptyText?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, '')
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const n = values.length
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const top = 14 // room above the highest point for the dot
  const floor = h - 10
  const right = 8 // and to the right of the last one
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * (w - right) : (w - right) / 2)
  const y = (v: number) => (hi === lo ? (v === 0 ? floor : (top + floor) / 2) : floor - ((v - lo) / (hi - lo)) * (floor - top))
  // Nothing held yet: a line on the floor says nothing, so the frame shows a faint dashed rise (a drawing, not data) and a line of words
  const empty = n > 0 && hi === 0 && lo === 0
  const ghost = [0.1, 0.22, 0.3, 0.48, 0.62, 0.8].map((f, i, a) => `${i ? 'L' : 'M'}${((i / (a.length - 1)) * (w - right)).toFixed(1)},${(floor - f * (floor - top)).toFixed(1)}`).join(' ')
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  return (
    <div ref={box} style={{ minHeight }} className="relative w-full flex-1">
      {w > 0 && h > 0 && n > 0 && (
        <svg width={w} height={h} className="absolute left-0 top-0 block overflow-visible" role="img" aria-label={label}>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.22} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {empty ? (
            <path d={ghost} fill="none" stroke="#fff" strokeOpacity={0.16} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
          ) : (
            <>
              <path d={`${line} L${x(n - 1)},${h} L${x(0)},${h} Z`} fill={`url(#${id})`} />
              <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(n - 1)} cy={y(values[n - 1])} r={4} fill={color} stroke="#111318" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
      {empty && <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs text-muted">{emptyText}</p>}
    </div>
  )
}
