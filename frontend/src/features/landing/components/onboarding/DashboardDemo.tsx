import { useEffect, useRef, useState } from 'react'
import type { TransactionItem, WalletData } from '@/lib/api'
import { useAppSettings } from '@/hooks/useAppSettings'
import EarnedCard from '@/features/dashboard/components/EarnedCard'
import PayoutClock from '@/features/dashboard/components/PayoutClock'
import ActivityCard from '@/features/dashboard/components/ActivityCard'
import GrowthCard from '@/features/dashboard/components/GrowthCard'
import ReinvestCard from '@/features/dashboard/components/ReinvestCard'
import { DemoRail } from './DepositDemo'
import { usePlaying } from './DemoPointer'

/** The real Dashboard (features/dashboard/DashboardPage.tsx): the three cards that tell the story (the earned figure, the payout clock, recent
 *  activity) are the real ones, and the rest of the page is left as bones, so the eye stays on them at a 1200px-wide screen with the menu rail
 *  open, and scaled down to the window as one picture. It plays a 16-second loop of the thing the product is for, a payout:
 *   - the clock counts down the last seconds to 00:00 UTC ("Next payout in");
 *   - at zero the payout lands: the earned figure counts up by one day's income, the month's line lifts,
 *     the money available to reinvest grows, and "Daily return" slides in at the top of Recent activity, lit for a moment;
 *   - the clock starts again from 23:59:59, and the loop begins over.
 *  On a phone-sized window it is a single column of the same cards. Reduced motion: the moment just after the payout, standing still. */
const LOOP = 16 // seconds
const COUNT_FROM = 7 // the clock starts this many seconds before the payout
const LANDS = COUNT_FROM // seconds into the loop that the payout lands
const COUNT_MS = 1.3 // how long the figure takes to count up
const PAGE_W = 1200 // wide enough for the cards to be the width they are on a real screen
const PHONE_BELOW = 480
const PHONE_W = 460

const PRINCIPAL = 5000
const BASE_EARNED = 730.85
const BASE_AVAILABLE = 460.58
const MONTHS = [18.2, 64.5, 112.9, 158.3, 201.7, 246.1]

/** A card that is not part of the story, as bones: the same panel, a tile, a title and a few lines. It is laid over the real card
 *  (kept invisible underneath), so it takes exactly the real card's size and the page keeps its true proportions. */
function GhostCard({ lines = 3, children }: { lines?: number; children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col">
      <div className="invisible flex flex-1 flex-col [&>*]:flex-1" aria-hidden="true">
        {children}
      </div>
      <BoneCard lines={lines} className="absolute inset-0" />
    </div>
  )
}

function BoneCard({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  const bone = 'animate-pulse rounded-full bg-ink/[0.07]'
  return (
    <div className={`rounded-3xl border border-ink/10 bg-surface p-5 ${className}`}>
      <div className="flex items-center gap-3">
        <span className={`size-8 rounded-[0.55rem] ${bone}`} />
        <span className={`h-3 w-32 ${bone}`} />
      </div>
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={`block h-3 ${bone}`} style={{ width: `${88 - i * 14}%` }} />
        ))}
      </div>
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 4)

const row = (n: number, type: TransactionItem['type'], amount: string, hoursAgo: number): TransactionItem => ({
  id: `landing-${n}`,
  user_id: 'demo',
  type,
  currency: 'USDT',
  amount,
  status: 'completed',
  source: null,
  description: null,
  tx_hash: null,
  reference: `MF-DEMO-${n}`,
  network: null,
  address: null,
  fee: '0',
  expires_at: null,
  deposit_id: null,
  withdrawal_id: null,
  meta: {},
  created_at: new Date(Date.now() - hoursAgo * 36e5).toISOString(),
})

const ARRIVED = row(1, 'daily_yield', '25.00000000', 0)

/** Everything on screen at second `t` of the loop */
function at(t: number, perDay: number) {
  const landed = t >= LANDS
  const secs = landed ? Math.max(0, 86399 - Math.floor(t - LANDS - 0.4)) : Math.max(0, Math.ceil(COUNT_FROM - t))
  const since = t - LANDS
  const lift = landed ? ease(since / COUNT_MS) : 0
  const earned = BASE_EARNED + perDay * lift
  return {
    secs: landed && since < 0.4 ? 0 : secs, // the clock rests on zero for a beat as the payout lands
    earned: Math.round(earned * 100) / 100,
    landed,
    flash: landed && since < 2.4,
    fade: t < 0.5 ? t / 0.5 : t > LOOP - 0.5 ? (LOOP - t) / 0.5 : 1,
  }
}

type Snap = ReturnType<typeof at>

function Page({ snap, rate, phone }: { snap: Snap; rate: number; phone: boolean }) {
  const cfg = useAppSettings()
  const perDay = PRINCIPAL * rate
  const wallet = {
    user_id: 'demo',
    deposit_balance: PRINCIPAL.toFixed(8),
    returns_balance: '0',
    referral_balance: '0',
    usdt_balance: (BASE_AVAILABLE + (snap.landed ? perDay : 0)).toFixed(8),
    total_balance: '0',
    total_deposited: '5000',
    total_reinvested: '150',
    total_returns: '0',
    total_referral: '0',
    total_earned: snap.earned.toFixed(8),
    total_withdrawn: '120',
  } as WalletData
  const now = new Date()
  const monthly = MONTHS.map((amount, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const last = i === MONTHS.length - 1
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, amount: (amount + (last && snap.landed ? perDay : 0)).toFixed(8) }
  })
  const time = { h: pad(Math.floor(snap.secs / 3600)), m: pad(Math.floor((snap.secs % 3600) / 60)), s: pad(snap.secs % 60) }
  const recent = snap.landed ? [ARRIVED] : []

  const earned = (
    <div className="relative">
      <EarnedCard wallet={wallet} perDay={perDay} rate={rate} monthly={monthly} shownValue={snap.earned} />
    </div>
  )
  const clock = <PayoutClock time={time} />
  const activity = <ActivityCard recent={recent} bones={4 + (snap.landed ? 0 : 1)} flashId={snap.flash ? ARRIVED.id : undefined} />

  if (phone)
    return (
      <div className="flex flex-col gap-5 p-4">
        {earned}
        {clock}
        {activity}
      </div>
    )
  return (
    <>
      <DemoRail active="Dashboard" />
      {/* the page beside the rail (AppLayout: the rail's width + 36px on the left, 32px on the right, 16px from the top) */}
      <div className="absolute left-[276px] right-8 top-4 space-y-5">
        <div className="grid grid-cols-[1.6fr_1fr] gap-5">
          {earned}
          <div className="flex flex-col gap-5">
            {clock}
            <GhostCard lines={2}>
              <ReinvestCard available={BASE_AVAILABLE} perDay={perDay} cfg={cfg} auto={false} onAutoChange={() => {}} onOpen={() => {}} />
            </GhostCard>
          </div>
        </div>
        <div className="grid grid-cols-[1.6fr_1fr] gap-5">
          <GhostCard lines={5}>
            <GrowthCard principal={PRINCIPAL} rate={rate} fresh={false} />
          </GhostCard>
          {activity}
        </div>
      </div>
    </>
  )
}

export default function DashboardDemo() {
  const frame = useRef<HTMLDivElement>(null)
  const playing = usePlaying(frame)
  const cfg = useAppSettings()
  const perDay = PRINCIPAL * cfg.daily_rate
  const [fit, setFit] = useState<{ phone: boolean; w: number; h: number; scale: number; x: number; y: number } | null>(null)
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [snap, setSnap] = useState<Snap>(() => at(still ? LANDS + 3 : 0.5, perDay))

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
        const scale = fw / PHONE_W
        setFit({ phone: true, w: PHONE_W, h: Math.round(fh / scale), scale, x: 0, y: 0 })
      }
    })
    ro.observe(f)
    return () => ro.disconnect()
  }, [])

  // one clock for the whole picture; it only runs while it can be seen, and only re-draws when something on screen changes
  const clockAt = useRef(0)
  useEffect(() => {
    if (still || !playing) return
    let raf = 0
    let last = performance.now()
    let prev = ''
    let drawn = 0
    const tick = (now: number) => {
      clockAt.current = (clockAt.current + (now - last) / 1000) % LOOP
      last = now
      const next = at(clockAt.current, perDay)
      const key = `${next.secs}|${next.earned}|${next.landed}|${next.flash}|${next.fade.toFixed(2)}`
      // at most about 25 re-draws a second: the figure counting up is real components, and the eye cannot tell it from 60
      if (key !== prev && now - drawn >= 40) {
        prev = key
        drawn = now
        setSnap(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, still, perDay])

  return (
    <div ref={frame} className="relative size-full overflow-hidden bg-base">
      {fit && (
        <div
          inert
          aria-hidden="true"
          className="absolute left-0 top-0 origin-top-left bg-base text-left leading-normal text-text"
          style={{ width: fit.w, height: fit.h, transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`, opacity: still ? 1 : snap.fade }}
        >
          <Page snap={snap} rate={cfg.daily_rate} phone={fit.phone} />
        </div>
      )}
    </div>
  )
}
