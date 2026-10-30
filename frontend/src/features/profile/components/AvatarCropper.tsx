import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

const VIEW = 264 // the square the photo is framed in, in CSS pixels
const MAX_ZOOM = 4

/**
 * Frame the photo before it is saved: drag to move it, pinch / scroll / slider to zoom. The circle is what the profile
 * will show; the part of the photo under the square is what is kept. The photo always covers the frame.
 */
export default function AvatarCropper({
  bitmap,
  busy,
  onCancel,
  onSave,
}: {
  bitmap: ImageBitmap
  busy: boolean
  onCancel: () => void
  onSave: (area: { x: number; y: number; size: number }) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const cover = Math.max(VIEW / bitmap.width, VIEW / bitmap.height) // scale at which the photo just covers the frame
  // zoom 1 = cover; pos = where the photo's top-left corner sits in the frame
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState(() => ({ x: (VIEW - bitmap.width * cover) / 2, y: (VIEW - bitmap.height * cover) / 2 }))
  const view = useRef({ zoom, pos })
  view.current = { zoom, pos }

  const clamp = useCallback(
    (z: number, p: { x: number; y: number }) => {
      const s = cover * z
      return { x: Math.min(0, Math.max(VIEW - bitmap.width * s, p.x)), y: Math.min(0, Math.max(VIEW - bitmap.height * s, p.y)) }
    },
    [bitmap, cover],
  )

  // zoom about a point of the frame (its middle for the slider), so what is under it stays put
  const zoomTo = useCallback(
    (next: number, about = { x: VIEW / 2, y: VIEW / 2 }) => {
      const { zoom: z, pos: p } = view.current
      const target = Math.min(MAX_ZOOM, Math.max(1, next))
      const k = target / z
      setZoom(target)
      setPos(clamp(target, { x: about.x - (about.x - p.x) * k, y: about.y - (about.y - p.y) * k }))
    },
    [clamp],
  )

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    c.width = c.height = Math.round(VIEW * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, VIEW, VIEW)
    const s = cover * zoom
    ctx.drawImage(bitmap, pos.x, pos.y, bitmap.width * s, bitmap.height * s)
  }, [bitmap, cover, zoom, pos])

  // Dragging, and pinching with two fingers
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number } | null>(null)
  const local = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * VIEW, y: ((e.clientY - r.top) / r.height) * VIEW }
  }
  const onDown = (e: React.PointerEvent) => {
    stage.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, local(e))
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.current.zoom }
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const now = local(e)
    pointers.current.set(e.pointerId, now)
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      zoomTo(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    } else if (pointers.current.size === 1) {
      const { zoom: z, pos: p } = view.current
      setPos(clamp(z, { x: p.x + now.x - prev.x, y: p.y + now.y - prev.y }))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  // Scrolling over the frame zooms instead of scrolling the window (a listener of our own, so it can cancel the scroll)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomTo(view.current.zoom * Math.exp(-e.deltaY * 0.0015), local(e))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [zoomTo])

  const save = () => {
    const s = cover * zoom
    onSave({ x: -pos.x / s, y: -pos.y / s, size: VIEW / s })
  }

  return (
    <div className="flex flex-1 flex-col items-center text-center">
      <div
        ref={stage}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-black/40 active:cursor-grabbing"
        style={{ width: VIEW, height: VIEW, maxWidth: '100%' }}
      >
        <canvas ref={canvas} className="size-full" aria-label="Your photo. Drag to move it." />
        {/* what is outside the circle is dimmed; the circle is what the profile shows */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(circle closest-side at center, transparent 95.5%, rgba(10,10,10,0.62) 96.2%)' }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-[2%] rounded-full ring-1 ring-ink/60" />
      </div>

      <label className="mt-5 flex w-full max-w-[16.5rem] items-center gap-3 text-xs text-muted">
        <span className="shrink-0">Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
          aria-label="Zoom"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink/15 accent-primary"
        />
      </label>

      <div className="mt-auto flex w-full gap-2 pt-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-11 flex-1 rounded-full bg-danger/10 text-sm font-bold text-danger transition-[background-color,transform,scale,translate] hover:bg-danger/25 active:scale-95 active:bg-danger/35"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex h-11 flex-[1.6] items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-[color:var(--color-base)] transition-transform active:scale-95 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {busy ? 'Saving…' : 'Save photo'}
        </button>
      </div>
    </div>
  )
}
