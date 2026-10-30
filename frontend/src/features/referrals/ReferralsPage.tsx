import { useCallback, useEffect, useState } from 'react'
import { useCountUp } from '@/hooks/useCountUp'
import { ArrowUpRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChartIcon, GiftIcon } from '@/icons'
import { api } from '@/lib/api'
import type { ReferralOverview } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tile } from '@/components/ui/SettingsUI'
import EarningsChart, { EarningsChartSkeleton } from '@/components/charts/EarningsChart'
import EarningsList from './components/EarningsList'
import InviteCard from './components/InviteCard'
import Companion from './components/Companion'
import TeamList from './components/TeamList'
import TierFilter from './components/TierFilter'
import { voltSay } from './mascot/events'
import TiersPanel from './components/TiersPanel'
import { bone, panel } from './components/shared'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'team', label: 'Team' },
] as const
type Tab = (typeof TABS)[number]['id']

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralOverview | null>(() => api.getCached<ReferralOverview>('/referrals/overview'))
  const [failed, setFailed] = useState(false)

  // The tab, the chosen tier and the page live in the address (/referrals?tab=earnings&tier=2&page=3), so a reload, the back button or a shared
  // link lands on the same view. The defaults (Overview, all tiers / tier 1) are left out of it.
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.find((t) => t.id === params.get('tab'))?.id ?? 'overview'
  const maxTier = data?.levels.length || 5
  const tierParam = parseInt(params.get('tier') ?? '', 10)
  const validTier = tierParam >= 1 && tierParam <= maxTier ? tierParam : null
  const pageParam = parseInt(params.get('page') ?? '', 10)
  const page = pageParam >= 1 ? pageParam : 1
  const earnLevel = tab === 'earnings' ? (validTier ?? 0) : 0 // 0 = every tier
  const teamLevel = tab === 'team' ? (validTier ?? 1) : 1

  const setTab = (id: Tab) => {
    voltSay({
      text:
        id === 'team'
          ? 'Here is everyone in your team, tier by tier.'
          : id === 'earnings'
            ? 'Every commission you have earned, newest first.'
            : 'This is how each tier pays you.',
      mood: 'think',
      ms: 3800,
    })
    setParams((p) => {
      const next = new URLSearchParams(p) // keeps anything else in the address, like ?profile
      if (id === 'overview') next.delete('tab')
      else next.set('tab', id)
      next.delete('tier')
      next.delete('page') // a new tab starts on its first page
      return next
    })
  }
  // Moving through pages is a step you can go back from; a correction (a page past the end) is not
  const setPage = (n: number, replace = false) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (n <= 1) next.delete('page')
        else next.set('page', String(n))
        return next
      },
      { replace },
    )
  const setTier = (level: number, fallback: number) => {
    voltSay({ text: level === fallback ? 'Showing the lot again.' : `Only tier ${level}, coming right up.`, mood: 'think', ms: 3000 })
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (level === fallback) next.delete('tier')
        else next.set('tier', String(level))
        next.delete('page') // a new filter starts on its first page
        return next
      },
      { replace: true }, // choosing a filter does not add a step to the back button
    )
  }

  const load = useCallback(() => {
    setFailed(false)
    api
      .getReferralOverview()
      .then(setData)
      .catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])

  // The total counts up to its value when the page opens
  const total = useCountUp(data ? parseFloat(data.total_earned) : 0)
  const earnedNum = data ? parseFloat(data.total_earned) : 0
  const availableNum = data ? parseFloat(data.available) : 0
  const withdrawn = Math.max(earnedNum - availableNum, 0) // what has already been taken out of the referral balance
  const tierList = Array.from({ length: data?.levels.length || 5 }, (_, i) => i + 1)

  if (failed) {
    return (
      <EmptyState
        icon={<GiftIcon className="size-6" />}
        title="Could not load your referrals"
        description="Check your connection and try again."
        actionLabel="Try again"
        onAction={load}
      />
    )
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* What has been earned */}
        <section className={`${panel} p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Tile icon={ChartIcon} tone="green" />
              <p className="text-sm font-semibold text-text">Referral earnings</p>
            </div>
            <Link
              to="/wallet?tab=withdraw"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink/[0.06] pl-3.5 pr-3 text-xs font-bold text-text transition-[background-color,scale] hover:bg-ink/10 active:scale-95"
            >
              Withdraw
              <ArrowUpRight className="size-3.5 text-muted" />
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            {data ? (
              <p className="text-4xl font-black leading-none tracking-tight text-text tabular-nums sm:text-5xl">
                <span className="mr-1.5 align-top text-xl font-bold text-muted sm:text-2xl">$</span>
                {formatDecimal(total)}
              </p>
            ) : (
              <span className={`h-9 w-52 sm:h-12 ${bone}`} />
            )}
            {data && (
              <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold tabular-nums text-primary">
                +${formatDecimal(data.this_month)} this month
              </span>
            )}
          </div>

          <div className="mt-4">{data ? <EarningsChart monthly={data.monthly} /> : <EarningsChartSkeleton />}</div>

          {/* How much can be taken out, and how much already has been */}
          <div className="mt-4 grid grid-cols-2 divide-x divide-ink/[0.06] border-t border-ink/[0.06] pt-4">
            <div>
              <p className="flex items-center gap-2 text-xs text-muted">
                <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                Available to withdraw
              </p>
              {data ? (
                <p className="mt-1 text-xl font-bold tabular-nums text-text">${formatDecimal(data.available)}</p>
              ) : (
                <span className={`mt-1 block h-7 w-24 ${bone}`} />
              )}
            </div>
            <div className="pl-5">
              <p className="flex items-center gap-2 text-xs text-muted">
                <span className="size-2 rounded-full bg-ink/25" aria-hidden="true" />
                Already withdrawn
              </p>
              {data ? (
                <p className="mt-1 text-xl font-bold tabular-nums text-text">${formatDecimal(withdrawn)}</p>
              ) : (
                <span className={`mt-1 block h-7 w-24 ${bone}`} />
              )}
            </div>
          </div>
        </section>

        {/* Mo in a card of its own, above the card with the link */}
        <div className="flex flex-col gap-5">
          <section className={panel}>
            <Companion data={data} onTab={setTab} />
          </section>
          <section className={panel}>
            <InviteCard data={data} />
          </section>
        </div>
      </div>

      {/* One frame around the tabs, their filter and what they show */}
      <div className="space-y-3 rounded-3xl border border-ink/10 bg-surface p-3 sm:p-4">
        {/* Tabs, and on the lists a filter to the right of them */}
        <div className="flex items-center justify-between gap-3">
          <div role="tablist" aria-label="Referral sections" className="flex min-w-0 flex-1 rounded-full bg-ink/5 p-1 sm:inline-flex sm:flex-none">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`ref-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`ref-panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex-none sm:px-6 ${
                  tab === t.id ? 'bg-ink/10 text-text' : 'text-muted hover:text-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'earnings' && (
            <TierFilter
              value={earnLevel}
              onChange={(v) => setTier(v, 0)}
              options={[{ value: 0, label: 'All tiers' }, ...tierList.map((l) => ({ value: l, label: `Tier ${l}` }))]}
            />
          )}
          {tab === 'team' && (
            <TierFilter
              value={teamLevel}
              onChange={(v) => setTier(v, 1)}
              options={(data?.levels.length ? data.levels : [{ level: 1, members: 0 }]).map((l) => ({
                value: l.level,
                label: `Tier ${l.level}`,
                count: l.members,
              }))}
            />
          )}
        </div>

        <div key={tab} role="tabpanel" id={`ref-panel-${tab}`} aria-labelledby={`ref-tab-${tab}`} className="animate-in fade-in duration-300">
          {tab === 'overview' && <TiersPanel data={data} />}
          {tab === 'earnings' && <EarningsList key={earnLevel} level={earnLevel} page={page} onPage={setPage} />}
          {tab === 'team' && <TeamList key={teamLevel} level={teamLevel} page={page} onPage={setPage} />}
        </div>
      </div>
    </div>
  )
}
