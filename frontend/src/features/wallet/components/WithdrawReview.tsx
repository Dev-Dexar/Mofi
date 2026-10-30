import { useEffect, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { WithdrawQuote } from '@/lib/api'
import type { Coin } from '@/lib/coins'
import { formatDecimal } from '@/lib/formatters'
import { CoinIcon } from '@/icons'
import { useToast } from '@/context/ToastContext'

export interface ReviewHandle {
  back: () => void
}

/** a coin amount as the API sent it (up to 8 places), without trailing zeros */
export const coinAmount = (v: string, symbol: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: symbol === 'USDT' ? 2 : 8, minimumFractionDigits: symbol === 'USDT' ? 2 : 0 }) : v
}

/** "1 BTC ≈ 67,000.30 USDT": what one coin costs, from the quote's own numbers (the part that is converted, over what it buys) */
export const rateLabel = (symbol: string, net: number, receive: number) => {
  if (!(receive > 0)) return '—'
  const rate = net / receive
  return `1 ${symbol} ≈ ${rate.toLocaleString('en-US', { minimumFractionDigits: rate >= 100 ? 2 : 0, maximumFractionDigits: rate >= 100 ? 2 : 4 })} USDT`
}

/**
 * The pill that takes the tabs' place while the review is open: it goes back to the form. (Escape does the same.)
 * It sits in the card's top row, over the faded tabs, so the review itself needs no controls up there.
 */
export function BackPill({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onBack()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onBack])
  return (
    <button
      type="button"
      onClick={onBack}
      className="wd-in absolute left-0 top-0 z-30 inline-flex h-10 items-center gap-1 rounded-full bg-raised/75 pl-3 pr-4 text-sm font-semibold text-text outline-none backdrop-blur-xl transition-[background-color,scale] hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-95"
    >
      <ChevronLeft className="size-4 text-muted" />
      Back
    </button>
  )
}

/**
 * The step between "Continue" and the payout: what leaves the balance, the network fee (the user pays it, out of the amount, because the
 * payout is made in another coin), what will arrive, and where. The numbers are the server's own quote, so what is confirmed here
 * is what is charged. If the price has moved when the user confirms, the API refuses and this refreshes with the new numbers.
 */
export default function WithdrawReview({
  amount,
  coin,
  address,
  busy,
  notice,
  refresh,
  onConfirm,
}: {
  amount: number
  coin: Coin
  address: string
  busy: boolean
  /** a line above the button, e.g. that the price changed */
  notice: string | null
  /** bump to fetch the quote again */
  refresh: number
  onConfirm: (quote: WithdrawQuote) => void
}) {
  const [quote, setQuote] = useState<WithdrawQuote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const toast = useToast()

  useEffect(() => {
    let alive = true
    setError(null)
    api
      .getWithdrawQuote(amount, coin.code)
      .then((q) => alive && setQuote(q))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : 'Could not get the price. Please try again.'))
    return () => {
      alive = false
    }
  }, [amount, coin.code, refresh, tries])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      toast.success('Copied', 'copied')
    } catch {
      toast.error('Could not copy. Select the address and copy it by hand.')
    }
  }

  const loading = !quote && !error
  // what one coin costs in USDT, worked out from the quote itself (the part that is converted, over what it buys), so it always agrees with the amount shown
  const rateText = quote ? rateLabel(coin.symbol, Number(quote.net), Number(quote.receive)) : '—'
  const fixed = coin.symbol === 'USDT'

  return (
    <div className="flex size-full flex-col">
      {/* the answer first: what will arrive */}
      <div className="flex flex-1 flex-col items-center justify-center pb-1.5 text-center">
        <CoinIcon symbol={coin.symbol} className="size-11" />
        <p className="mt-1.5 text-xs text-muted">You receive{fixed ? '' : ' about'}</p>
        {loading ? (
          <div className="sk mt-2 h-9 w-44" />
        ) : (
          <p className="mt-1 max-w-full truncate text-[2.1rem] font-bold tabular-nums leading-none text-text">
            {quote ? coinAmount(quote.receive, coin.symbol) : '—'} <span className="text-sm font-semibold text-muted">{coin.symbol}</span>
          </p>
        )}
      </div>

      {/* what it is made of, and where it goes */}
      <div className="divide-y divide-ink/[0.07] rounded-2xl bg-ink/[0.04] px-4">
        <Row label="You withdraw" value={`${formatDecimal(amount)} USDT`} />
        <Row label="Network fee" value={loading ? null : quote ? `−${formatDecimal(Number(quote.network_fee))} USDT` : '—'} />
        {!fixed && <Row label="Conversion fee" value={loading ? null : quote ? `−${formatDecimal(Number(quote.conversion_fee))} USDT` : '—'} />}
        {!fixed && <Row label="Rate" value={loading ? null : rateText} />}
        {/* tap the address to copy it */}
        <button type="button" onClick={copy} aria-label="Copy the address" className="flex w-full cursor-pointer items-start justify-between gap-4 py-2 text-left outline-none">
          <span className="text-sm text-muted">To</span>
          <span className="max-w-[78%] break-all text-right font-mono text-xs font-semibold leading-snug text-primary">{address}</span>
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {(error || notice) && (
          <p role="alert" className={`px-1 text-center text-[11px] leading-snug ${error ? 'text-rose-300' : 'text-accent2'}`}>
            {error ?? notice}
          </p>
        )}
        {error ? (
          <button
            type="button"
            onClick={() => setTries((t) => t + 1)}
            className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-base transition hover:opacity-90"
          >
            Try again
          </button>
        ) : (
          <button
            type="button"
            disabled={!quote || busy}
            onClick={() => quote && onConfirm(quote)}
            className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-base transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Confirm withdrawal'}
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      {value === null ? <span className="sk h-4 w-20" /> : <span className="text-sm font-semibold tabular-nums text-text">{value}</span>}
    </div>
  )
}
