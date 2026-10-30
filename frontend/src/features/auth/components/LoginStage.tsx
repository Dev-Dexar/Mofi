import { useEffect, useRef } from 'react'
import { currentTheme, onThemeChange } from '@/lib/theme'

const BLOCK = 16 // the size of a square the coins appear in
const PAGE_BLOCK = 24 // the squares of the faint background grid
const FORM_SECONDS = 1.6 // the coins coming up when the page opens
const MORPH_SECONDS = 1.4 // the coins turning into the logo, or back
const HOLD_SECONDS = 3.2 // the coins stand like this for a while...
const SLIDE_SECONDS = 1.3 // ...then slide along one place
const SIDE = 56 // px kept clear around the coins: from the left edge, the open side's right edge and the bottom
const TOP = 96 // and from the top, which is also clear of the Back button
/** The coins, left to right as the features section shows them: USDT (BEP-20) in the middle, BTC and ETH on its left, GRAM and SOL on its right */
const COINS = ['btc', 'eth', 'usdt', 'gram', 'sol']
/** Where a coin is and how big, by its place along the row (-2 far left ... 0 middle ... 2 far right; 3 and -3 are just off either end, where a
 *  coin leaves and comes back in). Distances and sizes are in units of the middle coin's width. Between two places a coin is partway between. */
const PLACES = [-3, -2, -1, 0, 1, 2, 3]
const AT = [-1.95, -1.157, -0.71, 0, 0.71, 1.157, 1.95] // well clear of the coin beside them, so a coin fading at the end never overlaps another
const SIZE = [0.3, 0.62, 0.62, 1, 0.62, 0.62, 0.3]
const ROW_WIDTH = 2.93 // the whole row, in units of the middle coin
const REACH = 4.3 // the width of the area they move in (the row, and room at both ends for a coin coming and going), in the same units
const between = (list: number[], place: number) => {
  const i = Math.min(PLACES.length - 2, Math.max(0, Math.floor(place + 3)))
  const t = place + 3 - i
  return list[i] + (list[i + 1] - list[i]) * t
}
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2)

/** The mark is a white shape on the dark theme and a dark one on the light theme */
const logoSrc = () => (currentTheme() === 'light' ? '/logo-ink.svg' : '/logo.svg')

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

/**
 * The picture beside the sign-in form, drawn sharp: the five coins this platform takes, laid out as on the features section (USDT in the
 * middle, BTC and ETH on its left, GRAM and SOL on its right). They come up square by square from the middle when the page opens. Then, every
 * few seconds, they slide along one place: each coin glides to its neighbour's spot, growing as it reaches the middle and shrinking as it leaves
 * it, and the one at the end slips out of sight and comes in again at the other end. Behind them is a faint grid. Move the pointer over the open side
 * and the coins change to the MoFi Life logo, square by square; move away and they come back. Only the picture on screen and the one it is
 * changing into are kept in memory. The loop stops while the tab is hidden, and with reduced motion the coins simply show.
 */
export default function LoginStage() {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = host.current
    const cv = canvas.current
    const ctx = cv?.getContext('2d')
    if (!el || !cv || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let W = 0 // the picture's area, in CSS px
    let H = 0
    let x0 = 0
    let y0 = 0
    let scale = 1
    let zone = 0 // how much of the page's width, from the left, is the open side (0: no coins at all, on a phone)
    let mx = 0 // the middle of the coins
    let my = 0
    let logoBox = 0
    let unit = 0 // the middle coin's width
    let front: HTMLCanvasElement | null = null // what is on screen, while the square-by-square change is going on
    let next: HTMLCanvasElement | null = null // what it is changing into
    let thresholds = new Float32Array(0) // when, 0 to 1, each square changes: from the middle outward, a little scattered
    let across = 0
    let down = 0
    let appear = 0 // the coins coming up
    let appearGoal = 0
    let morph = 1 // 0 = still the picture it started from, 1 = arrived
    let hovering = false
    let changing = false // the square-by-square change (opening, or to and from the logo) is under way
    let shift = 0 // how many places the coins have slid along
    let slide = 0 // 0 to 1 while they are sliding one more place
    let sliding = false
    let waitUntil = 0
    let raf = 0
    let last = 0
    let drawn = 0
    let logo: HTMLImageElement | null = null
    let images: Record<string, HTMLImageElement> = {}
    let ready = false

    const blank = () => {
      const c = document.createElement('canvas')
      c.width = Math.round(W * scale)
      c.height = Math.round(H * scale)
      return c
    }

    /** Draws the coins into `q` (set up in page coordinates): each at its place along the row, `t` of the way (0 to 1) to the next one */
    const drawCoins = (q: CanvasRenderingContext2D, t: number) => {
      const parts: { img: HTMLImageElement; place: number; alpha: number }[] = []
      COINS.forEach((name, i) => {
        const place = ((i + shift) % COINS.length) - 2 // -2 ... 2
        if (place + 1 <= 2) parts.push({ img: images[name], place: place + t, alpha: 1 })
        else {
          // the one at the far end slips out of sight as it leaves, and comes in again at the other end
          const f = t * t * (3 - 2 * t)
          parts.push({ img: images[name], place: place + t, alpha: 1 - f })
          parts.push({ img: images[name], place: -3 + t, alpha: f })
        }
      })
      // who is on top: the bigger coin, and of two the same size the one nearer the middle (the way the row is laid out at rest), so two coins
      // passing each other never swap which is in front
      const order = (part: { place: number }) => between(SIZE, part.place) * 10 - Math.abs(between(AT, part.place))
      parts.sort((a, b) => order(a) - order(b))
      for (const part of parts) {
        if (part.alpha <= 0.01) continue
        const d = between(SIZE, part.place) * unit
        q.globalAlpha = part.alpha
        q.drawImage(part.img, mx + between(AT, part.place) * unit - d / 2, my - d / 2, d, d)
      }
      q.globalAlpha = 1
    }

    /** Draws the coins (or the logo) into `target`, sharp: the page's own coordinates, moved so the area's corner is the corner */
    const render = (target: HTMLCanvasElement, asLogo: boolean) => {
      const q = target.getContext('2d')!
      q.setTransform(1, 0, 0, 1, 0, 0)
      q.clearRect(0, 0, target.width, target.height)
      q.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale)
      if (asLogo) {
        const aspect = logo!.naturalWidth && logo!.naturalHeight ? logo!.naturalWidth / logo!.naturalHeight : 1
        const lw = aspect >= 1 ? logoBox : logoBox * aspect
        const lh = aspect >= 1 ? logoBox / aspect : logoBox
        q.drawImage(logo!, mx - lw / 2, my - lh / 2, lw, lh)
      } else drawCoins(q, 0)
    }

    /** What is on screen during a change: each square shows the new picture once the change has reached it, the old one before */
    const compose = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      if (!front || !next || !thresholds.length) return
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      const p = (changing ? morph : 1) * 1.15
      const s = BLOCK * scale
      for (let by = 0; by < down; by++)
        for (let bx = 0; bx < across; bx++) {
          const src = p >= thresholds[by * across + bx] ? next : front
          ctx.drawImage(src, bx * s, by * s, s, s, bx * BLOCK, by * BLOCK, BLOCK, BLOCK)
        }
    }

    /** The coins, drawn straight onto the screen at the moment of their slide */
    const paintCoins = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale)
      drawCoins(ctx, sliding ? ease(slide) : 0)
    }

    const build = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      zone = window.innerWidth >= 1024 ? 0.6 : 0
      if (!w || !h || zone === 0 || !logo || COINS.some((c) => !images[c])) {
        ready = false
        cv.width = 0
        cv.height = 0
        return
      }
      ready = true
      const open = w * zone
      mx = open / 2
      my = (TOP + h - SIDE) / 2
      unit = Math.max(40, Math.min((open - 2 * SIDE) / ROW_WIDTH, (h - TOP - SIDE) * 0.55, 460))
      logoBox = Math.min(open - 2 * SIDE, h - TOP - SIDE) * 0.62
      // the area the coins live in, in whole squares so none is cut at the edge
      W = Math.ceil((REACH * unit) / BLOCK) * BLOCK
      H = Math.ceil((unit * 1.3) / BLOCK) * BLOCK
      x0 = Math.round(mx - W / 2)
      y0 = Math.round(my - H / 2)
      scale = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(W * scale)
      cv.height = Math.round(H * scale)
      cv.style.cssText = `position:absolute;left:${x0}px;top:${y0}px;width:${W}px;height:${H}px`
      across = Math.ceil(W / BLOCK)
      down = Math.ceil(H / BLOCK)
      thresholds = new Float32Array(across * down)
      const far = Math.hypot(W / 2, H / 2)
      for (let by = 0; by < down; by++)
        for (let bx = 0; bx < across; bx++) {
          const d = Math.hypot((bx + 0.5) * BLOCK - W / 2, (by + 0.5) * BLOCK - H / 2) / far
          thresholds[by * across + bx] = 0.75 * d + 0.25 * Math.random()
        }
      front = blank()
      next = blank()
      render(next, hovering)
      changing = appear < 1 || hovering // the coins are still coming up from nothing, or the logo is showing
      if (changing) compose()
      else paintCoins()
    }

    /** Starts changing into the logo (or back to the coins), from whatever is on screen now, even halfway through a change */
    const turnInto = (asLogo: boolean) => {
      if (!ready || !front || !next) return
      if (sliding) {
        // a slide cut short settles on the place it was heading for
        sliding = false
        shift += 1
        slide = 0
      }
      const f = front.getContext('2d')!
      f.setTransform(1, 0, 0, 1, 0, 0)
      f.clearRect(0, 0, front.width, front.height)
      f.drawImage(cv, 0, 0) // what is on screen now is where the change starts from
      render(next, asLogo)
      changing = true
      morph = 0
      if (still) {
        changing = asLogo
        f.clearRect(0, 0, front.width, front.height)
        compose()
        if (!asLogo) paintCoins()
      }
    }

    // the one loop: it runs the square-by-square change, and between them slides the coins along (about 30 frames a second, not while the tab is hidden)
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (document.hidden || now - drawn < 33) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      drawn = now
      if (!ready) return
      if (changing) {
        if (appear < appearGoal) {
          appear = Math.min(appearGoal, appear + dt / FORM_SECONDS)
          morph = appear // the coins come up the same way: from nothing
        } else morph = Math.min(1, morph + dt / MORPH_SECONDS)
        if (appear >= appearGoal && morph >= 1) {
          changing = hovering // arrived: the logo stays up while the pointer is over it; the coins go back to being drawn live
          if (!hovering) {
            waitUntil = now + HOLD_SECONDS * 1000
            paintCoins()
          }
        }
        if (changing) compose()
        return
      }
      if (sliding) {
        slide = Math.min(1, slide + dt / SLIDE_SECONDS)
        paintCoins()
        if (slide >= 1) {
          sliding = false
          slide = 0
          shift += 1
          paintCoins()
          waitUntil = now + HOLD_SECONDS * 1000
        }
      } else if (now >= waitUntil && !hovering) sliding = true
    }

    const hover = (on: boolean) => {
      if (on === hovering || !ready) return
      hovering = on
      turnInto(on)
    }

    // the picture lets every click through; the page it sits in tells it where the pointer is
    const page = el.parentElement ?? el
    const onMove = (e: PointerEvent) => hover(zone > 0 && e.clientX < page.clientWidth * zone)
    const onLeave = () => hover(false)
    page.addEventListener('pointermove', onMove)
    page.addEventListener('pointerleave', onLeave)
    const ro = new ResizeObserver(() => {
      build()
      if (ready && appear >= 1 && !changing) paintCoins()
    })
    ro.observe(el)
    let alive = true
    Promise.all([loadImage(logoSrc()), ...COINS.map((c) => loadImage(`/crypto/${c}.svg`))])
      .then(([logoImg, ...rest]) => {
        if (!alive) return
        logo = logoImg
        images = Object.fromEntries(COINS.map((c, i) => [c, rest[i]]))
        build()
        appearGoal = 1
        if (still) {
          appear = 1
          morph = 1
          changing = false
          if (ready) paintCoins()
        } else {
          last = performance.now()
          waitUntil = last + (FORM_SECONDS + HOLD_SECONDS) * 1000
          raf = requestAnimationFrame(tick)
        }
      })
      .catch(() => {}) // without the images there is just the grid
    // the logo is drawn in the theme's ink, so a change of theme loads the other one and redraws what is on screen
    const offTheme = onThemeChange(() => {
      loadImage(logoSrc())
        .then((img) => {
          if (!alive || !logo) return
          logo = img
          build()
        })
        .catch(() => {})
    })
    return () => {
      alive = false
      offTheme()
      page.removeEventListener('pointermove', onMove)
      page.removeEventListener('pointerleave', onLeave)
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={host}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(color-mix(in srgb, var(--color-ink) 3.5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-ink) 3.5%, transparent) 1px, transparent 1px)',
        backgroundSize: `${PAGE_BLOCK}px ${PAGE_BLOCK}px`,
      }}
    >
      <canvas ref={canvas} />
    </div>
  )
}
