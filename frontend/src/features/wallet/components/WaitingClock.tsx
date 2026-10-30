import { useEffect, useRef } from 'react'

/**
 * The clock is a Lottie (public/animations/waiting-clock.json, "Clock_loop", 1080 x 1080 at 30 fps).
 *
 *   frames 0 - 44     intro: the ring draws itself, the disc pops and fills yellow, the two white hands draw out from the pivot
 *   frames 44 - 202   the loop: the minute hand turns 5 times and the hour hand twice (both start and end at 12), and three
 *                     yellow ripples spread out from the disc and fade. Frame 202 is the same picture as frame 44.
 *
 * Waiting plays the intro once and then loops. When the payout is settled the clock is turned into the result: whatever frame it is
 * on, a copy of the clip is built that starts from exactly that picture (same hand angles, same ripples) and carries on with
 * a green disc growing out from the centre over the yellow one (a plain colour blend would pass through a muddy olive), the hands
 * slowing down and drawing back into the pivot, and a tick drawing itself in their place, with a last ripple going out. (A failure is the same in red, with a cross.) Same approach as the
 * padlock: the clip is rewritten in code as it is loaded, nothing is added around it.
 */
const FIRST = 44
const LAST = 202
const END = 54 // length of the closing clip, in frames (1.8 s)

const YELLOW = [0.9843, 0.7373, 0.0196]
const GREEN = [0.0627, 0.7255, 0.5059] // --color-primary
const RED = [0.9373, 0.2667, 0.2667] // --color-danger

// fetched once
let clipRequest: Promise<unknown> | undefined
const clip = () => (clipRequest ??= fetch('/animations/waiting-clock.json').then((r) => r.json()))
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Starts fetching the player and the clip so the clock is there the moment the scene is */
export const preloadWaitingClock = () => {
  void import('lottie-web/build/player/lottie_light')
  void clip()
}

type Json = any // eslint-disable-line @typescript-eslint/no-explicit-any

// ---- building the closing clip --------------------------------------------------------------------------------------------
const same = (n: number, v: number) => Array.from({ length: n }, () => v)
/** a keyframe's easing, for a property with n numbers */
const ease = (n: number, ox = 0.4, oy = 0, ix = 0.2, iy = 1) => ({ o: { x: same(n, ox), y: same(n, oy) }, i: { x: same(n, ix), y: same(n, iy) } })
const track = (...keys: { t: number; s: number[]; easing?: ReturnType<typeof ease> }[]) => ({
  a: 1,
  k: keys.map((k, idx) => ({ t: k.t, s: k.s, ...(idx < keys.length - 1 ? (k.easing ?? ease(k.s.length)) : {}) })),
})
const still = (k: unknown) => ({ a: 0, k })
const rgb = (c: number[]) => [...c]

const xform0 = () => ({ ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0) })

function shift(node: unknown, by: number) {
  if (Array.isArray(node)) return node.forEach((n) => shift(n, by))
  if (!node || typeof node !== 'object') return
  const o = node as { t?: unknown }
  if (typeof o.t === 'number') o.t += by // a keyframe
  Object.values(node).forEach((n) => shift(n, by))
}

/** The clip from frame `f` of the loop onward, ending in the result (`sent`: green and a tick, `failed`: red and a cross) */
function closingClip(source: unknown, f: number, outcome: 'sent' | 'failed', instant = false) {
  const data = structuredClone(source) as Json
  const tone = outcome === 'sent' ? GREEN : RED
  data.ip = 0
  data.op = END
  const byName = (nm: string) => data.layers.find((l: Json) => l.nm === nm)
  const cleanup: Json[] = []

  // where the hands are at frame f (they turn at a steady speed: 1800 and 720 degrees over the loop)
  const loop = LAST - FIRST
  const t = f - FIRST
  const hands = [
    { layer: byName('Shape Layer 3'), angle: -45 + (1800 * t) / loop, speed: 1800 / loop, from: 0 }, // the minute hand: trimmed 0 - 50 %
    { layer: byName('Shape Layer 2'), angle: -45 + (720 * t) / loop, speed: 720 / loop, from: 20 }, // the hour hand: trimmed 20 - 50 %
  ]
  const RETRACT = 10
  for (const h of hands) {
    const L = h.layer
    L.ip = 0
    L.op = END
    // keep turning at the same speed, slowing to a stop as it is drawn back into the pivot (50 % of the path is the pivot)
    const travel = h.speed * RETRACT * 0.5
    L.ks.r = track({ t: 0, s: [h.angle], easing: { o: { x: [0.25], y: [0.5] }, i: { x: [0.58], y: [1] } } }, { t: RETRACT, s: [h.angle + travel] })
    const trim = L.shapes.find((s: Json) => s.ty === 'tm')
    trim.s = track({ t: 0, s: [h.from] }, { t: 1, s: [h.from], easing: ease(1, 0.45, 0, 0.25, 1) }, { t: RETRACT, s: [50] })
    // what is left of the stroke is a round dot: it goes with the last of the retraction
    L.ks.o = track({ t: RETRACT - 2, s: [100], easing: ease(1, 0.3, 0, 0.7, 1) }, { t: RETRACT + 1, s: [0] })
  }

  // the disc stays yellow and is covered by the result colour, which grows out from the centre (and swells a touch at the end)
  const disc = byName('Bulet')
  disc.ip = 0
  disc.op = END
  disc.ks.s = still([100, 100, 100])
  const base = disc.shapes.find((s: Json) => s.ty === 'fl')
  base.o = still(100)
  disc.shapes[0].it.find((s: Json) => s.ty === 'tm').s = still(100) // the ring is already drawn
  const wipe = {
    ddd: 0,
    ind: 80,
    ty: 4,
    nm: 'Wipe',
    sr: 1,
    ks: {
      o: still(100),
      r: still(0),
      p: still([540, 540, 0]),
      a: still([0, 0, 0]),
      // the ring's outer diameter is 611.5; a hair more, so no yellow fringe is left round the edge
      s: track(
        { t: 0, s: [0, 0, 100], easing: ease(3, 0.3, 0, 0.12, 1) },
        { t: 13, s: [104, 104, 100], easing: ease(3, 0.3, 0, 0.5, 1) },
        { t: 22, s: [100, 100, 100] },
      ),
    },
    ao: 0,
    shapes: [
      { ty: 'gr', it: [{ ty: 'el', d: 1, p: still([0, 0]), s: still([617, 617]) }, { ty: 'fl', c: still(rgb(tone)), o: still(100), r: 1 }, xform0()] },
    ],
    ip: 0,
    op: END,
    st: 0,
    bm: 0,
  }
  data.layers.splice(data.layers.indexOf(disc), 0, wipe) // just above the yellow disc, under the hands and the glyph
  const recolour = (item: Json) => {
    item.c = track({ t: 0, s: rgb(YELLOW) }, { t: 9, s: rgb(tone), easing: ease(3, 0.4, 0, 0.2, 1) })
  }

  // the ripples that are in the air at frame f carry on, in the result colour; ones that have not started yet are dropped
  for (const nm of ['Bayang 3', 'Bayang 4', 'Bayang 2']) {
    const L = byName(nm)
    if (!L) continue
    if (L.op - f <= 0 || L.ip - f > 0) {
      cleanup.push(L)
      continue
    }
    shift(L.ks, -f)
    L.ip = Math.max(0, L.ip - f)
    L.op = L.op - f
    recolour(L.shapes.find((s: Json) => s.ty === 'fl'))
  }
  data.layers = data.layers.filter((l: Json) => !cleanup.includes(l))

  // one last ripple as the result arrives
  const template = structuredClone(source as Json).layers.find((l: Json) => l.nm === 'Bayang 3')
  template.ind = 90
  template.ip = 9
  template.op = END
  template.ks.o = track({ t: 9, s: [70], easing: ease(1, 0.2, 0, 0.6, 1) }, { t: 48, s: [0] })
  template.ks.s = track({ t: 9, s: [100, 100, 100], easing: ease(3, 0.2, 0, 0.4, 1) }, { t: 48, s: [172, 172, 100] })
  const fill = template.shapes.find((s: Json) => s.ty === 'fl')
  fill.c = still(rgb(tone))
  fill.o = still(45)
  data.layers.push(template)

  // the glyph that takes the hands' place: a tick (sent) or a cross (failed), drawn in white like the hands
  const stroke = (cap = 2) => ({ ty: 'st', c: still([1, 1, 1]), o: still(100), w: still(62), lc: cap, lj: 2, ml: 1 })
  const xform = xform0()
  const stroke2 = (vertices: number[][], at: number, len: number) => ({
    ty: 'gr',
    it: [
      { ty: 'sh', ks: still({ c: false, i: vertices.map(() => [0, 0]), o: vertices.map(() => [0, 0]), v: vertices }) },
      stroke(),
      xform,
    ],
    // trimmed per stroke: the layer-level trim of a layer applies to all of its groups, so each stroke gets its own layer below
    _at: at,
    _len: len,
  })
  const glyph = outcome === 'sent' ? [stroke2([[-105, 8], [-28, 85], [118, -78]], 7, 17)] : [stroke2([[-78, -78], [78, 78]], instant ? 0 : 7, 9), stroke2([[78, -78], [-78, 78]], instant ? 3 : 11, 9)]
  glyph.forEach((g, idx) => {
    data.layers.unshift({
      ddd: 0,
      ind: 100 + idx,
      ty: 4,
      nm: `Glyph ${idx}`,
      sr: 1,
      ks: { o: still(100), r: still(0), p: still([540, 540, 0]), a: still([0, 0, 0]), s: still([100, 100, 100]) },
      ao: 0,
      shapes: [
        { ty: 'gr', it: g.it },
        { ty: 'tm', s: still(0), e: track({ t: g._at, s: [0] }, { t: g._at + g._len, s: [100], easing: ease(1, 0.3, 0, 0.2, 1) }), o: still(0), m: 1 },
      ],
      ip: 0,
      op: END,
      st: 0,
      bm: 0,
    })
  })
  if (instant) {
    // no clock hands to draw back first: the cross is the first thing drawn
    data.layers = data.layers.filter((l: Json) => !hands.some((h) => h.layer === l))
  }
  if (instant) {
    // no waiting colour at all: the whole clip is drawn in the result colour from its first frame (the cross still draws itself in)
    const isYellow = (a: unknown) => Array.isArray(a) && a.length >= 3 && [0, 1, 2].every((i) => typeof a[i] === 'number' && Math.abs(a[i] - YELLOW[i]) < 0.01)
    const paint = (node: unknown): void => {
      if (Array.isArray(node)) {
        if (isYellow(node)) tone.forEach((v, i) => (node[i] = v))
        else node.forEach(paint)
      } else if (node && typeof node === 'object') Object.values(node).forEach(paint)
    }
    paint(data.layers)
  }
  return data
}

/**
 * Plays the clock: the intro, then the waiting loop. `outcome` turns it into the result (see above). `onIntroDone` fires when the
 * intro has finished and the loop starts. Loaded on demand, so the player stays out of the main bundle.
 */
export default function WaitingClock({
  outcome,
  onIntroDone,
  instant = false,
  className = 'size-44',
}: {
  outcome: 'sent' | 'failed' | null
  onIntroDone?: () => void
  /** skip the waiting clock and show the result straight away (for something that has already failed, not something being waited on) */
  instant?: boolean
  className?: string
}) {
  const waiting = useRef<HTMLDivElement>(null) // the waiting clock
  const result = useRef<HTMLDivElement>(null) // the closing clip, in a layer of its own: destroying a player clears its whole container
  const live = useRef<{ player?: Json; waitingPlayer?: Json; lottie?: Json; json?: unknown; introDone: boolean; closed: boolean }>({ introDone: false, closed: false })
  const outcomeRef = useRef(outcome)
  outcomeRef.current = outcome
  const introCb = useRef(onIntroDone)
  introCb.current = onIntroDone

  const close = () => {
    const s = live.current
    const o = outcomeRef.current
    if (!o || s.closed || (!s.player && !instant) || !s.lottie || !s.json || !result.current) return
    if (!s.introDone) return // the intro's end calls this again
    s.closed = true
    const old = s.player
    const f = old ? clamp(old.currentFrame + (old.firstFrame ?? 0), FIRST, LAST - 0.01) : FIRST
    const next = s.lottie.loadAnimation({
      container: result.current,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      animationData: closingClip(s.json, f, o, instant),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })
    next.setSubframe(true)
    next.addEventListener('DOMLoaded', () => {
      // the new picture is drawn exactly where the old one was: swap them in one step
      old?.destroy()
      if (prefersReducedMotion()) next.goToAndStop(END, true)
      else next.play()
    })
    s.player = next
  }

  useEffect(() => {
    const s = live.current
    let gone = false
    void Promise.all([import('lottie-web/build/player/lottie_light'), clip()]).then(([mod, json]) => {
      if (gone || !waiting.current) return
      const lottie = mod.default
      s.lottie = lottie
      s.json = json
      if (instant) {
        // nothing to wait for or to swap: the result's own player is the only one, loaded as soon as the player and clip are in
        s.introDone = true
        introCb.current?.()
        close()
        return
      }
      const a = lottie.loadAnimation({
        container: waiting.current,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        animationData: structuredClone(json), // the player writes into the data it is given: keep the original clean for the closing clip
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      })
      s.player = a
      s.waitingPlayer = a
      a.setSubframe(true) // draw between the clip's own frames, so 30 fps artwork moves smoothly on a 60 Hz screen
      const reduced = prefersReducedMotion()
      a.addEventListener('DOMLoaded', () => {
        if (reduced) {
          a.goToAndStop(100, true)
          s.introDone = true
          introCb.current?.()
          close()
        } else a.playSegments([0, FIRST], true)
      })
      a.addEventListener('complete', () => {
        if (s.introDone || s.closed) return
        s.introDone = true
        a.loop = true // from here the loop segment goes round
        a.playSegments([FIRST, LAST], true)
        introCb.current?.()
        close()
      })
    })
    return () => {
      gone = true
      s.player?.destroy()
      s.waitingPlayer?.destroy()
    }
  }, [])

  useEffect(close, [outcome]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`relative ${className}`} role="img" aria-label={outcome === 'sent' ? 'Sent' : outcome === 'failed' ? 'Could not send' : 'Waiting'}>
      <div ref={waiting} className="absolute inset-0" />
      <div ref={result} className="absolute inset-0" />
    </div>
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
