import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { CoinIcon } from '@/icons'
import { useToast } from '@/context/ToastContext'
import { coinAmount } from './WithdrawReview'
import { api } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import WaitingClock from './WaitingClock'
import RollingLines, { type Lines, type Stage } from './RollingLines'

export interface Sent {
  amount: number // USDT taken from the balance
  fee: number // USDT, the network fee
  receive: string // what arrives, in the coin
  rate: string | null // "1 BTC ≈ … USDT", for any coin but USDT
  symbol: string
  address: string
  txId: string
  /** what the API said when it took the request: 'completed' once the payout is final, otherwise it still has to go out */
  status: string
}

// the scene is paced so each step can be read, however fast the payout really is
const SETTLE_NOT_BEFORE = 3200 // the clock has had its intro and a turn or two
const POLL_MS = 2500
const GIVE_UP_MS = 180_000

const LINES: Lines = {
  '0': { head: 'Withdrawal submitted', sub: 'Your request is in' },
  '1': { head: 'Processing', sub: 'Sending it out now' },
  '2': { head: 'Sent', sub: 'On its way to your wallet' },
  failed: { head: 'Could not send', sub: 'Your balance has been restored' },
}

const PILL = 40
const PILL_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * What was sent, as a pill in the card's top row (where the tabs are while there is nothing to show). Closed it is just the amount,
 * on the left. Tapped, it grows into the row and down, showing the address it went to with a copy button. It opens over what is
 * below it (nothing is pushed down, the card keeps its height) and closes on a second tap, a tap outside, or Escape.
 */
export function SentPill({ sent }: { sent: Sent }) {
  const { amount, fee, receive, rate, symbol, address } = sent
  const fixed = symbol === 'USDT'
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [slotW, setSlotW] = useState(0) // the room the row gives it, which is how wide it opens
  const [closedW, setClosedW] = useState(0) // how wide it is when closed: just its content
  const [extra, setExtra] = useState(190) // the height of what opens
  const slot = useRef<HTMLDivElement>(null)
  const ghost = useRef<HTMLSpanElement>(null)
  const more = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const roots: [Element | null, () => void][] = [
      [slot.current, () => setSlotW(slot.current!.offsetWidth)],
      [ghost.current, () => setClosedW(ghost.current!.offsetWidth)],
      [more.current, () => setExtra(more.current!.offsetHeight)],
    ]
    const ros = roots.map(([el, fn]) => {
      if (!el) return null
      fn()
      const ro = new ResizeObserver(fn)
      ro.observe(el)
      return ro
    })
    return () => ros.forEach((r) => r?.disconnect())
  }, [])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !slot.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Copied', 'copied')
    } catch {
      toast.error('Could not copy. Select the address and copy it by hand.')
    }
  }

  const head = (
    <>
      <CoinIcon symbol={symbol} className="size-5 shrink-0" />
      <span className="text-sm font-bold tabular-nums text-text">{formatDecimal(amount)}</span>
      <span className="text-[11px] font-semibold text-muted">USDT</span>
    </>
  )
  const row = (label: string, value: string, strong = false) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm tabular-nums ${strong ? 'font-bold text-text' : 'font-semibold text-text'}`}>{value}</span>
    </div>
  )

  return (
    <div ref={slot} className="wd-in absolute inset-x-0 top-0 z-30" style={{ height: PILL }}>
      {/* the same content, unseen, only to know how wide the closed pill is */}
      <span ref={ghost} aria-hidden="true" className="invisible absolute left-0 top-0 inline-flex items-center gap-1.5 whitespace-nowrap pl-3 pr-3.5">
        {head}
        <ChevronDown className="size-3.5" />
      </span>
      <div
        className={`absolute left-0 top-0 overflow-hidden rounded-[1.25rem] ring-1 ring-inset ${open ? 'bg-raised ring-ink/10' : 'bg-ink/[0.06] ring-transparent hover:bg-ink/10'}`}
        style={{
          width: open ? slotW : closedW || undefined,
          height: open ? PILL + extra : PILL,
          transition: `width 380ms ${PILL_EASE}, height 380ms ${PILL_EASE}, background-color 300ms`,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Show the details of this withdrawal"
          className="flex w-full items-center gap-1.5 whitespace-nowrap pl-3 pr-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
          style={{ height: PILL }}
        >
          {head}
          <ChevronDown className={`size-3.5 shrink-0 text-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* the receipt: what left, the fee, what arrives (in which coin), at what rate, and where to */}
        <div ref={more} className={`px-4 pb-2 transition-opacity duration-300 ${open ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'}`} aria-hidden={!open}>
          <div className="divide-y divide-ink/[0.07]">
            {row('You withdrew', `${formatDecimal(amount)} USDT`)}
            {row('Network fee', `−${formatDecimal(fee)} USDT`)}
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-muted">Receive</span>
              <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-text">
                <CoinIcon symbol={symbol} className="size-4" />
                {fixed ? '' : '≈ '}{coinAmount(receive, symbol)} {symbol}
              </span>
            </div>
            {!fixed && rate && row('Rate', rate)}
            <button type="button" onClick={copy} tabIndex={open ? 0 : -1} aria-label="Copy the address" className="flex w-full cursor-pointer items-start justify-between gap-4 py-2 text-left outline-none">
              <span className="text-sm text-muted">To</span>
              <span className="max-w-[78%] break-all text-right font-mono text-xs font-semibold leading-snug text-primary">{address}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * What a withdrawal does after Submit, played out in the card in place of the form (which keeps its height, so nothing resizes).
 * The clock (WaitingClock) does the acting: its intro is "submitted", its loop is "processing", and when the payout is final it
 * turns green and its hands become a tick. The result is only shown once the payout really is final: the status is checked until
 * then. "Done" returns to the form at any point; the payout carries on.
 */
export default function WithdrawProgress({ sent, onDone, onSettled }: { sent: Sent; onDone: () => void; onSettled: () => void }) {
  const [stage, setStage] = useState<Stage>(0)
  const [outcome, setOutcome] = useState<'sent' | 'failed' | null>(null)
  const final = useRef<'completed' | 'failed' | null>(sent.status === 'completed' ? 'completed' : sent.status === 'failed' ? 'failed' : null)
  const settled = useRef(onSettled)
  settled.current = onSettled

  useEffect(() => {
    let alive = true
    const t0 = performance.now()
    const timers: number[] = []
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(() => alive && fn(), ms))

    const resolve = () => {
      const f = final.current
      if (!f) return
      later(() => {
        setOutcome(f === 'completed' ? 'sent' : 'failed')
        setStage(f === 'completed' ? 2 : 'failed')
        settled.current()
      }, Math.max(0, SETTLE_NOT_BEFORE - (performance.now() - t0)))
    }

    if (final.current) resolve()
    else {
      const poll = async () => {
        try {
          const r = await api.getTransactions({ type: 'withdraw', limit: 20 })
          const tx = r.items.find((i) => i.id === sent.txId)
          if (tx?.status === 'completed') final.current = 'completed'
          else if (tx?.status === 'failed') final.current = 'failed'
        } catch {
          /* try again on the next tick */
        }
        if (!alive) return
        if (final.current) return resolve()
        if (performance.now() - t0 < GIVE_UP_MS) later(poll, POLL_MS)
      }
      later(poll, 1500)
    }
    return () => {
      alive = false
      timers.forEach(clearTimeout)
    }
  }, [sent.txId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex size-full flex-col items-center text-center" role="status" aria-live="polite">
      {/* the clock and its words sit in the middle of the card (what was sent is the pill in the top row) */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1">
      {/* the artwork is much bigger than the disc in it: it is drawn large and pulled in at the edges so it takes little room */}
      <WaitingClock outcome={outcome} onIntroDone={() => setStage((s) => (s === 0 ? 1 : s))} className="-my-3 size-44 shrink-0" />

      <RollingLines stage={stage} lines={LINES} />

      </div>

      <button
        type="button"
        onClick={onDone}
        className="h-12 w-full shrink-0 rounded-full bg-ink/[0.07] text-sm font-semibold text-text transition-[background-color,scale] hover:bg-ink/[0.12] active:scale-[0.98]"
      >
        Done
      </button>
    </div>
  )
}
