import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { ApiError, PaymentDetails } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { useToast } from '@/context/ToastContext'
import { COINS } from '@/lib/coins'
import { CoinIcon } from '@/icons'
import { Collapse } from '@/components/ui/Collapse'
import WaitingClock from './WaitingClock'
import RollingLines, { type Lines, type Stage } from './RollingLines'
import { coinAmount } from './WithdrawReview'

const FINAL_OK = ['finished']
const FINAL_BAD = ['failed', 'expired', 'refunded']
// the clock has had its intro and a turn or two before it turns into a result, however fast the gateway was
const SETTLE_NOT_BEFORE = 2600
const stageOf = (status: string): Stage =>
  status === 'finished' ? 2 : FINAL_BAD.includes(status) || status === 'partially_paid' ? 'failed' : status === 'waiting' ? 0 : 1

/**
 * What shows while the payment loads. It is the pay screen's own shape (clock and words, then the QR container with its three rows) in
 * the same sizes, so the card is already its final height, and nothing jumps when the real one takes its place.
 */
function PaySkeleton({ ghost = false }: { ghost?: boolean }) {
  return (
    <div className="text-center" role={ghost ? undefined : 'status'} aria-busy={ghost ? undefined : true} aria-label={ghost ? undefined : 'Loading your payment'} aria-hidden={ghost || undefined}>
      {/* the clock's disc beside its two lines of words */}
      <div className="flex items-center justify-center gap-1">
        <div className="grid size-14 shrink-0 place-items-center">
          <div className="sk size-11" />
        </div>
        <div className="flex w-56 max-w-[70%] shrink-0 flex-col items-start gap-2.5">
          <div className="sk h-3.5 w-36" />
          <div className="sk h-2.5 w-48 max-w-full" />
        </div>
      </div>

      <div className="mt-3 divide-y divide-ink/[0.07] overflow-hidden rounded-2xl bg-ink/[0.04]">
        <div className="flex items-center gap-3 p-3">
          <div className="sk size-28 shrink-0 !rounded-xl" />
          <div className="min-w-0 flex-1 space-y-3 text-left">
            <div className="sk h-2.5 w-20" />
            <div className="flex items-center gap-2">
              <div className="sk size-6 shrink-0" />
              <div className="sk h-5 w-28" />
            </div>
          </div>
        </div>
        <div className="flex min-h-[2.75rem] items-start justify-between gap-4 p-3">
          <div className="sk mt-0.5 h-3 w-5" />
          <div className="sk h-3 w-44 max-w-[75%]" />
        </div>
        <div className="grid grid-cols-2 divide-x divide-ink/[0.07]">
          {[['w-14', 'w-20'], ['w-16', 'w-24']].map(([l, r]) => (
            <div key={l} className="space-y-2 p-3 text-left">
              <div className={`sk h-2.5 ${l}`} />
              <div className={`sk h-3 ${r}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * When the payment cannot be shown: this link is wrong or belongs to another account (404), or it could not be reached. The card keeps
 * the height of the pay screen: the shape of it stays behind, faded and still, and the red cross of a failed payment plays over it.
 */
function PayFailure({ kind, onRetry }: { kind: 'notfound' | 'error'; onRetry: () => void }) {
  const text =
    kind === 'notfound'
      ? { head: 'Payment not found', sub: 'This link is wrong, or the payment belongs to another account.' }
      : { head: 'Could not load your payment', sub: 'Check your connection and try again.' }
  return (
    <div className="relative flex flex-1 flex-col" role="alert">
      {/* the faded shape of the pay screen is only a backdrop: it is held inside the card (it can neither make the card scroll nor
          move what is on it), and the message sits in the middle */}
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden opacity-[0.22] blur-[1.5px] [&_.sk]:after:hidden">
        <PaySkeleton ghost />
      </div>
      <div className="relative m-auto flex flex-col items-center px-6 text-center">
        <WaitingClock outcome="failed" instant className="size-44 shrink-0" />
        <div className="view-in -mt-1">
          <p className="text-base font-semibold text-text">{text.head}</p>
          <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-snug text-muted">{text.sub}</p>
          {kind === 'error' && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 h-10 rounded-full bg-ink/[0.07] px-6 text-sm font-semibold text-text transition-[background-color,scale] hover:bg-ink/[0.12] active:scale-95"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** A filled clock: a disc with its two hands cut out of it */
function ClockFilled({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="currentColor" />
      <path d="M12 6.5V12l3.6 2.2" fill="none" stroke="#111318" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The timer pill's place while the payment loads */
export function TimerPillSkeleton() {
  // (.sk sets its own position, so the placing is done by the box around it)
  return (
    <div className="absolute right-0 top-0 z-30 h-10 w-[5.6rem] rounded-full backdrop-blur-xl" aria-hidden="true">
      <div className="sk size-full" />
    </div>
  )
}

/** The time left of the hour, in the card's top row (where the Back pill is, on the other side). Blue, and red for the last 15 minutes. */
export function TimerPill({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, new Date(at).getTime() - now)
  const m = Math.floor(left / 60_000)
  const sec = Math.floor((left % 60_000) / 1000)
  const low = left < 15 * 60_000 // the last quarter of an hour
  return (
    <div
      role="timer"
      aria-label="Time left to pay"
      className="wd-in absolute right-0 top-0 z-30 inline-flex h-10 items-center gap-2 rounded-full bg-raised/75 pl-3 pr-4 text-text backdrop-blur-xl"
    >
      <ClockFilled className={`size-[1.15rem] transition-colors duration-500 ${low ? 'text-rose-400' : 'text-sky-400'}`} />
      <span className="font-mono text-sm font-bold tabular-nums">
        {String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
      </span>
    </div>
  )
}

/**
 * One deposit, played out in the Wallet card in the same way a withdrawal is: the clock does the acting (waiting, then turning green
 * with a tick when the money is in, or red with a cross if the payment fails) and the words roll under it. While the transfer has
 * still to be made the address, amount and QR are open under the clock; the moment a payment is seen they fold away.
 * Found by the transaction's reference; the server also asks the gateway directly, so a missed webhook is fine.
 */
export default function PaymentView({
  reference,
  onStatus,
  onDeadline,
}: {
  reference: string
  onStatus?: (status: string) => void
  /** when the unpaid deposit runs out (null once it is paid, expired or gone; undefined while it is still loading) */
  onDeadline?: (at: string | null | undefined) => void
}) {
  const toast = useToast()
  const [payment, setPayment] = useState<PaymentDetails | null>(null)
  // why the first load failed: the payment is not there for this account (404), or it could not be reached at all
  const [failure, setFailure] = useState<'notfound' | 'error' | null>(null)
  const missing = failure !== null
  const [stage, setStage] = useState<Stage>(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loaded = useRef(false)
  const lastStatus = useRef('')
  const born = useRef(performance.now())
  const seen = useRef(false)
  const [tick, setTick] = useState(0)
  const [clockKey, setClockKey] = useState(0)
  const [qrFor, setQrFor] = useState('') // the address whose QR picture has arrived
  const shownOutcome = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await api.getPayment(reference)
        if (!alive) return
        loaded.current = true
        setPayment(res)
        if (res.status !== lastStatus.current) {
          // only a change is news: the balance and history are reloaded once, not on every poll
          if (lastStatus.current) onStatus?.(res.status)
          lastStatus.current = res.status
        }
        if (FINAL_OK.includes(res.status) || FINAL_BAD.includes(res.status) || res.status === 'partially_paid') {
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch (err) {
        // a failed poll after the page has loaded just tries again; only a failed first load means 'not found'
        if (alive && !loaded.current) setFailure((err as ApiError).status === 404 ? 'notfound' : 'error')
      }
    }
    load()
    pollRef.current = setInterval(load, 5000)
    return () => {
      alive = false
      if (pollRef.current) clearInterval(pollRef.current)
    }
    // restart only when the link changes or a test state was set; the callbacks are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, tick])

  // the words follow the status; a result waits for the clock's intro to be over
  const status = payment?.status
  useEffect(() => {
    if (!status) return
    const next = stageOf(status)
    // a result seen live waits for the clock's intro; one that is already settled when the page opens is shown at once
    const wait = seen.current && (next === 2 || next === 'failed') ? Math.max(0, SETTLE_NOT_BEFORE - (performance.now() - born.current)) : 0
    seen.current = true
    const t = window.setTimeout(() => setStage(next), wait)
    return () => clearTimeout(t)
  }, [status])

  // the clock plays a result once; if a different result replaces it (only the test buttons can do that) it starts over
  useEffect(() => {
    const o = stage === 2 ? 'sent' : stage === 'failed' ? 'failed' : null
    if (shownOutcome.current && o !== shownOutcome.current) setClockKey((k) => k + 1)
    shownOutcome.current = o
  }, [stage])

  // the hour's deadline goes up to the card's top row, where its pill ticks; at zero the server is asked, and it says expired
  const waitingOn = payment?.status === 'waiting' ? payment.expires_at : null
  useEffect(() => {
    onDeadline?.(payment ? waitingOn : missing ? null : undefined)
    if (!waitingOn) return
    const t = window.setTimeout(() => setTick((n) => n + 1), Math.max(0, new Date(waitingOn).getTime() - Date.now()) + 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingOn, !!payment, missing])
  useEffect(() => () => onDeadline?.(undefined), []) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied', 'copied')
    } catch {
      toast.error('Could not copy. Select it and copy it by hand.')
    }
  }

  if (failure) {
    return (
      <PayFailure
        kind={failure}
        onRetry={() => {
          setFailure(null)
          setTick((t) => t + 1)
        }}
      />
    )
  }

  // (held inside the card like the failure's backdrop: a loading screen has nothing to scroll)
  if (!payment)
    return (
      <div className="relative flex-1">
        <div className="absolute inset-0 overflow-hidden">
          <PaySkeleton />
        </div>
      </div>
    )
  const pay = payment

  const coin = COINS.find((c) => c.code === pay.pay_currency.toLowerCase())
  const symbol = coin?.symbol ?? pay.pay_currency.toUpperCase()
  const address = pay.pay_address ?? ''
  const credited = `${formatDecimal(pay.credited_usdt)} USDT`
  const lines: Lines = {
    '0': { head: 'Waiting for payment', sub: 'Send the exact amount below' },
    '1': {
      confirming: { head: 'Payment received', sub: 'Waiting for the network to confirm it' },
      confirmed: { head: 'Payment confirmed', sub: 'Moving it to your balance' },
      sending: { head: 'Almost there', sub: 'Moving it to your balance' },
    }[pay.status] ?? { head: 'Payment received', sub: 'Waiting for it to be confirmed' },
    '2': { head: 'Deposit confirmed', sub: `${credited} added to your balance` },
    failed: {
      head: { expired: 'Payment expired', partially_paid: 'Not enough was sent' }[pay.status] ?? 'Payment failed',
      sub:
        pay.status === 'partially_paid'
          ? `Contact support with ${pay.reference}`
          : pay.status === 'expired'
            ? 'The hour ran out. Start a new deposit.'
            : 'Nothing was added. Start a new deposit.',
    },
  }
  const paying = stage === 0 && !!address

  const outcome = stage === 2 ? 'sent' : stage === 'failed' ? 'failed' : null

  return (
    <div className="my-auto text-center" role="status" aria-live="polite">
      {/* The clock and its words are in the flow, and the details fold away (they take no room) once there is a result, so a result is
          only the clock and its words, centred in the card, with nothing to scroll. While there is a transfer to make the clock is
          small and the details are open under it. */}
      <div className={paying ? 'flex items-center justify-center gap-1' : 'flex flex-col items-center'}>
        {/* a payment that is already settled is shown again from scratch if the test buttons change the result */}
        <div className={`shrink-0 transition-[width,height,margin] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${paying ? '-my-3 size-20' : 'my-0 size-52'}`}>
          <WaitingClock key={clockKey} outcome={outcome} className="size-full" />
        </div>
        <div className={paying ? 'w-56 max-w-[70%] shrink-0' : 'w-full'}>
          <RollingLines stage={stage} lines={lines} align={paying ? 'start' : 'center'} />
        </div>
      </div>

      <Collapse open={paying}>
        <div>
          {/* one container: the QR and the amount side by side, then where it goes, then what it buys */}
          <div className="mt-3 divide-y divide-ink/[0.07] overflow-hidden rounded-2xl bg-ink/[0.04] text-left">
            <div className="flex items-center gap-3 p-3">
              {/* the picture comes from the QR service: a shimmer holds the tile until it has arrived, instead of a blank white square */}
              <div className={`relative shrink-0 rounded-xl p-2 transition-colors duration-300 ${qrFor === address ? 'bg-white' : 'bg-ink/[0.06]'}`}>
                <img
                  key={address}
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(address)}`}
                  alt="Payment QR code"
                  onLoad={() => setQrFor(address)}
                  className={`size-24 transition-opacity duration-300 ${qrFor === address ? 'opacity-100' : 'opacity-0'}`}
                />
                {qrFor !== address && (
                  <div className="absolute inset-2" aria-hidden="true">
                    <div className="sk size-full !rounded-lg" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => copy(pay.pay_amount ?? '')}
                aria-label="Copy the amount"
                className="min-w-0 flex-1 cursor-pointer rounded-xl text-left outline-none transition-[scale] active:scale-[0.97]"
              >
                {/* two rows, on a phone too: what to send and in which coin, then the amount on one line */}
                <span className="block truncate text-xs text-muted">
                  Send exactly <span className="font-semibold text-text/80">{symbol}</span>
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <CoinIcon symbol={symbol} className="size-6 shrink-0" />
                  <span className="min-w-0 whitespace-nowrap text-lg font-bold leading-tight tabular-nums text-text sm:text-xl">
                    {coinAmount(pay.pay_amount ?? '', symbol)}
                  </span>
                </span>
              </button>
            </div>

            <button type="button" onClick={() => copy(address)} aria-label="Copy the address" className="flex min-h-[2.75rem] w-full cursor-pointer items-start justify-between gap-4 p-3 text-left outline-none transition-colors active:bg-ink/[0.03]">
              <span className="pt-px text-sm text-muted">To</span>
              <span className="max-w-[80%] break-all text-right font-mono text-xs font-semibold leading-snug text-primary">{address}</span>
            </button>

            <div className="grid grid-cols-2 divide-x divide-ink/[0.07]">
              <div className="min-w-0 p-3">
                <p className="text-xs text-muted">Network</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-text">{coin?.network ?? pay.network}</p>
              </div>
              <div className="min-w-0 p-3 pl-4">
                <p className="text-xs text-muted">You receive</p>
                <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-text">{credited}</p>
              </div>
            </div>
          </div>
        </div>
      </Collapse>
    </div>
  )
}
