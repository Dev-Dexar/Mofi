import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

// The card itself lifts out of the page and glides to the middle of the screen; closing glides it home. It is the same
// element throughout, so nothing is duplicated, and a placeholder of its old size keeps the page from reflowing.
//
// Why nothing shifts: the card is NEVER laid out a second time. Out in the middle it has exactly the box it has in the page (the
// same width, the same height, the same text wrapping) and is only scaled up about its own centre, which the browser keeps in the
// middle of the screen (fixed, inset 0, margin auto). The flight is one transform animation, measured from the real boxes on screen,
// from the card's place in the page to that scaled shape; closing runs it the other way, to where the placeholder really is. So
// when the card goes back into the page it is already the size it will be there, and the page below never moves.
const FLY_MS = 640
const FLY_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const TEXT = 1.5 // how much bigger everything inside is in the middle
const PHONE = 640 // narrower than this is a phone: maximised there is the same card, as much larger as the screen allows (with the tab bar out of the way)

interface Rect {
  left: number
  top: number
  width: number
  height: number
}
type Phase = 'idle' | 'opening' | 'open' | 'closing'

export default function PopCard({
  open,
  onClose,
  instantOpen = false,
  slotClassName = '',
  className = '',
  children,
}: {
  open: boolean
  onClose: () => void
  /** already open when the page loads (a link straight to it): it is simply there, nothing flies. Only the first opening. */
  instantOpen?: boolean
  /** classes for the box that holds the card's place in the page (grid order and the like) */
  slotClassName?: string
  className?: string
  /** gets `expanded`: true once the card has landed in the middle (and until it starts to leave) */
  children: (expanded: boolean) => ReactNode
}) {
  const card = useRef<HTMLDivElement>(null)
  const flight = useRef<HTMLDivElement>(null) // the box that carries the card through the air (the card itself, in the page, when idle)
  const slot = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [home, setHome] = useState<Rect | null>(null) // the card's place in the page
  const [zoom, setZoom] = useState(1) // how much bigger what is inside is shown in the middle
  const [phone, setPhone] = useState(false) // a phone-sized window: the tab bar slides away while the card is out
  const [snap, setSnap] = useState(instantOpen) // until it is first closed, opening is a cut, not a flight
  const snapRef = useRef(snap)
  snapRef.current = snap
  const closeCb = useRef(onClose)
  closeCb.current = onClose
  const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // start: measure the card where it is, then put it in its final shape (the next effect flies it there from this spot)
  useLayoutEffect(() => {
    if (!open || phase !== 'idle' || !card.current) return
    const r = card.current.getBoundingClientRect()
    setHome({ left: r.left, top: r.top, width: r.width, height: r.height })
    // the card is its normal self, just `z` times bigger all over (width and height alike): TEXT, or less if that would not fit the
    // screen. The height available is what is really visible now (the browser's toolbars come and go on a phone)
    const isPhone = window.innerWidth < PHONE
    const room = isPhone ? 8 : 24 // (what is left round it: on a phone, a sliver, so it is as large as the screen's width allows)
    const visibleH = window.visualViewport?.height ?? window.innerHeight
    const z = Math.max(1, Math.min(TEXT, (document.documentElement.clientWidth - room) / r.width, (visibleH - room) / r.height))
    setPhone(isPhone)
    setZoom(z)
    setPhase('opening')
  }, [open, phase])

  // fly to the middle: the box sits in the middle at its normal size; it starts on the card's old place and grows into the scaled shape
  useLayoutEffect(() => {
    const el = flight.current
    if (phase !== 'opening' || !el || !home) return
    let anim: Animation | undefined
    const land = () => {
      // the scaled shape is set first, then the animation lifted off it, so there is no frame in between
      flushSync(() => setPhase('open'))
      anim?.cancel()
    }
    backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: snapRef.current ? 0 : FLY_MS, easing: 'ease-out', fill: 'forwards' })
    if (still() || snapRef.current) return setPhase('open')
    const mid = el.getBoundingClientRect()
    const dx = home.left + home.width / 2 - (mid.left + mid.width / 2)
    const dy = home.top + home.height / 2 - (mid.top + mid.height / 2)
    anim = el.animate(
      [{ transform: `translate3d(${dx}px, ${dy}px, 0) scale(1)` }, { transform: `translate3d(0, 0, 0) scale(${zoom})` }],
      { duration: FLY_MS, easing: FLY_EASE, fill: 'both' },
    )
    anim.onfinish = land
    return () => {
      if (anim) anim.onfinish = null
      anim?.cancel()
    }
  }, [phase, home])

  useEffect(() => {
    if (phase === 'closing') setSnap(false)
  }, [phase])

  // leave
  useEffect(() => {
    if (!open && phase === 'open') setPhase('closing')
  }, [open, phase])

  // fly home: to where the placeholder really is (its height is the card's, so the box lands exactly on it)
  useLayoutEffect(() => {
    const el = flight.current
    if (phase !== 'closing' || !el || !slot.current) return
    const cur = el.getBoundingClientRect() // the scaled shape: its centre is the middle of the screen
    const target = slot.current.getBoundingClientRect()
    const dx = target.left + target.width / 2 - (cur.left + cur.width / 2)
    const dy = target.top + target.height / 2 - (cur.top + cur.height / 2)
    let anim: Animation | undefined
    const done = () => {
      flushSync(() => {
        setPhase('idle')
        setHome(null)
      })
      anim?.cancel()
    }
    if (still()) return done()
    backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FLY_MS, easing: 'ease-in-out', fill: 'forwards' })
    anim = el.animate(
      [{ transform: `translate3d(0, 0, 0) scale(${zoom})` }, { transform: `translate3d(${dx}px, ${dy}px, 0) scale(1)` }],
      { duration: FLY_MS, easing: FLY_EASE, fill: 'both' },
    )
    anim.onfinish = done
    return () => {
      if (anim) anim.onfinish = null
      anim?.cancel()
    }
  }, [phase, zoom])

  // asked to open again while it was flying home: stay put
  useEffect(() => {
    if (open && phase === 'closing') {
      backdrop.current?.animate([{ opacity: 1 }], { duration: 0, fill: 'forwards' })
      setPhase('open')
    }
  }, [open, phase])

  // on a phone the tab bar slides down as the card opens and stays away while the card is out; it comes back only once the card has landed home
  const covering = phone && (phase !== 'idle' || open) // (also while it is being re-measured above)
  useEffect(() => {
    if (!covering) return
    document.documentElement.setAttribute('data-focus', '')
    return () => document.documentElement.removeAttribute('data-focus') // also if the page is left with the card still out
  }, [covering])

  // The window changed WIDTH while the card is out (a phone view turned desktop, say): what it measured when it opened is now wrong, its
  // place in the page, how much room there is, whether it is the whole screen. So at once it goes back into the page (reset, so its
  // place is measured clean) and comes out again with no flight, as it would have opened at the new size. All of that happens before
  // the next paint, so there is no frame of the old shape at the new size. A change of height alone is only a phone's browser bar
  // coming or going: the card is centred by the browser, so it simply stays in the middle and is left alone.
  useEffect(() => {
    if (phase !== 'open') return
    const width = window.innerWidth
    const onResize = () => {
      if (Math.abs(window.innerWidth - width) < 1) return
      setSnap(true)
      setPhase('idle')
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [phase])

  // while it is out the page behind stays put, and its scrollbar stays where it is (hiding it would make the page jump sideways and
  // back): no wheel or touch scrolling (except inside the card, if it is taller than the screen), the scroll keys are ignored, and
  // anything else that moves the page (dragging the scrollbar, say) is put straight back
  useEffect(() => {
    if (phase === 'idle') return
    const x = window.scrollX
    const y = window.scrollY
    const inCard = (target: EventTarget | null) => {
      // a window opened from inside the card (the terms) scrolls on its own
      if ((target as HTMLElement | null)?.closest?.('[role="dialog"]')) return true
      // anything inside the card that scrolls on its own (the card itself, or a scrolling area in it like the payment) keeps working
      const el = card.current
      for (let n = target as HTMLElement | null; n && el?.contains(n); n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return true
      }
      return false
    }
    const block = (e: Event) => {
      if (!inCard(e.target)) e.preventDefault()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeCb.current()
      // the keys that scroll a page, only when nothing in particular has focus (a list or a field inside the card still uses them)
      const idle = e.target === document.body || e.target === document.documentElement
      if (idle && [' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault()
    }
    const hold = () => {
      if (window.scrollX !== x || window.scrollY !== y) window.scrollTo({ left: x, top: y, behavior: 'instant' })
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', block, { passive: false })
    window.addEventListener('touchmove', block, { passive: false })
    window.addEventListener('scroll', hold)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', block)
      window.removeEventListener('touchmove', block)
      window.removeEventListener('scroll', hold)
    }
  }, [phase === 'idle']) // eslint-disable-line react-hooks/exhaustive-deps

  const lifted = phase !== 'idle'
  // the box in the middle has the card's own size; once landed it is held scaled up (and only then: while it flies, the animation owns the transform)
  const flightStyle: React.CSSProperties =
    lifted && home
      ? {
          position: 'fixed',
          inset: 0,
          margin: 'auto',
          width: home.width,
          height: home.height,
          zIndex: 100,
          transform: phase === 'open' ? `scale(${zoom})` : undefined,
        }
      : { display: 'contents' } // idle: no box at all, the card is simply in the page

  return (
    <div ref={slot} className={slotClassName} style={lifted && home ? { height: home.height } : undefined}>
      {lifted && (
        <div
          ref={backdrop}
          onClick={() => closeCb.current()}
          className="fixed inset-0 z-[99]"
          style={{ opacity: 0, background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.62), rgba(0,0,0,0.84))' }}
        />
      )}
      <div ref={flight} style={flightStyle}>
        <div
          ref={card}
          className={`${className} ${lifted ? 'h-full w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''}`}
        >
          <div className="flex flex-1 flex-col">{children(phase === 'open')}</div>
        </div>
      </div>
    </div>
  )
}
