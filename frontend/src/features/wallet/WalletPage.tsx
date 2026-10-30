import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import PopCard from '@/components/ui/PopCard'
import { SentPill, type Sent } from './components/WithdrawProgress'
import { BackPill, type ReviewHandle } from './components/WithdrawReview'
import { api } from '@/lib/api'
import type { TransactionItem, WalletData } from '@/lib/api'
import { preloadWaitingClock } from './components/WaitingClock'
import PaymentView, { TimerPill, TimerPillSkeleton } from './components/PaymentView'
import DepositPanel from './components/DepositPanel'
import WithdrawPanel from './components/WithdrawPanel'
import WalletChart from './components/WalletChart'
import WalletHistory from './components/WalletHistory'
import { useToast } from '@/context/ToastContext'

const TABS = [
  { id: 'deposit', label: 'Deposit' },
  { id: 'withdraw', label: 'Withdraw' },
] as const
type Tab = (typeof TABS)[number]['id']

/** Deposit and withdraw in one place: balance on top, a switch between the two flows below it */
/** Deposit and withdraw in one place: the flow, then that flow's own history underneath */
export default function WalletPage() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  // The address says everything about the card, so a reload or a shared link brings it back as it was:
  //   /wallet                   minimised            /wallet?focus=1                maximised
  //   /wallet?pay=MF-…          minimised, on that payment      /wallet?pay=MF-…&focus=1   maximised, on that payment
  // (?tab=withdraw picks the Withdraw tab when there is no payment). The page keeps no copy of any of it: it only reads the address.
  const payRef = params.get('pay')
  const popped = params.get('focus') === '1'
  const startedOpen = useRef(popped) // opened by a link: the card is simply there, it does not fly in
  const tab: Tab = !payRef && params.get('tab') === 'withdraw' ? 'withdraw' : 'deposit'
  const [wallet, setWallet] = useState<WalletData | null>(() => api.getCached<any>('/me')?.wallet || null)
  const [history, setHistory] = useState<Record<Tab, TransactionItem[]>>(() => {
    const d = api.getCached<{ items: TransactionItem[] }>('/transactions', { type: 'deposit', limit: 100 })
    const w = api.getCached<{ items: TransactionItem[] }>('/transactions', { type: 'withdraw', limit: 100 })
    return { deposit: d?.items || [], withdraw: w?.items || [] }
  })
  const [loadingHistory, setLoadingHistory] = useState(() => {
    const d = api.getCached<{ items: TransactionItem[] }>('/transactions', { type: 'deposit', limit: 100 })
    const w = api.getCached<{ items: TransactionItem[] }>('/transactions', { type: 'withdraw', limit: 100 })
    return !d && !w
  })
  const [scene, setScene] = useState<Sent | null>(null) // a withdrawal being shown being sent: its pill takes the tabs' place until it is closed
  const [reviewing, setReviewing] = useState<ReviewHandle | null>(null) // the review is open: a Back pill takes the tabs' place
  const sending = !!scene || !!reviewing || !!payRef

  const [deadline, setDeadline] = useState<string | null | undefined>(undefined) // undefined while the payment loads; when the deposit being paid runs out, while it is still unpaid
  const linkFor = (focused: boolean, pay: string | null): Record<string, string> => ({
    ...(pay ? { pay } : tab === 'withdraw' ? { tab: 'withdraw' } : {}),
    ...(focused ? { focus: '1' } : {}),
  })
  const closePay = useCallback(() => setParams(linkFor(popped, null), { replace: true }), [setParams, popped]) // eslint-disable-line react-hooks/exhaustive-deps
  const openPay = (reference: string) => {
    loadHistory()
    setParams(linkFor(true, reference)) // a step in the history, so the browser's back returns to the form
  }
  const minimise = () => setParams(linkFor(false, payRef), { replace: true })
  const maximise = () => setParams(linkFor(true, payRef), { replace: true })
  // the deposit form and the payment trade places with the same blur-and-fade as the tabs
  const [shownPay, setShownPay] = useState(payRef)
  useEffect(() => {
    if (payRef === shownPay) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = window.setTimeout(() => setShownPay(payRef), still ? 0 : 180)
    return () => clearTimeout(t)
  }, [payRef]) // eslint-disable-line react-hooks/exhaustive-deps
  // both panels are mounted from the start and kept (what you typed survives a tab switch, and switching is only a show/hide,
  // so nothing heavy happens in the middle of the height animation)
  const [opened, setOpened] = useState<Tab[]>(['deposit', 'withdraw'])
  const shown = opened.includes(tab) ? opened : [...opened, tab]
  useEffect(() => setOpened(shown), [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadWallet = useCallback(() => {
    api
      .getMe()
      .then((r) => setWallet(r.wallet))
      .catch((err) => toast.error(err.message || 'Failed to load your balance'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadHistory = useCallback(() => {
    Promise.all([
      api.getTransactions({ type: 'deposit', limit: 100 }),
      api.getTransactions({ type: 'withdraw', limit: 100 }),
    ])
      .then(([d, w]) => setHistory({ deposit: d.items, withdraw: w.items }))
      .catch((err) => toast.error(err.message || 'Failed to load your activity'))
      .finally(() => setLoadingHistory(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    preloadWaitingClock() // the clock's player and clip are fetched now, so a result or a failure is on screen the moment it is needed
    loadWallet()
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const available = parseFloat(wallet?.usdt_balance || '0')
  // which panel is on screen: it trails the tab by the length of the fade-out, so the old one blurs away before the new one comes in
  const [shownTab, setShownTab] = useState<Tab>(tab)
  useEffect(() => {
    if (tab === shownTab) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = window.setTimeout(() => setShownTab(tab), still ? 0 : 180)
    return () => clearTimeout(t)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps
  // every view sits in the same spot of one grid cell, so the card is as tall as the tallest of them and never changes height: the ones not
  // shown are only unseen (and out of reach), they still hold their room
  const panelCls = (id: Tab) =>
    `col-start-1 row-start-1 flex flex-col ${shownTab !== id ? 'invisible pointer-events-none' : tab === id ? 'view-in' : 'view-out'}`

  const go = (next: Tab) => setParams({ ...(next === 'deposit' ? {} : { tab: next }), ...(popped ? { focus: '1' } : {}) }, { replace: true })

  return (
    // Three cards in a grid, so nothing is left empty: the flow and its graph side by side (the shorter one stretches to the taller),
    // and the history across the full width under them. (On a phone the order is the flow, the graph, the history.)
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        {/* Flow */}
        <PopCard
          open={popped}
          onClose={minimise}
          instantOpen={startedOpen.current}
          slotClassName="order-1 min-w-0 lg:col-start-2 lg:row-start-1 lg:self-center"
          className="flex min-w-0 flex-col rounded-3xl border border-ink/10 bg-surface p-4 sm:p-6"
        >
          {() => (
          <div className="flex flex-1 flex-col">
          <div className="relative z-20 mb-4 flex items-center gap-2">
          <div className="relative flex-1">
          <div
            role="tablist"
            inert={sending}
            className={`relative grid w-full grid-cols-2 rounded-full bg-ink/[0.04] p-0.5 transition-[opacity,filter] duration-500 ${sending ? 'pointer-events-none opacity-0 blur-[3px]' : ''}`}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-ink/10 transition-transform duration-[450ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]"
              style={{ transform: tab === 'deposit' ? 'translateX(0)' : 'translateX(100%)' }}
            />
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => go(t.id)}
                className={`relative z-10 h-9 rounded-full text-[13px] font-semibold transition-colors duration-300 ${
                  tab === t.id ? 'text-text' : 'text-muted hover:text-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
            {payRef && (deadline === undefined ? <TimerPillSkeleton /> : deadline && <TimerPill at={deadline} />)}
            {scene ? <SentPill key={scene.txId} sent={scene} /> : payRef ? <BackPill onBack={closePay} /> : reviewing && <BackPill onBack={reviewing.back} />}
          </div>
          <button
            type="button"
            onClick={popped ? minimise : maximise}
            aria-label={popped ? 'Back to the page' : 'Focus on payment'}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-raised/75 text-muted backdrop-blur-xl transition-[background-color,color,scale] hover:bg-ink/10 hover:text-text active:scale-90"
          >
            {popped ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          </div>

          {/* The card is as tall as the taller of the two forms and never changes height. A payment is taller than that, so it is laid over
              the cell (out of the flow, so it cannot stretch the card) and scrolls inside it if it has to. */}
          <div className="relative grid min-h-[24rem] flex-1 grid-rows-[1fr]">
          {shown.includes('deposit') && (
            <div className={panelCls('deposit')}>
              {!shownPay && (
                <div className={`flex flex-1 flex-col ${payRef ? 'view-out' : 'view-in'}`}>
                  <DepositPanel onCreated={openPay} />
                </div>
              )}
            </div>
          )}
          {shown.includes('withdraw') && (
            <div className={panelCls('withdraw')}>
              <WithdrawPanel
                onScene={setScene}
                onReview={setReviewing}
                available={available}
                principal={parseFloat(wallet?.deposit_balance || '0')}
                onDone={() => {
                  loadWallet()
                  loadHistory()
                }}
              />
            </div>
          )}
          {shownPay && (
            <div
              // the scrolling area reaches to the card's own edges on every side (it takes back the card's padding, and rises behind the
              // top row), so the payment scrolls behind the top row's buttons instead of being cut off short of them
              className={`pay-scroll absolute flex flex-col ${payRef ? 'view-in' : 'view-out'}`}
            >
              <PaymentView key={shownPay} reference={shownPay} onDeadline={setDeadline} onStatus={() => { loadWallet(); loadHistory() }} />
            </div>
          )}
          </div>
          </div>
          )}
        </PopCard>

        {/* Left: the graph over the recent rows. Right (above): the deposit / withdraw card on its own. */}
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
          <WalletChart kind={tab} items={history[tab]} wallet={wallet} loading={loadingHistory} />
          <WalletHistory kind={tab} items={history[tab].slice(0, 5)} loading={loadingHistory} />
        </div>
    </div>
  )
}
