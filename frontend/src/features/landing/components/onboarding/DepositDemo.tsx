import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown, ChevronLeft, Maximize2, Minimize2 } from 'lucide-react'
import { CoinIcon, DashboardIcon, GiftIcon, HistoryIcon, WalletIcon } from '@/icons'
import { COINS } from '@/lib/coins'
import WalletChart from '@/features/wallet/components/WalletChart'
import WalletHistory from '@/features/wallet/components/WalletHistory'
import { DemoPointer, loop, usePlaying, type DemoClick } from './DemoPointer'
import Logo from '@/components/brand/Logo'

/** The real Wallet page (features/wallet/WalletPage.tsx) as it is while it loads, built at its true size (a 1280px-wide screen, the menu rail
 *  open) and scaled down to the window as one picture, so every part keeps its real proportions. The graph and Recent deposits
 *  are the real components in their loading state (skeletons). It plays a 20-second loop (DEPOSIT_MS), keeping the eye on the card:
 *   - the pointer presses Maximise: the page darkens and the card glides to the middle, as much bigger as fits, at most 1.5x
 *     (PopCard); its button becomes Minimise;
 *   - in the maximised card the pointer opens "Pay with" (PillSelect, which grows into the five coins) and picks USDT, clicks
 *     the amount and types 500 (the button goes from "Minimum … USDT" to "Continue to payment"), and presses it;
 *   - the payment (PaymentView): Back and the hour's timer in the top row, the small yellow clock beside "Waiting for payment"
 *     over the QR, amount and address; then it is seen (the details fold away, the clock is big: "Payment received") and
 *     confirmed (the clock turns green with a tick: "Deposit confirmed");
 *   - the pointer presses Minimise and the card glides home.
 *  On a phone-sized window there is no room for the page, so it is the card alone. The keyframes (deposit-*) live in index.css;
 *  with reduced motion it shows the filled-in form in the page, standing still. */
const DEPOSIT_MS = 20000
const dloop = (name: string) => loop(name, DEPOSIT_MS)
const PAGE_W = 1280 // the screen the page is laid out for
const CARD_W = 432 // the card's column (27rem)
const PHONE_BELOW = 480 // a window narrower than this shows the card alone

/*
 * Deposit timeline (fraction of the loop): press Maximise (8%); in the maximised card click the coin pill (17%), pick USDT (24%),
 * click the amount (31%; 5, 0, 0 are typed at 32.5, 34 and 35.5%), press Continue to payment (42.5%) and drift off; come back
 * and press Minimise (85%), drift off.
 */
const DEPOSIT_CLICKS: DemoClick[] = [
  { target: 'focus', fx: 0.55, fy: 0.6, at: 0.08, leave: 0.11 },
  { target: 'coin', fx: 0.55, fy: 0.6, at: 0.17, leave: 0.215, popped: true },
  { target: 'usdt', fx: 0.35, fy: 0.6, at: 0.24, leave: 0.285, popped: true },
  { target: 'amount', fx: 0.7, fy: 0.75, at: 0.31, leave: 0.38, popped: true },
  { target: 'pay', fx: 0.64, fy: 0.62, at: 0.425, leave: 0.445, approach: 0.03, fade: true, popped: true },
  { target: 'focus', fx: 0.55, fy: 0.6, at: 0.85, leave: 0.87, approach: 0.03, popped: true },
]

/** The clock of the payment screen (WaitingClock's Lottie, drawn simply): a yellow disc with two white hands turning, a ripple
 *  going out from it, and, when `settles`, a green disc growing over it with a tick drawing itself in the hands' place. */
function DemoClock({ className, settles = false }: { className?: string; settles?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="14" fill="#FBBC05" />
      <g style={settles ? dloop('deposit-clock-hands') : undefined}>
        <circle cx="24" cy="24" r="13" fill="none" stroke="#FBBC05" strokeWidth="1.5" className="origin-center" style={{ animation: 'deposit-ripple 2.2s ease-out infinite' }} />
        <path d="M24 24V15" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" className="origin-center" style={{ animation: 'deposit-spin 1.6s linear infinite' }} />
        <path d="M24 24h6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" className="origin-center" style={{ animation: 'deposit-spin 8s linear infinite' }} />
      </g>
      {settles && (
        <>
          <circle cx="24" cy="24" r="14" fill="var(--color-primary)" className="origin-center" style={dloop('deposit-clock-green')} />
          <path d="M17.5 24.5l4.5 4.5 8.5-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" style={dloop('deposit-clock-tick')} />
        </>
      )}
    </svg>
  )
}

/** Stand-in for the QR picture: a 21-module code with its three finder squares, the same every time */
const QR = (() => {
  const n = 21
  const finder = (x: number, y: number) =>
    [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => {
      const dx = x - fx
      const dy = y - fy
      if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false
      return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
    })
  const inFinderZone = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)
  let d = ''
  let seed = 7
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      seed = (seed * 9301 + 49297) % 233280
      const on = inFinderZone(x, y) ? finder(x, y) : seed / 233280 > 0.52
      if (on) d += `M${x} ${y}h1v1h-1z`
    }
  return <svg viewBox="0 0 21 21" className="size-full" shapeRendering="crispEdges" aria-hidden="true"><path d={d} fill="#0A0A0A" /></svg>
})()

const PAY_ADDRESS = '0x8f3C27aE91b04D6e5A1c7F2b39dE40a6C15b9E72'
const NAV = [
  { name: 'Dashboard', icon: DashboardIcon },
  { name: 'Wallet', icon: WalletIcon },
  { name: 'Referrals', icon: GiftIcon },
  { name: 'History', icon: HistoryIcon },
]

/** The menu rail, open (app/layout/AppLayout.tsx: 240px): the name plate and the chosen page (Wallet unless told otherwise) as they are, everything else as bones */
export function DemoRail({ active = 'Wallet' }: { active?: string }) {
  const bone = 'animate-pulse rounded-full bg-ink/[0.07]'
  return (
    <div className="absolute inset-y-4 left-4 w-[240px] rounded-[2.25rem] border border-ink/10 bg-surface/40">
      <div className="flex h-full flex-col gap-2 overflow-hidden rounded-[inherit] p-2">
        <div className="relative flex h-14 w-full items-center gap-3 overflow-hidden rounded-full bg-deep pl-4 pr-3 shadow-[inset_0_0_22px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.07)] ring-1 ring-inset ring-ink/10">
          <span className="relative size-6 shrink-0">
            <Logo className="absolute left-1/2 top-1/2 size-8 max-w-none -translate-x-1/2 -translate-y-1/2" />
          </span>
          <span className="w-36 shrink-0 whitespace-nowrap text-[1.2rem] font-extrabold tracking-tight">
            MoFi <span className="text-primary [text-shadow:0_0_12px_rgba(16,185,129,0.55)]">Life</span>
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {/* only Wallet is spelled out; the other rows are bones of the same size */}
          {NAV.map(({ name, icon: Icon }) =>
            name === active ? (
              <span key={name} className="flex h-12 w-full items-center gap-3 rounded-full bg-ink/[0.09] pl-4 pr-3 text-sm font-semibold text-muted">
                <Icon className="size-6 shrink-0 scale-110 text-primary" />
                <span className="w-36 shrink-0 whitespace-nowrap">{name}</span>
              </span>
            ) : (
              <span key={name} className="flex h-12 w-full items-center gap-3 pl-4 pr-3">
                <span className={`size-6 shrink-0 ${bone}`} />
                <span className={`h-2.5 w-20 ${bone}`} />
              </span>
            ),
          )}
        </div>
        <div className="mt-auto flex items-center gap-1">
          <span className="flex h-12 min-w-0 flex-1 items-center gap-3 pl-2 pr-3">
            <span className="size-10 shrink-0 rounded-full p-[3px] ring-1 ring-ink/15">
              <span className={`block size-full ${bone}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex h-4 items-center">
                <span className={`h-2.5 w-24 ${bone}`} />
              </span>
              <span className="flex h-4 items-center">
                <span className={`h-2 w-32 ${bone}`} />
              </span>
            </span>
          </span>
          <span className="grid h-12 w-12 shrink-0 place-items-center">
            <span className={`size-5 ${bone}`} />
          </span>
        </div>
      </div>
    </div>
  )
}

/** The deposit card at its real size (WalletPage's card around DepositPanel, then PaymentView) */
function DemoCard({ minDeposit, cardRef, sync }: { minDeposit: number; cardRef: RefObject<HTMLDivElement | null>; sync: RefObject<HTMLSpanElement | null> }) {
  return (
    <div
      ref={cardRef}
      className="relative z-20 flex flex-col rounded-3xl border border-ink/10 bg-surface p-6"
      style={{ width: CARD_W }}
    >
      {/* top row: the tabs (Deposit chosen) and Maximise; while paying, Back and the timer take the tabs' place */}
      <div className="relative z-20 mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <div className="relative grid w-full grid-cols-2 rounded-full bg-ink/[0.04] p-0.5" style={dloop('deposit-tabs')}>
            <span className="absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-ink/10" />
            <span className="relative z-10 grid h-9 place-items-center text-[13px] font-semibold text-text">Deposit</span>
            <span className="relative z-10 grid h-9 place-items-center text-[13px] font-semibold text-muted">Withdraw</span>
          </div>
          <span className="absolute left-0 top-0 z-30 inline-flex h-10 items-center gap-1 rounded-full bg-raised/75 pl-3 pr-4 text-sm font-semibold text-text opacity-0" style={dloop('deposit-back')}>
            <ChevronLeft className="size-4 text-muted" />
            Back
          </span>
          <span className="absolute right-0 top-0 z-30 inline-flex h-10 items-center gap-2 rounded-full bg-raised/75 pl-3 pr-4 text-text opacity-0" style={dloop('deposit-timer')}>
            <svg viewBox="0 0 24 24" className="size-[1.15rem] text-sky-400" aria-hidden="true">
              <circle cx="12" cy="12" r="10.5" fill="currentColor" />
              <path d="M12 6.5V12l3.6 2.2" fill="none" stroke="#111318" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-mono text-sm font-bold tabular-nums">59:58</span>
          </span>
        </div>
        <span data-demo="focus" className="grid size-10 shrink-0 place-items-center rounded-full bg-raised/75 text-muted">
          <span className="col-start-1 row-start-1" style={dloop('deposit-focus-max')}>
            <Maximize2 className="size-4" />
          </span>
          <span className="col-start-1 row-start-1 opacity-0" style={dloop('deposit-focus-min')}>
            <Minimize2 className="size-4" />
          </span>
        </span>
      </div>

      <div className="relative grid min-h-[24rem] flex-1 grid-rows-[1fr]">
        {/* the form */}
        <div className="col-start-1 row-start-1 flex flex-col gap-4" style={dloop('deposit-form')}>
          <div className="flex-1">
            <div className="flex flex-col gap-4">
              {/* Pay with: the pill grows down into the list of coins */}
              <div className="relative z-30 flex items-center justify-between gap-3">
                <span className="text-xs text-muted">Pay with</span>
                <div data-demo="coin" className="relative w-48 shrink-0" style={{ height: 40 }}>
                  <div className="absolute inset-x-0 top-0 h-10 overflow-hidden rounded-[1.25rem] bg-ink/5" style={dloop('deposit-pill')}>
                    <div className="relative flex h-10 w-full items-center gap-2 pl-4 pr-3 text-[13px] font-medium">
                      <span className="flex-1 text-muted opacity-0" style={dloop('deposit-select')}>
                        Select
                      </span>
                      <span className="absolute inset-y-0 left-4 right-9 flex items-center gap-2" style={dloop('deposit-chosen')}>
                        <CoinIcon symbol="USDT" className="size-5 shrink-0" />
                        <span className="flex-1 text-text">USDT</span>
                        <span className="text-[11px] text-muted">BEP-20</span>
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-muted" style={dloop('deposit-chevron')} />
                    </div>
                    <div className="flex flex-col gap-0.5 px-2 pb-2 opacity-0" style={dloop('deposit-list')}>
                      {COINS.map((c) => (
                        <span
                          key={c.code}
                          data-demo={c.symbol === 'USDT' ? 'usdt' : undefined}
                          className="flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-[13px] text-text"
                          style={c.symbol === 'USDT' ? dloop('deposit-hover') : undefined}
                        >
                          <CoinIcon symbol={c.symbol} className="size-5 shrink-0" />
                          <span className="flex-1">{c.symbol}</span>
                          <span className="text-[11px] text-muted">{c.network}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* You receive: the amount, typed in */}
              <div className="py-4 text-center">
                <span className="text-xs text-muted">You receive</span>
                <div data-demo="amount" className="mx-auto mt-4 flex w-max items-center justify-center gap-2">
                  <span className="text-3xl font-semibold leading-none text-muted/60">$</span>
                  <span className="relative inline-flex min-w-[1.5ch] items-center justify-center text-5xl font-bold leading-none tabular-nums text-text">
                    <span className="absolute inset-0 text-center text-muted/30 opacity-0" style={dloop('deposit-zero')}>
                      0
                    </span>
                    {['5', '0', '0'].map((d, i) => (
                      <span key={i} className="inline-block overflow-hidden" style={dloop(`deposit-digit-${i + 1}`)}>
                        {d}
                      </span>
                    ))}
                    <span className="ml-0.5 h-[0.85em] w-0.5 bg-text opacity-0" style={dloop('deposit-caret')} />
                  </span>
                  <span className="self-end pb-1 text-xs font-semibold leading-none text-muted">USDT</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <div data-demo="pay" className="relative grid h-12 w-full place-items-center rounded-full bg-primary text-sm font-semibold text-[color:var(--color-base)]" style={dloop('deposit-submit')}>
              <span ref={sync} className="pointer-events-none absolute -inset-[5px] rounded-full border-2 border-primary/60 opacity-0" style={dloop('deposit-submit-ring')} />
              <span className="col-start-1 row-start-1 opacity-0" style={dloop('deposit-label-min')}>
                Minimum {minDeposit} USDT
              </span>
              <span className="col-start-1 row-start-1" style={dloop('deposit-label-go')}>
                Continue to payment
              </span>
            </div>
          </div>
        </div>

        {/* the payment, waiting: the small clock beside its words, and what to send where */}
        <div className="col-start-1 row-start-1 my-auto text-center opacity-0" style={dloop('deposit-paying')}>
          <div className="flex items-center justify-center gap-1">
            <DemoClock className="-my-3 size-20 shrink-0" />
            <div className="flex h-[3.1rem] w-56 max-w-[70%] shrink-0 flex-col items-start justify-center text-left">
              <p className="text-base font-semibold leading-tight text-text">Waiting for payment</p>
              <p className="mt-1 text-xs leading-tight text-muted">Send the exact amount below</p>
            </div>
          </div>
          <div className="mt-3 divide-y divide-ink/[0.07] overflow-hidden rounded-2xl bg-ink/[0.04] text-left">
            <div className="flex items-center gap-3 p-3">
              <span className="block shrink-0 rounded-xl bg-white p-2">
                <span className="block size-24">{QR}</span>
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs text-muted">
                  Send exactly <span className="font-semibold text-text/80">USDT</span>
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <CoinIcon symbol="USDT" className="size-6 shrink-0" />
                  <span className="whitespace-nowrap text-xl font-bold leading-tight tabular-nums text-text">500.85</span>
                </span>
              </div>
            </div>
            <div className="flex min-h-[2.75rem] items-start justify-between gap-4 p-3">
              <span className="pt-px text-sm text-muted">To</span>
              <span className="max-w-[80%] break-all text-right font-mono text-xs font-semibold leading-snug text-primary">{PAY_ADDRESS}</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-ink/[0.07]">
              <div className="min-w-0 p-3">
                <p className="text-xs text-muted">Network</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-text">BEP-20</p>
              </div>
              <div className="min-w-0 p-3 pl-4">
                <p className="text-xs text-muted">You receive</p>
                <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-text">500.00 USDT</p>
              </div>
            </div>
          </div>
        </div>

        {/* the payment, seen and then confirmed: the details have folded away, the clock is big and settles green */}
        <div className="col-start-1 row-start-1 m-auto flex flex-col items-center text-center opacity-0" style={dloop('deposit-result')}>
          <DemoClock settles className="size-52" />
          <div className="relative mt-1 grid h-[3.1rem] w-full">
            <div className="col-start-1 row-start-1 flex flex-col items-center justify-center" style={dloop('deposit-line-received')}>
              <p className="text-base font-semibold leading-tight text-text">Payment received</p>
              <p className="mt-1 text-xs leading-tight text-muted">Waiting for the network to confirm it</p>
            </div>
            <div className="col-start-1 row-start-1 flex flex-col items-center justify-center opacity-0" style={dloop('deposit-line-confirmed')}>
              <p className="text-base font-semibold leading-tight text-text">Deposit confirmed</p>
              <p className="mt-1 text-xs leading-tight text-muted">500.00 USDT added to your balance</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type Fit = { phone: boolean; w: number; h: number; scale: number; x: number; y: number }
type Pop = { x: number; y: number; s: number; cx: number; cy: number }

export default function DepositDemo({ minDeposit }: { minDeposit: number }) {
  const frame = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const sync = useRef<HTMLSpanElement>(null)
  const playing = usePlaying(frame)
  const [fit, setFit] = useState<Fit | null>(null)
  const [pop, setPop] = useState<Pop>({ x: 0, y: 0, s: 1, cx: 0, cy: 0 })

  // The page is laid out at its real size and scaled to the window as one picture. On a phone-sized window it is the card alone.
  useEffect(() => {
    const f = frame.current
    if (!f) return
    const ro = new ResizeObserver(() => {
      const fw = f.clientWidth
      const fh = f.clientHeight
      if (!fw || !fh) return
      if (fw >= PHONE_BELOW) {
        const scale = fw / PAGE_W
        setFit({ phone: false, w: PAGE_W, h: Math.round(fh / scale), scale, x: 0, y: 0 })
      } else {
        const w = CARD_W + 32
        const h = 600
        const scale = Math.min(fw / w, fh / h)
        setFit({ phone: true, w, h, scale, x: (fw - w * scale) / 2, y: (fh - h * scale) / 2 })
      }
    })
    ro.observe(f)
    return () => ro.disconnect()
  }, [])

  // Where the card lands when it is maximised (PopCard): the middle of the screen, as much bigger as fits there (24px to spare), at
  // most 1.5x. Layout positions (offsets), which the card's own flight (a transform) does not change.
  useLayoutEffect(() => {
    const p = page.current
    const c = card.current
    if (!fit || !p || !c) return
    let x = 0
    let y = 0
    for (let n: HTMLElement | null = c; n && n !== p; n = n.offsetParent as HTMLElement | null) {
      x += n.offsetLeft
      y += n.offsetTop
    }
    const cw = c.offsetWidth
    const ch = c.offsetHeight
    const s = fit.phone ? 1 : Math.max(1, Math.min(1.5, (fit.w - 24) / cw, (fit.h - 24) / ch))
    const cx = x + cw / 2
    const cy = y + ch / 2
    setPop({ x: fit.w / 2 - cx, y: fit.h / 2 - cy, s, cx, cy })
  }, [fit])

  // The card's flight to the middle and back home. It is run from here with the measured numbers (a CSS animation would take its
  // keyframes once, before they are measured), on the same clock as the CSS loop, and paused with it while off screen.
  const flight = useRef<Animation | null>(null)
  const resyncFlight = () => {
    const ref = sync.current?.getAnimations()[0]
    const a = flight.current
    if (ref && a) ref.ready.then(() => (a.startTime = ref.startTime))
  }
  useEffect(() => {
    const c = card.current
    // On a phone the card is shown alone, already where it is: nothing is maximised, so there is no flight (and no darkening, no Maximise press)
    if (!c || !fit || fit.phone || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const out = `translate(${pop.x.toFixed(1)}px, ${pop.y.toFixed(1)}px) scale(${pop.s.toFixed(3)})`
    const glide = 'cubic-bezier(0.22, 1, 0.36, 1)'
    // Maximise is pressed at 8%: it glides out 8.5-11.7%; Minimise at 85%: it glides home 85.5-88.7%
    const a = c.animate(
      [
        { offset: 0, transform: 'none' },
        { offset: 0.085, transform: 'none', easing: glide },
        { offset: 0.117, transform: out },
        { offset: 0.855, transform: out, easing: glide },
        { offset: 0.887, transform: 'none' },
        { offset: 1, transform: 'none' },
      ],
      { duration: DEPOSIT_MS, iterations: Infinity },
    )
    flight.current = a
    resyncFlight()
    return () => {
      a.cancel()
      flight.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop, fit])
  useEffect(() => {
    if (!playing) flight.current?.pause()
    else resyncFlight()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  // a point on the page, in the window: through the maximised card's flight when the click is made in it, then the page's scale
  const place = (q: { x: number; y: number }, click?: DemoClick) => {
    let { x, y } = q
    if (click?.popped && !fit?.phone) {
      x = pop.cx + pop.s * (x - pop.cx) + pop.x
      y = pop.cy + pop.s * (y - pop.cy) + pop.y
    }
    return { x: (fit?.x ?? 0) + x * (fit?.scale ?? 1), y: (fit?.y ?? 0) + y * (fit?.scale ?? 1) }
  }

  return (
    <div ref={frame} className={`relative size-full overflow-hidden bg-base ${fit?.phone ? 'demo-phone' : ''} ${playing ? '' : '[&_*]:[animation-play-state:paused]'}`}>
      {fit && (
        <div
          ref={page}
          inert
          aria-hidden="true"
          className="absolute left-0 top-0 origin-top-left bg-base text-left leading-normal text-text"
          style={{ width: fit.w, height: fit.h, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }}
        >
          {fit.phone ? (
            <div className="absolute inset-0 grid place-items-center">
              <DemoCard minDeposit={minDeposit} cardRef={card} sync={sync} />
            </div>
          ) : (
            <>
              <DemoRail />
              {/* the page beside the rail (AppLayout: the rail's width + 36px on the left, 32px on the right, 16px from the top) */}
              <div className="absolute left-[276px] right-8 top-4 grid grid-cols-[minmax(0,1fr)_minmax(0,27rem)] gap-5">
                <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-5">
                  <WalletChart kind="deposit" items={[]} wallet={null} loading />
                  <WalletHistory kind="deposit" items={[]} loading />
                </div>
                <div className="col-start-2 row-start-1 min-w-0 self-center">
                  <DemoCard minDeposit={minDeposit} cardRef={card} sync={sync} />
                </div>
              </div>
            </>
          )}

          {/* the page darkens behind the maximised card (not on a phone: there the card is shown alone and is never maximised) */}
          {!fit.phone && (
            <div
              className="pointer-events-none absolute inset-0 z-10 opacity-0"
              style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.62), rgba(0,0,0,0.84))', ...dloop('deposit-backdrop') }}
            />
          )}
        </div>
      )}

      {fit && (
        <DemoPointer
          root={page}
          sync={sync}
          playing={playing}
          clicks={fit.phone ? DEPOSIT_CLICKS.filter((c) => c.target !== 'focus') : DEPOSIT_CLICKS}
          duration={DEPOSIT_MS}
          place={place}
          layoutKey={`${fit.w}x${fit.h}@${fit.scale}+${fit.x},${fit.y}|${pop.x},${pop.y},${pop.s}`}
        />
      )}
    </div>
  )
}
