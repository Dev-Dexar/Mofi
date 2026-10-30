import type { Artboard, File as RiveFile, RiveCanvas } from '@rive-app/canvas-advanced'
import wasmUrl from '@rive-app/canvas-advanced/rive.wasm?url'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { MascotRig, type Burst, type VoltMood } from './rig'

export interface MascotHandle {
  hop: (power?: number) => void
  flip: () => void
  shine: () => void
  burst: (kind: Burst, n?: number) => void
  flash: (mood: VoltMood, ms: number) => void
}

// The runtime and the file are fetched once, on first use, and shared by every mascot on the page. Kept out of the main bundle.
let runtime: Promise<{ rive: RiveCanvas; file: RiveFile }> | undefined
const load = () =>
  (runtime ??= (async () => {
    const [{ default: RiveRuntime }, bytes] = await Promise.all([
      import('@rive-app/canvas-advanced'),
      fetch('/animations/mascot.riv').then((r) => r.arrayBuffer()),
    ])
    const rive = await RiveRuntime({ locateFile: () => wasmUrl })
    const file = await rive.load(new Uint8Array(bytes))
    return { rive, file }
  })())

/** Starts fetching the runtime and the file, so the mascot is ready the moment it is needed */
export const preloadMascot = () => void load().catch(() => {})

/**
 * The canvases are larger than the mascot's own box so nothing it does is cut off at its edge: a jump, raised arms, coins flying out. These
 * are the extra room on each side, as a share of the box, and the mascot is drawn into the middle of it.
 */
const ROOM = { left: 0.5, right: 0.5, top: 1.1, bottom: 0.2 }

const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Draws the mascot: the Rive artwork, posed every frame by the rig, with the eye, hands, light, accessories and particles painted around
 * it on the same canvas. Runs only while it can be seen. If the runtime or the file cannot load, a plain badge stands in.
 */
const Mascot = forwardRef<MascotHandle, { mood: VoltMood; talking: boolean; className?: string }>(function Mascot(
  { mood, talking, className = 'size-36' },
  handle,
) {
  const wrap = useRef<HTMLDivElement>(null)
  const backLayer = useRef<HTMLCanvasElement>(null)
  const riveLayer = useRef<HTMLCanvasElement>(null)
  const frontLayer = useRef<HTMLCanvasElement>(null)
  const rig = useRef<MascotRig | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let dead = false
    let board: Artboard | undefined
    let stop = () => {}
    ;(async () => {
      let loaded: Awaited<ReturnType<typeof load>>
      try {
        loaded = await load()
      } catch {
        if (!dead) setFailed(true)
        return
      }
      const el = riveLayer.current
      const backEl = backLayer.current
      const frontEl = frontLayer.current
      if (dead || !el || !backEl || !frontEl) return
      const layers = [backEl, el, frontEl]
      const { rive, file } = loaded
      board = file.defaultArtboard()
      const renderer = rive.makeRenderer(el)
      const back = backEl.getContext('2d')
      const front = frontEl.getContext('2d')
      if (!back || !front) return
      const reduced = prefersReduced()
      const r = new MascotRig(rive, board, reduced)
      rig.current = r

      let frame = { minX: 0, minY: 0, maxX: 1, maxY: 1 }
      const fit = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.round(el.clientWidth * dpr))
        const h = Math.max(1, Math.round(el.clientHeight * dpr))
        frame = {
          minX: (w * ROOM.left) / (1 + ROOM.left + ROOM.right),
          maxX: (w * (1 + ROOM.left)) / (1 + ROOM.left + ROOM.right),
          minY: (h * ROOM.top) / (1 + ROOM.top + ROOM.bottom),
          maxY: (h * (1 + ROOM.top)) / (1 + ROOM.top + ROOM.bottom),
        }
        for (const c of layers)
          if (c.width !== w || c.height !== h) {
            c.width = w
            c.height = h
          }
        r.resize(frame)
      }
      fit()
      const ro = new ResizeObserver(() => {
        fit()
        if (!running) paint(0)
      })
      ro.observe(el)

      let running = false
      let raf = 0
      let last = 0
      const paint = (dt: number) => {
        if (!board) return
        r.update(dt)
        back.clearRect(0, 0, el.width, el.height)
        front.clearRect(0, 0, el.width, el.height)
        r.drawBack(back)
        renderer.clear()
        renderer.save()
        renderer.align(rive.Fit.contain, rive.Alignment.center, frame, board.bounds)
        board.draw(renderer)
        renderer.restore()
        r.drawFront(front)
      }
      const tick = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.05)
        last = now
        paint(dt)
        raf = rive.requestAnimationFrame(tick)
      }
      const start = () => {
        if (running || reduced) return
        running = true
        last = performance.now()
        raf = rive.requestAnimationFrame(tick)
      }
      const halt = () => {
        running = false
        rive.cancelAnimationFrame(raf)
      }

      // only run while it can be seen
      let onScreen = true
      let shown = !document.hidden
      const sync = () => (onScreen && shown ? start() : halt())
      const io = new IntersectionObserver(([e]) => {
        onScreen = e.isIntersecting
        sync()
      })
      io.observe(el)
      const vis = () => {
        shown = !document.hidden
        sync()
      }
      document.addEventListener('visibilitychange', vis)

      // the eye follows the pointer
      let look = 0
      const move = (e: PointerEvent) => {
        cancelAnimationFrame(look)
        look = requestAnimationFrame(() => {
          const b = (wrap.current ?? el).getBoundingClientRect() // the mascot's own box, not the larger canvas
          const dx = e.clientX - (b.left + b.width * 0.55)
          const dy = e.clientY - (b.top + b.height * 0.32)
          const len = Math.hypot(dx, dy) || 1
          const k = Math.min(1, len / 180) / len
          r.look(dx * k, dy * k)
        })
      }
      window.addEventListener('pointermove', move, { passive: true })

      r.setMood(mood)
      if (reduced) paint(0.016)
      else start()

      stop = () => {
        halt()
        io.disconnect()
        ro.disconnect()
        document.removeEventListener('visibilitychange', vis)
        window.removeEventListener('pointermove', move)
        cancelAnimationFrame(look)
        r.destroy()
        rig.current = null
        board?.delete()
        board = undefined
      }
    })()
    return () => {
      dead = true
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => rig.current?.setMood(mood), [mood])
  useEffect(() => rig.current?.setTalking(talking), [talking])

  useImperativeHandle(handle, () => ({
    hop: (p) => rig.current?.hop(p),
    flip: () => rig.current?.flip(),
    shine: () => rig.current?.shine(),
    burst: (k, n) => rig.current?.burst(k, n),
    flash: (m, ms) => rig.current?.flash(m, ms),
  }))

  if (failed)
    return (
      <div className={`${className} grid place-items-center`} role="img" aria-label={`Mo, your referral companion`}>
        <span className="grid size-20 place-items-center rounded-full bg-primary/15 text-3xl font-black text-primary">M</span>
      </div>
    )
  // three layers on one spot: what goes behind the artwork, the artwork, and what goes over it
  const layer = {
    left: `${-ROOM.left * 100}%`,
    top: `${-ROOM.top * 100}%`,
    width: `${(1 + ROOM.left + ROOM.right) * 100}%`,
    height: `${(1 + ROOM.top + ROOM.bottom) * 100}%`,
  }
  return (
    <div ref={wrap} className={`relative ${className}`} role="img" aria-label="Mo, your referral companion">
      <canvas ref={backLayer} className="pointer-events-none absolute" style={layer} />
      <canvas ref={riveLayer} className="pointer-events-none absolute" style={layer} />
      <canvas ref={frontLayer} className="pointer-events-none absolute" style={layer} />
    </div>
  )
})

export default Mascot
