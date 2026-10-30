import { useCallback, useEffect, useState } from 'react'
import { DashboardIcon } from '@/icons'
import { api } from '@/lib/api'
import type { MeResponse, TransactionItem } from '@/lib/api'
import { useAppSettings, useSettingsReady } from '@/hooks/useAppSettings'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/context/ToastContext'
import { ACTIVITY_ROWS, num } from './utils'
import ActivityCard from './components/ActivityCard'
import DashboardSkeleton from './components/DashboardSkeleton'
import EarnedCard from './components/EarnedCard'
import GrowthCard from './components/GrowthCard'
import PayoutClock from './components/PayoutClock'
import ReinvestCard from './components/ReinvestCard'
import ReinvestEarningsModal from './components/ReinvestEarningsModal'

/*
 * The home screen is about one thing: how the money is working. (Moving money is the Wallet page, every row is History, the team is
 * Referrals.) Principal is locked for good and pays every day for as long as it is there, with no cap, so the one choice that changes
 * anything is what happens to the payouts: take them out, or put them back in and raise the income for good. In order:
 *   1. How much has my money earned, and what does it earn?            EarnedCard (a wide card, with the last six months as a line)
 *   2. When does the next payout land?                                 PayoutClock (top right)
 *   3. How can I make it earn more?                                    ReinvestCard
 *   4. What does the next year look like, and what just happened?      GrowthCard, ActivityCard
 * The cards follow the Referrals page: a wide card beside a narrow column, a coloured tile and a title on each, the big figure under
 * it, and the detail along the bottom.
 */
export default function DashboardPage() {
  const toast = useToast()
  const cfg = useAppSettings()
  const live = useSettingsReady()
  const [data, setData] = useState<MeResponse | null>(() => api.getCached<MeResponse>('/me'))
  const [recent, setRecent] = useState<TransactionItem[]>(
    () => api.getCached<{ items: TransactionItem[] }>('/transactions', { limit: ACTIVITY_ROWS })?.items || []
  )
  const [monthly, setMonthly] = useState<{ month: string; amount: string }[] | null>(null)
  const [loading, setLoading] = useState(() => !api.getCached<MeResponse>('/me'))
  const [failed, setFailed] = useState(false)
  const [earnOpen, setEarnOpen] = useState(false) // reinvest what has been earned

  const load = useCallback(async () => {
    try {
      const [me, tx, earnings] = await Promise.all([
        api.getMe(),
        api.getTransactions({ limit: ACTIVITY_ROWS }),
        api.getMonthlyEarnings().catch(() => null), // the chart is a nicety: the page works without it
      ])
      setData(me)
      setMonthly(earnings?.monthly ?? null)
      setRecent(tx.items || [])
      setFailed(false)
    } catch (err: any) {
      if (!data) setFailed(true)
      toast.error(err.message || 'Failed to load your dashboard')
    } finally {
      setLoading(false)
    }
  }, [data, toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !live) return <DashboardSkeleton /> // the daily rate is part of nearly every figure here, so nothing is drawn with a guess

  if (failed || !data) {
    return (
      <EmptyState
        icon={<DashboardIcon className="size-6" />}
        title="Could not load your dashboard"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => {
          setLoading(true)
          load()
        }}
      />
    )
  }

  const { wallet } = data
  const available = num(wallet.usdt_balance)
  const principal = num(wallet.deposit_balance)
  // the rate is global and every part held at midnight earns, so the coming payout is simply all principal at today's rate
  const perDay = principal * cfg.daily_rate
  // someone who has not put anything in yet sees how to start where the payout and reinvest cards would be
  const fresh = data.investments.length === 0 && num(wallet.total_deposited) === 0

  return (
    <div className="sk-fade space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <EarnedCard wallet={wallet} perDay={perDay} rate={cfg.daily_rate} monthly={monthly} />
        <div className="flex flex-col gap-5">
          <PayoutClock />
          <ReinvestCard
            available={available}
            perDay={perDay}
            cfg={cfg}
            auto={data.profile.auto_reinvest}
            onAutoChange={(auto) => setData({ ...data, profile: { ...data.profile, auto_reinvest: auto } })}
            onOpen={() => setEarnOpen(true)}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <GrowthCard principal={principal} rate={cfg.daily_rate} fresh={fresh} />
        <ActivityCard recent={recent} />
      </div>

      <ReinvestEarningsModal open={earnOpen} available={available} perDay={perDay} cfg={cfg} onClose={() => setEarnOpen(false)} onDone={load} />
    </div>
  )
}
