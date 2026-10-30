import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { WithdrawNetwork, WithdrawQuote } from '@/lib/api'
import { COINS, addressProblem } from '@/lib/coins'
import { formatDecimal } from '@/lib/formatters'
import { useToast } from '@/context/ToastContext'
import { isPausedError, pausedMessage, refreshSettings, useAppSettings, useSettingsReady } from '@/hooks/useAppSettings'
import { ReinvestIcon } from '@/icons'
import ReinvestEarningsModal from '@/features/dashboard/components/ReinvestEarningsModal'
import CoinPicker from './CoinPicker'
import AmountField from './AmountField'
import PausedNotice from './PausedNotice'
import WithdrawProgress, { type Sent } from './WithdrawProgress'
import WithdrawReview, { rateLabel } from './WithdrawReview'
import type { ReviewHandle } from './WithdrawReview'
import LegalWindow from '@/components/legal/LegalWindow'
import { LEGAL_DOCS } from '@/components/legal/legal'

export default function WithdrawPanel({
  available,
  principal,
  onDone,
  onScene,
  onReview,
}: {
  available: number
  /** locked principal: what the daily income is paid on, for the "reinvest instead" comparison */
  principal: number
  onDone?: () => void
  onScene?: (sent: Sent | null) => void
  /** told while the review is open (with the way back), and null when it is not: the card puts a Back pill where the tabs are */
  onReview?: (r: ReviewHandle | null) => void
}) {
  const toast = useToast()
  const cfg = useAppSettings()
  const live = useSettingsReady()
  const paused = live ? pausedMessage(cfg, 'withdraw') : null

  const [network, setNetwork] = useState<WithdrawNetwork | ''>('')
  const [amount, setAmount] = useState('')
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null) // set after a withdrawal is taken: the card then shows it being sent
  useEffect(() => onScene?.(sent), [sent]) // eslint-disable-line react-hooks/exhaustive-deps
  // "Continue" opens the review (a snapshot of what was typed, so nothing shifts under the user); "Confirm" there sends it
  const [review, setReview] = useState<{ amount: number; network: WithdrawNetwork; address: string } | null>(null)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => onReview?.(review ? { back: () => setReview(null) } : null), [review]) // eslint-disable-line react-hooks/exhaustive-deps
  const [notice, setNotice] = useState<string | null>(null)
  // switched off while the review is open: back to the form, which says why
  useEffect(() => {
    if (paused && review) {
      setReview(null)
      toast.error(paused)
    }
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps
  const [agree, setAgree] = useState(false)
  const [touched, setTouched] = useState(false) // the address has been left once: from then on a wrong one is flagged as it is edited
  const [terms, setTerms] = useState<HTMLElement | null>(null) // the Terms link, which the legal window opens out of

  const net = COINS.find((n) => n.code === network)
  const num = parseFloat(amount)
  const addr = address.trim()
  const addrOk = !!net && net.re.test(addr)
  const problem = net ? addressProblem(net, addr) : null
  const shownProblem = touched ? problem : null
  const addrBad = !!shownProblem
  // what the button says when the amount itself is the problem (the API checks the same two things)
  const amountIssue = !live ? 'Loading…' : !isNaN(num) && num > 0 ? (num > available ? 'Insufficient balance' : num < cfg.min_withdraw_usdt ? `Minimum ${cfg.min_withdraw_usdt} USDT` : null) : null

  // Reinvest instead: the same money, kept earning. Shown for what is typed (or all of it), whenever it could be reinvested.
  const [reinvestOpen, setReinvestOpen] = useState(false)
  const keep = !isNaN(num) && num >= cfg.min_reinvest_usdt && num <= available ? num : available
  const canReinvest = available >= cfg.min_reinvest_usdt && !pausedMessage(cfg, 'reinvest')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (paused) return toast.error(paused)
    if (isNaN(num) || num <= 0) return toast.error('Enter a withdrawal amount')
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim().replace(/\.$/, ''))) return toast.error('Use at most 2 decimal places')
    if (num < cfg.min_withdraw_usdt) return toast.error(`Minimum withdrawal is ${cfg.min_withdraw_usdt} USDT`)
    if (num > available) return toast.error(`You can withdraw up to ${formatDecimal(available)} USDT. Deposited principal stays locked.`)
    if (!network || !net) return toast.error('Pick how you want to receive it')
    if (!agree) return toast.error('Please confirm the terms to continue')
    if (!addrOk) {
      setTouched(true)
      return toast.error(problem ?? `That is not a valid ${net.symbol} address`)
    }
    setNotice(null)
    setReview({ amount: num, network, address: addr })
  }

  const reset = () => {
    setAmount('')
    setAddress('')
    setTouched(false)
    setAgree(false)
  }

  const confirm = async (quote: WithdrawQuote) => {
    if (!review || !net) return
    // everything the card shows afterwards about this withdrawal: what left, the fee, what arrives and in which coin, and where
    const receipt = (txId: string, status: string, q: WithdrawQuote, sentAmount?: string): Sent => ({
      amount: review.amount,
      fee: Number(q.fee),
      receive: sentAmount ?? q.receive,
      rate: net.symbol === 'USDT' ? null : rateLabel(net.symbol, Number(q.net), Number(q.receive)),
      symbol: net.symbol,
      address: review.address,
      txId,
      status,
    })
    try {
      setBusy(true)
      const res = await api.withdraw({ amount: review.amount, network: review.network, address: review.address, expected_receive: quote.receive })
      setSent(receipt(res.transaction_id, res.status, quote, res.payout_amount))
      setReview(null)
      reset()
      onDone?.()
    } catch (err) {
      const e = err as ApiError
      if (isPausedError(e.code)) {
        // switched off just now: nothing was taken from the balance. The page looks at the settings again and shows the pause.
        void refreshSettings()
        toast.error(e.message)
        setReview(null)
      } else if (e.status === 409) {
        // the price moved against what was shown: show the new numbers and let them decide again
        setNotice(e.message)
        setRefresh((r) => r + 1)
      } else if (e.status === 502 || e.status === 503) {
        // the payout was refused (and the balance restored), or it never got as far as the balance: shown as the failure it is
        // (the form keeps what was typed)
        setSent(receipt('', 'failed', quote))
        setReview(null)
      } else if (!(e instanceof ApiError) || e.status >= 500) {
        // no answer, or an unexpected server error: it may well have gone through, so it is NOT shown as failed (that invites a
        // second withdrawal). The balance and the list are reloaded, and the user is told to look there first.
        toast.error('We could not confirm your withdrawal. Check your recent withdrawals before trying again.')
        setReview(null)
        reset()
        onDone?.()
      } else {
        toast.error(e.message || 'Withdrawal request failed')
        setReview(null)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    // the form stays in place (hidden) while the sending scene plays over it, so the card never changes height
    <div className="relative flex flex-1 flex-col">
    <form
      onSubmit={submit}
      inert={!!sent || !!review}
      aria-hidden={!!sent || !!review}
      className={`flex flex-1 flex-col gap-4 transition-opacity duration-500 ${sent || review ? 'pointer-events-none opacity-0' : ''}`}
    >
      {/* on a phone they sit in a tinted container of their own; the fields stay at the top, under the tabs (on a phone, with the whole screen to fill); the terms and the button stay at the bottom */}
      <div className="flex-1">
        {paused && <div className="mb-4"><PausedNotice message={paused} /></div>}
        <div className="flex flex-col gap-4 max-sm:rounded-3xl max-sm:bg-ink/[0.04] max-sm:p-4">
        <CoinPicker lead="Receive as" coins={COINS} value={network} onChange={(c) => setNetwork(c)} />

        <AmountField
          id="withdraw-amount"
          label="You withdraw"
          action={
            available > 0 ? (
              <button
                type="button"
                onClick={() => setAmount((Math.floor(available * 100) / 100).toFixed(2))}
                className="rounded-full bg-ink/[0.07] px-3 py-1 text-xs font-semibold tabular-nums text-text transition-[background-color,scale] hover:bg-ink/[0.12] active:scale-95"
              >
                Max <span className="text-muted">{formatDecimal(Math.floor(available * 100) / 100)}</span>
              </button>
            ) : (
              <span className="text-xs tabular-nums text-muted">Available 0.00</span>
            )
          }
          max={available > 0 ? Math.floor(available * 100) / 100 : undefined}
          value={amount}
          onChange={setAmount}
        />

        {canReinvest && (
          <div className="flex items-center gap-3 rounded-[1.25rem] bg-accent2/[0.07] py-2.5 pl-4 pr-2 ring-1 ring-inset ring-accent2/20">
            <ReinvestIcon className="size-5 shrink-0 text-accent2" />
            <p className="min-w-0 flex-1 text-xs text-muted">
              Keep it earning instead:{' '}
              <span className="font-semibold tabular-nums text-text">{formatDecimal(keep)} USDT</span> would pay{' '}
              <span className="font-semibold tabular-nums text-accent2">+{formatDecimal(keep * cfg.daily_rate)}</span> a day, every day.
            </p>
            <button
              type="button"
              onClick={() => setReinvestOpen(true)}
              className="shrink-0 rounded-full bg-accent2 px-3.5 py-1.5 text-xs font-bold text-[color:var(--color-base)] transition-[opacity,scale] hover:opacity-90 active:scale-95"
            >
              Reinvest
            </button>
          </div>
        )}

        <section className="relative">
          <div
            className={`flex items-center gap-1 rounded-[1.25rem] bg-ink/5 pl-4 pr-1 ring-1 ring-inset transition focus-within:ring-primary/60 ${
              addrBad ? 'ring-rose-500/50' : 'ring-transparent'
            }`}
          >
            <input
              id="wallet-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => addr && setTouched(true)}
              aria-invalid={addrBad}
              aria-describedby={addrBad ? 'wallet-address-error' : undefined}
              placeholder={net ? `Your ${net.symbol} address · ${net.example}` : 'Your wallet address'}
              aria-label="Your wallet address"
              autoComplete="off"
              spellCheck={false}
              className="h-12 min-w-0 flex-1 bg-transparent font-mono text-sm text-text outline-none placeholder:font-sans placeholder:text-muted/50"
            />
            {addrOk && <Check className="mr-3 size-4 shrink-0 text-primary" aria-label="Valid address" />}
          </div>
          {shownProblem && (
            // a floating guide, not a line of text: it hangs over what is below the field, so nothing in the card moves
            <div id="wallet-address-error" role="alert" className="view-in pointer-events-none absolute inset-x-3 top-full z-20 mt-2">
              <p className="rounded-lg border border-rose-300/25 bg-popover px-3 py-2 text-[11px] leading-snug text-text/80 shadow-[0_16px_40px_-8px_color-mix(in_srgb,var(--color-shade)_60%,transparent)]">
                {shownProblem}
              </p>
              {/* drawn after the box, in its own colour, so it covers the box's top edge: the tip and the box read as one shape */}
              <span aria-hidden="true" className="absolute -top-[5px] left-7 size-2.5 rotate-45 rounded-tl-[2px] border-l border-t border-rose-300/25 bg-popover" />
            </div>
          )}
        </section>
        </div>
      </div>

      <div className="space-y-3 pt-1">
        <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-muted">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="peer sr-only" />
          <span
            aria-hidden="true"
            className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-ink/[0.06] ring-1 ring-inset ring-ink/15 transition peer-checked:bg-primary peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60 [&>svg]:scale-0 peer-checked:[&>svg]:scale-100"
          >
            <Check className="size-3.5 text-base transition-transform" strokeWidth={3} />
          </span>
          <span>
            I agree to the{' '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setTerms(e.currentTarget)
              }}
              className="text-text/70 underline decoration-ink/20 underline-offset-2 transition-colors hover:text-text hover:decoration-ink/60"
            >
              {LEGAL_DOCS.terms.title}
            </button>
            .
          </span>
        </label>
        <button
          type="submit"
          disabled={!!paused || !!amountIssue || available <= 0 || !net || !(num > 0) || !addrOk || !agree}
          className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-base transition hover:opacity-90 disabled:opacity-50"
        >
          {paused ? 'Withdrawals paused' : (amountIssue ?? 'Continue')}
        </button>
      </div>

      {terms && (
        <LegalWindow
          doc={LEGAL_DOCS.terms}
          source={terms}
          onClosed={() => {
            terms.focus({ preventScroll: true })
            setTerms(null)
          }}
        />
      )}
    </form>

    {review && net && (
      <div className="wd-in absolute inset-0">
        <WithdrawReview
          amount={review.amount}
          coin={net}
          address={review.address}
          busy={busy}
          notice={notice}
          refresh={refresh}
          onConfirm={confirm}
        />
      </div>
    )}

    {sent && (
      <div className="wd-in absolute inset-0">
        <WithdrawProgress sent={sent} onDone={() => setSent(null)} onSettled={() => onDone?.()} />
      </div>
    )}

    <ReinvestEarningsModal
      open={reinvestOpen}
      available={available}
      perDay={principal * cfg.daily_rate}
      cfg={cfg}
      initial={keep}
      onClose={() => setReinvestOpen(false)}
      onDone={() => {
        reset()
        onDone?.()
      }}
    />
    </div>
  )
}
