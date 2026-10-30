import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Ban, Lock } from 'lucide-react'
import NotFoundPage from '@/features/misc/NotFoundPage'
import { api } from '@/lib/api'
import type { AdminActivityKind, AdminTeam, AdminTeamMember, AdminUserDetail, Paged } from '@/lib/api'
import { formatDecimal, truncateText } from '@/lib/formatters'
import { useToast } from '@/context/ToastContext'
import { dateOf, isCredit, timeOf } from '@/features/transactions/txConfig'
import { TypeBadge } from './components/StatusBadge'
import { AdminIcon, CopyIcon, ReactivateIcon } from '@/icons'
import { useCopy } from '@/features/referrals/components/shared'
import SlideTabs from './components/SlideTabs'
import LogNote, { NoteField, NoteLink, NoteWell } from './components/LogNote'
import { ActionDialog, Badge, CardPager, MoneyStatus, UserCell, dangerBtn, day, goodBtn, money, panel, pillBtn, when } from './components/ui'

const ACTIVITY_PAGE = 8
const PARTS_PAGE = 10
const TEAM_PAGE = 8

const TABS: { value: AdminActivityKind; label: string }[] = [
  { value: 'transactions', label: 'History' },
  { value: 'deposits', label: 'Deposits' },
  { value: 'withdrawals', label: 'Withdrawals' },
  { value: 'payouts', label: 'Payouts' },
]

const ACTION_LABEL: Record<string, string> = {
  user_status: 'Status changed',
  user_role: 'Role changed',
  deposit_credit: 'Deposit credited',
  deposit_reject: 'Deposit rejected',
  withdrawal_complete: 'Withdrawal marked delivered',
  withdrawal_refund: 'Withdrawal refunded',
  appeal_accept: 'Appeal accepted',
  appeal_reject: 'Appeal rejected',
}

const TABS_ACCOUNT = [
  { value: 'overview', label: 'Overview' },
  { value: 'activity', label: 'Activity' },
  { value: 'principal', label: 'Principal' },
  { value: 'referrals', label: 'Referrals' },
  { value: 'suspensions', label: 'Suspensions' },
  { value: 'log', label: 'Admin log' },
] as const
type Section = (typeof TABS_ACCOUNT)[number]['value']

type Dialog = 'suspend' | 'reactivate' | 'make-admin' | 'remove-admin' | null

/**
 * One account, everything about it: who they are and how they sign in, their money, their team, every movement, and the admin log.
 * Shown in a panel sliding in over the Users list (see AdminUsersPage), which is addressed as /admin/users/:id.
 */
export default function AdminUserDetails({ id }: { id: string }) {
  const { search } = useLocation() // the list's own search and filters stay in the address while moving between accounts
  const toast = useToast()
  const [u, setU] = useState<AdminUserDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [section, setSection] = useState<Section>('overview')
  const [tab, setTab] = useState<AdminActivityKind>('transactions')
  const [page, setPage] = useState(1)
  const [partsPage, setPartsPage] = useState(1)
  const [team, setTeam] = useState<AdminTeam | null>(null)
  const [teamLevel, setTeamLevel] = useState('1') // '1', '2' … a tier, or 'beyond': everyone past the last tier that pays
  const [teamPage, setTeamPage] = useState(1)
  const [teamLoading, setTeamLoading] = useState(true)
  const [rows, setRows] = useState<Paged<any> | null>(null)

  const load = () =>
    api
      .adminUser(id)
      .then((r) => {
        setU(r)
        setFailed(false)
      })
      .catch((e) => {
        setFailed(true)
        toast.error(e.message || 'Could not load this user')
      })

  useEffect(() => {
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (section !== 'activity') return // fetched when its tab is opened
    let live = true
    setRows(null)
    api
      .adminUserActivity(id, tab, page, ACTIVITY_PAGE)
      .then((r) => live && setRows(r))
      .catch((e) => toast.error(e.message || 'Could not load activity'))
    return () => {
      live = false
    }
  }, [id, tab, page, section]) // eslint-disable-line react-hooks/exhaustive-deps

  // the people in the team, one tier (or the ones past the last tier) a page at a time; fetched when the Referrals tab is opened
  useEffect(() => {
    if (section !== 'referrals') return
    let live = true
    const beyond = teamLevel === 'beyond'
    const level = beyond ? 1 : Number(teamLevel)
    setTeamLoading(true) // the tab's rows give way to the loading rows at once; the head-counts on the tabs stay
    api
      .adminUserTeam(id, { level, beyond, page: teamPage, limit: TEAM_PAGE })
      .then((r) => live && setTeam(r))
      .catch((e) => toast.error(e.message || 'Could not load the team'))
      .finally(() => live && setTeamLoading(false))
    return () => {
      live = false
    }
  }, [id, section, teamLevel, teamPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // is the tab pill pinned under the title bar? (the marker above it has scrolled up behind the bar)
  const tabsSentinel = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    const el = tabsSentinel.current
    if (!el) return
    const root = el.closest<HTMLElement>('.overflow-y-auto')
    const io = new IntersectionObserver(([e]) => setPinned(!e.isIntersecting && e.boundingClientRect.top < (root?.getBoundingClientRect().top ?? 0) + 56), {
      root,
      rootMargin: '-56px 0px 0px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  if (failed && !u) {
    return <NotFoundPage title="ACCOUNT NOT FOUND" backTo="/admin/users" />
  }



  const p = u?.profile
  const w = u?.wallet
  const parts = u?.parts ?? []
  const suspensions = u?.suspensions ?? []
  const adminActions = u?.admin_actions ?? []
  const refLevels = u?.referrals?.level_counts ?? {}
  const suspended = p?.status === 'suspended'
  const openSuspension = suspensions.find((x) => !x.lifted_at)
  const isAdmin = p?.role === 'admin'
  const initial = (p?.full_name || p?.email || '?')[0].toUpperCase()
  const levels = Object.keys(refLevels).sort((a, b) => Number(a) - Number(b))
  // holdings: the principal they have locked plus what they can withdraw (returns and commission)
  const holdings = w ? Number(w.deposit_balance || 0) + Number(w.usdt_balance || 0) : 0
  const split = [
    { label: 'Principal', value: w?.deposit_balance ?? 0, color: '#199e70' },
    { label: 'Returns', value: w?.returns_balance ?? 0, color: '#c98500' },
    { label: 'Commission', value: w?.referral_balance ?? 0, color: '#3987e5' },
  ]
  const teamSize = Object.values(refLevels).reduce((n, c) => n + Number(c), 0)
  const beyondCount = team ? Object.entries(team.counts || {}).reduce((n, [lv, c]) => n + (Number(lv) > team.max_level ? c : 0), 0) : null
  const counts: Partial<Record<Section, number>> = u
    ? {
        principal: parts.length,
        referrals: teamSize + (beyondCount ?? 0),
        suspensions: suspensions.length,
        log: adminActions.length,
      }
    : {}

  return (
    // a container: its layout follows the width of the panel it is in, not the screen
    <div className="@container sk-fade space-y-6">

      {/* Who: one card. A suspended account's status is a band across its top (the lock, the date, the reason a tap away), and its photo
          carries a small lock, so there is no second box and no badge repeating it. */}
      <div className={`overflow-hidden rounded-3xl border bg-surface ${suspended ? 'border-rose-500/30' : 'border-ink/10'}`}>
        {suspended && (
          <div className="flex items-center justify-between gap-4 bg-rose-500/[0.1] px-5 py-2.5 text-[13px]">
            <p className="flex min-w-0 items-center gap-2 font-semibold text-rose-300">
              <Lock className="size-3.5 shrink-0" />
              <span className="truncate">Suspended{p?.status_changed_at && ` on ${day(p.status_changed_at)}`}</span>
            </p>
            <span className="shrink-0">
              <NoteLink label="View reason" title={openSuspension ? `Suspension ${openSuspension.reference}` : 'Why they are suspended'}>
                <NoteWell>
                  <NoteField label="Reason (admins only)" internal>
                    {openSuspension?.reason ?? p?.status_reason ?? ''}
                  </NoteField>
                  <NoteField label="Shown to the user">{openSuspension?.public_reason || 'Violation of our Terms of Service'}</NoteField>
                </NoteWell>
              </NoteLink>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-5 p-5 @xl:flex-row @xl:items-center @xl:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="relative shrink-0">
              {p?.avatar_url ? (
                <img src={p.avatar_url} alt="" className={`size-16 rounded-full object-cover ring-2 ${suspended ? 'ring-rose-400/40' : 'ring-ink/15'}`} />
              ) : (
                <span className={`grid size-16 place-items-center rounded-full bg-ink/10 text-2xl font-bold text-primary ring-2 ${suspended ? 'ring-rose-400/40' : 'ring-transparent'}`}>
                  {u ? initial : ''}
                </span>
              )}
              {suspended && (
                <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full bg-rose-500 text-white ring-2 ring-surface">
                  <Lock className="size-3" strokeWidth={2.5} />
                </span>
              )}
            </span>
            <div className="min-w-0">
              {u ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-xl font-black tracking-tight text-text">{p?.full_name || 'No name'}</h1>
                    {isAdmin && <Badge tone="gold">Admin</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted">{p?.email}</p>
                  {p?.id && (
                    <div className="mt-1.5">
                      <CopyId id={p.id} />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="sk h-5 w-48" />
                  <div className="sk mt-2 h-3.5 w-56" />
                </>
              )}
            </div>
          </div>
        {u && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {suspended ? (
              <button onClick={() => setDialog('reactivate')} className={goodBtn}>
                <ReactivateIcon className="size-4" />
                Reactivate
              </button>
            ) : (
              <button onClick={() => setDialog('suspend')} className={dangerBtn}>
                <Ban className="size-3.5" />
                Suspend
              </button>
            )}
            {isAdmin ? (
              <button onClick={() => setDialog('remove-admin')} className={dangerBtn}>
                <AdminIcon className="size-4" />
                Remove admin
              </button>
            ) : (
              <button onClick={() => setDialog('make-admin')} className={pillBtn}>
                <AdminIcon className="size-4" />
                Make admin
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Tabs, like the wallet's Deposit / Withdraw switch. They float under the panel's title bar while a part scrolls: a see-through, blurred pill, with no band behind it, so content passes under it. */}
      <div ref={tabsSentinel} aria-hidden="true" className="-mb-px h-px" />
      {/* on a phone the pill stretches out toward the panel's edges once it is pinned, the way the History filter bar does */}
      <div
        className={`pointer-events-none sticky top-14 z-30 -mx-4 px-4 pt-1 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:-mx-5 sm:px-5 ${pinned ? 'max-sm:px-1' : ''}`}
      >
        <div className="pointer-events-auto">
          <SlideTabs<Section>
            glass
            label="Account sections"
            value={section}
            onChange={setSection}
            options={TABS_ACCOUNT.map((t) => ({ value: t.value, label: t.label, count: counts[t.value] }))}
          />
        </div>
      </div>

      {section === 'overview' && (
        // one card, three parts divided by hairlines: no boxes inside boxes
        <div className={`${panel} divide-y divide-ink/[0.06] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_32px_-12px_color-mix(in_srgb,var(--color-shade)_50%,transparent)]`}>
          {/* Holdings: what they hold, split into where it sits. The bar is the split; the legend under it names each part. */}
          <section className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Holdings</p>
                {u ? (
                  <p className="sk-fade mt-1.5 truncate text-3xl font-black tabular-nums tracking-tight text-text">{money(holdings)}</p>
                ) : (
                  <div className="sk mt-2 h-8 w-40" />
                )}
              </div>
              {u && (
                <span className="shrink-0 pt-1 text-xs text-muted">
                  {parts.length} principal {parts.length === 1 ? 'part' : 'parts'}
                </span>
              )}
            </div>

            <div className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-black/40 p-px shadow-[inset_0_1px_3px_color-mix(in_srgb,var(--color-shade)_70%,transparent),0_1px_0_rgba(255,255,255,0.05)]" role="img" aria-label="Principal, returns and commission as shares of their holdings">
              {u &&
                holdings > 0 &&
                split.map((x) => Number(x.value) > 0 && <span key={x.label} className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(Number(x.value) / holdings) * 100}%`, background: x.color }} />)}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3">
              {split.map((x) => (
                <div key={x.label} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: x.color }} />
                    <span className="truncate">{x.label}</span>
                  </dt>
                  <dd className="mt-1 truncate text-sm font-bold tabular-nums text-text">{u ? money(x.value) : <span className="sk inline-block h-4 w-14" />}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* All time, in the order the money moves: in, earned, put back, out */}
          <section>
            <p className="px-5 pt-3.5 text-xs font-semibold uppercase tracking-wide text-muted">All time</p>
            <div className="grid grid-cols-2 @2xl:grid-cols-4 [&>*]:px-5 [&>*]:py-3 [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:border-ink/[0.06] @2xl:[&>*+*]:border-l @2xl:[&>*+*]:border-ink/[0.06] [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-ink/[0.06] @2xl:[&>*:nth-child(n+3)]:border-t-0">
              <Figure label="Deposited" value={w && money(w.total_deposited)} />
              <Figure label="Earned" value={w && money(w.total_earned)} tone="text-primary" />
              <Figure label="Reinvested" value={w && money(w.total_reinvested)} />
              <Figure label="Withdrawn" value={w && money(w.total_withdrawn)} />
            </div>
          </section>

          {/* The account in two groups of what belongs together: who they are, then how they sign in and what they have switched on */}
          {/* set a step back into the card: darker, with a soft shadow along its top edge */}
          <section className="grid grid-cols-1 gap-x-10 gap-y-5 bg-black/20 px-5 py-4 shadow-[inset_0_10px_14px_-12px_color-mix(in_srgb,var(--color-shade)_70%,transparent)] @2xl:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Profile</p>
              <dl className="mt-1 divide-y divide-ink/[0.06]">
                <Row label="Status" value={u && (suspended ? 'Suspended' : 'Active')} on={u ? !suspended : undefined} />
                <Row label="Role" value={u && (isAdmin ? 'Admin' : 'Member')} />
                <Row label="Joined" value={u && day(p?.created_at)} />
                <Row label="Signed up with" value={u && (p?.signup_method === 'google' ? 'Google' : 'Email')} />
              </dl>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Security &amp; settings</p>
              <dl className="mt-1 divide-y divide-ink/[0.06]">
                <Row label="Email confirmed" value={u && (u.auth ? (u.auth.email_confirmed ? 'Yes' : 'No') : '—')} on={u?.auth ? u.auth.email_confirmed : undefined} />
                <Row label="Two-factor" value={u && (u.auth ? (u.auth.two_factor ? 'On' : 'Off') : '—')} on={u?.auth ? u.auth.two_factor : undefined} />
                <Row label="Auto-reinvest" value={u && (p?.auto_reinvest ? 'On' : 'Off')} on={u ? !!p?.auto_reinvest : undefined} />
                <Row label="Last sign-in" value={u && when(u.auth?.last_sign_in_at)} />
              </dl>
            </div>
          </section>
        </div>
      )}

      {section === 'referrals' && (
        <>
          <Facts
            title="Referrals"
            ready={!!u}
            rows={[
              ['Referral code', <span key="referral_code" className="font-mono">{p?.referral_code}</span>],
              [
                'Invited by',
                u?.sponsor ? (
                  <Link key="sponsor_link" to={`/admin/users/${u.sponsor.id}${search}`} className="text-text hover:underline">
                    {u.sponsor.full_name || u.sponsor.email}
                  </Link>
                ) : (
                  'No one'
                ),
              ],
              ['In the paid tiers', String(teamSize)],
              ['Past the paid tiers', beyondCount === null ? '—' : String(beyondCount)],
            ]}
          />
          <div className={`${panel} p-5`}>
            <h2 className="text-sm font-semibold text-text">Team by level</h2>
            <div className="mt-3 overflow-hidden rounded-2xl border border-ink/[0.06]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-ink/[0.03] text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-semibold">Level</th>
                    <th className="px-4 py-2 text-right font-semibold">Members</th>
                    <th className="px-4 py-2 text-right font-semibold">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/[0.06]">
                  {levels.map((l) => (
                    <tr key={l}>
                      <td className="px-4 py-2 text-muted">Level {l}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text">{refLevels[l] ?? 0}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-text">{money(u?.referrals?.earnings_by_level?.[l] ?? 0)}</td>
                    </tr>
                  ))}
                  {u && levels.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-muted">
                        No team yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* The people: a tier at a time, and the ones past the last paying tier on their own tab, so nobody in the team goes unlisted */}
          <div className={`${panel} overflow-hidden`}>
            <div className="flex items-baseline justify-between gap-4 px-5 pb-3 pt-4">
              <h2 className="text-sm font-semibold text-text">People in their team</h2>
              {/* past the last paying tier, the reason these people earn nothing is a tap away, not a paragraph in the card */}
              {teamLevel === 'beyond' && (
                <span className="shrink-0 text-xs">
                  <NoteLink label="Why no commission?" title="Past the paid tiers">
                    <NoteWell>
                      <NoteField label="About these people">
                        {`They are in this user's team, but below level ${team?.max_level ?? 5}, the last tier that pays commission. Their deposits earn this user nothing.`}
                      </NoteField>
                    </NoteWell>
                  </NoteLink>
                </span>
              )}
            </div>
            {/* one tab per tier, sharing the card's width; short labels (L1, L2 …) on a narrow panel */}
            <div className="px-5 pb-4">
              {team ? (
                <SlideTabs
                  size="sm"
                  label="Team tier"
                  value={teamLevel}
                  options={[
                    ...Array.from({ length: team.max_level }, (_, i) => ({
                      value: String(i + 1),
                      label: (
                        <>
                          <span className="@xl:hidden">L{i + 1}</span>
                          <span className="hidden @xl:inline">Level {i + 1}</span>
                        </>
                      ),
                      count: team.counts[String(i + 1)],
                    })),
                    ...(beyondCount
                      ? [
                          {
                            value: 'beyond',
                            label: (
                              <>
                                <span className="@xl:hidden">Beyond</span>
                                <span className="hidden @xl:inline">Past tiers</span>
                              </>
                            ),
                            count: beyondCount,
                          },
                        ]
                      : []),
                  ]}
                  onChange={(v) => {
                    setTeamLevel(v)
                    setTeamPage(1)
                  }}
                />
              ) : (
                <div className="sk h-9 w-full" />
              )}
            </div>
            <div className="border-t border-ink/[0.06]">
              <div className="no-scrollbar overflow-x-auto">
                <TeamTable members={teamLoading ? null : (team?.items ?? null)} beyond={teamLevel === 'beyond'} search={search} page={teamPage} />
              </div>
              {team && !teamLoading && team.items.length === 0 && <p className="px-5 py-12 text-center text-sm text-muted">No one at this level.</p>}
            </div>
            {team && !teamLoading && team.total > 0 && <CardPager page={team.page} totalPages={team.total_pages} total={team.total} pageSize={TEAM_PAGE} onPage={setTeamPage} />}
          </div>
        </>
      )}

      {section === 'principal' && (
        <>
      {/* Principal parts */}
      {u && parts.length > 0 ? (
        <div className={`${panel} overflow-hidden`}>
          <div className="px-5 pb-3 pt-4">
            <h2 className="text-sm font-semibold text-text">Principal parts</h2>
            <p className="mt-0.5 text-xs text-muted">Each deposit or reinvestment is one part, earning the daily rate on its own.</p>
          </div>
          <div className="no-scrollbar overflow-x-auto border-t border-ink/[0.06]">
            <table className="w-full min-w-[580px] table-fixed text-left @xl:min-w-0">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[16%]" />
                <col className="w-[19%]" />
                <col className="w-[19%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <th className="px-3 py-2.5 font-semibold first:pl-5">Started</th>
                  <th className="px-3 py-2.5 font-semibold">From</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Principal</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Paid so far</th>
                  <th className="px-3 py-2.5 text-right font-semibold last:pr-5">Last paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 border-t border-ink/5">
                {parts.slice((partsPage - 1) * PARTS_PAGE, partsPage * PARTS_PAGE).map((part) => (
                  <tr key={part.id} className="transition-colors hover:bg-ink/[0.02]">
                    <td className="px-3 py-3 first:pl-5">{stamp(part.started_at)}</td>
                    <td className="px-3 py-3">
                      <TypeBadge type={part.source} />
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-text">{money(part.principal)}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums text-primary">{money(part.earned_total)}</td>
                    <td className="px-3 py-3 text-right text-sm text-muted last:pr-5">{part.last_payout_date ? dateOf(`${part.last_payout_date}T12:00:00`) : 'Not yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* the totals over every part (not just this page), as one pill like the page bar under it, each figure named */}
          <div className={`mx-3 mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-full border border-ink/10 bg-ink/[0.03] px-5 py-2.5 text-sm sm:mx-4 sm:mt-4 ${parts.length > PARTS_PAGE ? '' : 'mb-3 sm:mb-4'}`}>
            <span className="font-semibold text-muted">
              {parts.length} {parts.length === 1 ? 'part' : 'parts'}
            </span>
            <span className="flex flex-wrap items-center gap-x-6 gap-y-0.5 tabular-nums">
              <span className="text-muted">
                Principal <span className="font-semibold text-text">{money(parts.reduce((n, x) => n + Number(x.principal), 0))}</span>
              </span>
              <span className="text-muted">
                Paid <span className="font-semibold text-primary">{money(parts.reduce((n, x) => n + Number(x.earned_total), 0))}</span>
              </span>
            </span>
          </div>
          {parts.length > PARTS_PAGE && (
            <CardPager page={partsPage} totalPages={Math.ceil(parts.length / PARTS_PAGE)} total={parts.length} pageSize={PARTS_PAGE} onPage={setPartsPage} />
          )}
        </div>
      ) : (
        <p className="rounded-3xl border border-ink/10 px-5 py-12 text-center text-sm text-muted">{u ? 'No principal yet.' : ''}</p>
      )}
        </>
      )}

      {section === 'activity' && (
        <div className={`${panel} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text">Activity</h2>
              <p className="mt-0.5 min-h-4 text-xs tabular-nums text-muted">{rows ? `${rows.total} ${KIND_NOUN[tab]}` : ''}</p>
            </div>
            <SlideTabs
              size="sm"
              fill={false}
              label="Kind of activity"
              value={tab}
              options={TABS}
              onChange={(t) => {
                setTab(t)
                setPage(1)
              }}
            />
          </div>
          {/* a new kind shows its own header and loading rows at once, then its rows fade in, so nothing is left over from the last kind */}
          <div className="border-t border-ink/[0.06]">
            {/* on a phone the table keeps its full width and scrolls sideways; wider panels fit it whole */}
            <div className="no-scrollbar overflow-x-auto">
              <ActivityTable kind={tab} rows={rows?.items ?? null} page={page} />
            </div>
            {rows && rows.items.length === 0 && <p className="px-5 py-12 text-center text-sm text-muted">No {KIND_NOUN[tab]} yet.</p>}
          </div>
          {rows && rows.total > 0 && <CardPager page={rows.page} totalPages={rows.total_pages} total={rows.total} pageSize={ACTIVITY_PAGE} onPage={setPage} />}
        </div>
      )}

      {section === 'suspensions' && (
        <>
      {/* Every suspension, with its appeal: a short card each, the long texts behind "View details" */}
      {u && suspensions.length > 0 ? (
        <div className={`${panel} p-5`}>
          <h2 className="text-sm font-semibold text-text">Suspensions</h2>
          <ul className="mt-3 space-y-3">
            {suspensions.map((s) => (
              <li key={s.id} className="rounded-2xl border border-ink/[0.06] bg-ink/[0.03] p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-semibold text-text">{s.reference}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {when(s.created_at)}
                      {s.by?.email && ` · by ${s.by.email}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {s.lifted_at ? <Badge tone="slate">Lifted {day(s.lifted_at)}</Badge> : <Badge tone="red">Open</Badge>}
                    {s.appeal && (
                      <Badge tone={s.appeal.status === 'pending' ? 'gold' : s.appeal.status === 'accepted' ? 'green' : 'red'}>Appeal {s.appeal.status}</Badge>
                    )}
                  </div>
                </div>

                <p className="mt-3 flex gap-2">
                  <span className="shrink-0 text-muted">Reason</span>
                  <span className="min-w-0 truncate text-text">{s.reason}</span>
                </p>

                <p className="mt-2.5 text-xs">
                  <NoteLink label="View details" title={`Suspension ${s.reference}`}>
                    <NoteWell>
                      <NoteField label="Reason (admins only)" internal>{s.reason}</NoteField>
                      <NoteField label="Shown to the user">{s.public_reason || 'Violation of our Terms of Service'}</NoteField>
                      {s.appeal && <NoteField label={`Their appeal · ${day(s.appeal.created_at)}`} from="user">{s.appeal.message}</NoteField>}
                      {s.appeal?.response && <NoteField label="Our reply">{s.appeal.response}</NoteField>}
                      {s.lift_note && <NoteField label="Note when lifted">{s.lift_note}</NoteField>}
                    </NoteWell>
                  </NoteLink>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-3xl border border-ink/10 px-5 py-12 text-center text-sm text-muted">{u ? 'This account has never been suspended.' : ''}</p>
      )}
        </>
      )}

      {section === 'log' && (
        <>
      {/* What admins have done to this account */}
      {u && adminActions.length > 0 ? (
        <div className={`${panel} p-5`}>
          <h2 className="text-sm font-semibold text-text">Admin log</h2>
          <ul className="mt-3 divide-y divide-ink/[0.06] text-sm">
            {adminActions.map((a, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2.5 @xl:flex-row @xl:items-start @xl:justify-between @xl:gap-4">
                {/* a long note wraps inside the card, however it is written (no spaces to break at) */}
                <span className="min-w-0 text-text [overflow-wrap:anywhere]">
                  {ACTION_LABEL[a.action] ?? a.action}
                  {a.details?.new && <span className="text-muted"> → {String(a.details.new)}</span>}
                  {a.note && (
                    <>
                      <span className="text-muted"> · </span>
                      <LogNote title={ACTION_LABEL[a.action] ?? a.action} note={a.note} who={a.admin_email} at={when(a.created_at)} />
                    </>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted @xl:pt-0.5 @xl:text-right">
                  {a.admin_email} · {when(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-3xl border border-ink/10 px-5 py-12 text-center text-sm text-muted">{u ? 'No admin actions on this account.' : ''}</p>
      )}
        </>
      )}

      <ActionDialog
        open={dialog === 'suspend'}
        title="Suspend this account?"
        body="They can still sign in, but only see the suspension and can appeal it once. Everything else is closed. Their principal keeps earning."
        fields={[
          { key: 'note', label: 'Reason, for admins only', placeholder: 'e.g. suspected duplicate accounts', required: true },
          { key: 'public', label: 'Reason the user will see (optional)', placeholder: 'Left empty, they see: Violation of our Terms of Service' },
        ]}
        confirmLabel="Suspend"
        tone="danger"
        onConfirm={async (v) => {
          const r = await api.adminSetUserStatus(id, 'suspended', v.note, v.public)
          toast.error(r.reference ? `Account suspended (${r.reference})` : 'Account suspended', 'suspended')
          load()
        }}
        onClose={() => setDialog(null)}
      />
      <ActionDialog
        open={dialog === 'reactivate'}
        title="Reactivate this account?"
        body="They can use the app and withdraw again. An appeal still waiting is closed as accepted."
        fields={[{ key: 'note', label: 'Note for the record (optional)', placeholder: 'e.g. identity verified' }]}
        confirmLabel="Reactivate"
        onConfirm={async (v) => {
          await api.adminSetUserStatus(id, 'active', v.note)
          toast.success('Account reactivated', 'reactivated')
          load()
        }}
        onClose={() => setDialog(null)}
      />
      <ActionDialog
        open={dialog === 'make-admin' || dialog === 'remove-admin'}
        title={dialog === 'make-admin' ? 'Make this user an admin?' : 'Remove admin access?'}
        body={
          dialog === 'make-admin'
            ? 'They will see the admin panel and can change settings, settle money and manage every account.'
            : 'They go back to being a regular member.'
        }
        fields={[]}
        confirmLabel={dialog === 'make-admin' ? 'Make admin' : 'Remove admin'}
        tone={dialog === 'make-admin' ? 'primary' : 'danger'}
        onConfirm={async () => {
          await api.adminSetUserRole(id, dialog === 'make-admin' ? 'admin' : 'user')
          if (dialog === 'make-admin') toast.info('Now an admin', 'admin-added')
          else toast.error('Admin access removed', 'admin-removed')
          load()
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  )
}

const KIND_NOUN: Record<AdminActivityKind, string> = { transactions: 'records', deposits: 'deposit attempts', withdrawals: 'withdrawals', payouts: 'daily payouts' }

// fixed column shares per kind, so the table always fits the panel (long values are cut with an ellipsis; on a phone the table keeps a minimum width and scrolls sideways)
const KIND_COLS: Record<AdminActivityKind, { label: string; width: string; right?: boolean }[]> = {
  transactions: [
    { label: 'When', width: 'w-[24%]' },
    { label: 'Type', width: 'w-[22%]' },
    { label: 'Amount', width: 'w-[17%]', right: true },
    { label: 'Status', width: 'w-[17%]' },
    { label: 'Reference', width: 'w-[20%]' },
  ],
  deposits: [
    { label: 'Started', width: 'w-[20%]' },
    { label: 'Reference', width: 'w-[24%]' },
    { label: 'Coin', width: 'w-[11%]' },
    { label: 'Ordered', width: 'w-[15%]', right: true },
    { label: 'Credited', width: 'w-[15%]', right: true },
    { label: 'Status', width: 'w-[15%]' },
  ],
  withdrawals: [
    { label: 'When', width: 'w-[19%]' },
    { label: 'Reference', width: 'w-[24%]' },
    { label: 'Network', width: 'w-[11%]' },
    { label: 'Amount', width: 'w-[15%]', right: true },
    { label: 'To', width: 'w-[16%]' },
    { label: 'Status', width: 'w-[15%]' },
  ],
  payouts: [
    { label: 'Day', width: 'w-[30%]' },
    { label: 'Principal', width: 'w-[26%]', right: true },
    { label: 'Rate', width: 'w-[20%]', right: true },
    { label: 'Paid', width: 'w-[24%]', right: true },
  ],
}

const stamp = (iso: string) => (
  <>
    <p className="truncate text-sm text-text">{dateOf(iso)}</p>
    <p className="mt-0.5 truncate text-xs text-muted">{timeOf(iso)}</p>
  </>
)
const chip = (text: string) => <span className="inline-block rounded-md bg-ink/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{text.replace(/^usdt/, '')}</span>

/** The rows of one activity kind, each kind with its own columns */
function ActivityTable({ kind, rows, page }: { kind: AdminActivityKind; rows: any[] | null; page: number }) {
  const cols = KIND_COLS[kind]
  const td = 'px-3 py-3 first:pl-5 last:pr-5'
  return (
    <table className={`w-full table-fixed text-left @xl:min-w-0 ${cols.length > 5 ? 'min-w-[800px]' : 'min-w-[640px]'}`}>
      <colgroup>
        {cols.map((c) => (
          <col key={c.label} className={c.width} />
        ))}
      </colgroup>
      <thead>
        <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {cols.map((c) => (
            <th key={c.label} className={`px-3 py-2.5 font-semibold first:pl-5 last:pr-5 ${c.right ? 'text-right' : ''}`}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody key={`${page}-${rows ? 'rows' : 'loading'}`} className={`${rows ? 'sk-fade ' : ''}divide-y divide-ink/5 border-t border-ink/5`}>
        {!rows &&
          Array.from({ length: 6 }, (_, i) => (
            <tr key={i} style={{ opacity: 1 - i * 0.12 }}>
              {cols.map((c) => (
                <td key={c.label} className={td}>
                  <div className={`sk h-3.5 w-3/5 ${c.right ? 'ml-auto' : ''}`} />
                  {c === cols[0] && <div className="sk mt-2 h-2.5 w-2/5" />}
                </td>
              ))}
            </tr>
          ))}
        {rows?.map((r) =>
          kind === 'transactions' ? (
            <tr key={r.id} className="transition-colors hover:bg-ink/[0.02]">
              <td className={td}>{stamp(r.created_at)}</td>
              <td className={td}>
                <TypeBadge type={r.type} />
              </td>
              <td className={`${td} text-right text-sm font-bold tabular-nums ${isCredit(r.type) ? 'text-primary' : 'text-text'}`}>
                {isCredit(r.type) ? '+' : '−'}
                {money(r.amount)}
              </td>
              <td className={td}>
                <MoneyStatus status={r.status} />
              </td>
              <td className={`${td} truncate font-mono text-xs text-muted`} title={r.reference}>
                {r.reference}
              </td>
            </tr>
          ) : kind === 'deposits' ? (
            <tr key={r.id} className="transition-colors hover:bg-ink/[0.02]">
              <td className={td}>{stamp(r.created_at)}</td>
              <td className={`${td} truncate font-mono text-xs text-muted`} title={r.reference ?? undefined}>
                {r.reference ?? '—'}
              </td>
              <td className={td}>{chip(r.pay_currency)}</td>
              <td className={`${td} text-right text-sm font-bold tabular-nums text-text`}>{money(r.price_amount)}</td>
              <td className={`${td} text-right text-sm tabular-nums ${r.credited_usdt ? 'text-primary' : 'text-muted'}`}>{r.credited_usdt ? money(r.credited_usdt) : '—'}</td>
              <td className={td}>
                <MoneyStatus status={r.status} />
              </td>
            </tr>
          ) : kind === 'withdrawals' ? (
            <tr key={r.id} className="transition-colors hover:bg-ink/[0.02]">
              <td className={td}>{stamp(r.created_at)}</td>
              <td className={`${td} truncate font-mono text-xs text-muted`} title={r.reference ?? undefined}>
                {r.reference ?? '—'}
              </td>
              <td className={td}>{chip(r.network)}</td>
              <td className={`${td} text-right text-sm font-bold tabular-nums text-text`}>−{money(r.amount)}</td>
              <td className={`${td} truncate font-mono text-xs text-muted`} title={r.address}>
                {truncateText(r.address, 6, 5)}
              </td>
              <td className={td}>
                <MoneyStatus status={r.status} />
              </td>
            </tr>
          ) : (
            <tr key={r.payout_date} className="transition-colors hover:bg-ink/[0.02]">
              <td className={td}>
                <p className="truncate text-sm text-text">{dateOf(`${r.payout_date}T12:00:00`)}</p>
              </td>
              <td className={`${td} text-right text-sm tabular-nums text-text`}>{money(r.eligible_principal)}</td>
              <td className={`${td} text-right text-sm tabular-nums text-muted`}>{formatDecimal(Number(r.rate) * 100, 3)}%</td>
              <td className={`${td} text-right text-sm font-bold tabular-nums text-primary`}>+{money(r.amount)}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  )
}

/** The people in a team: who, when they joined, whether they have started, what they put in and what the user earned from them */
function TeamTable({ members, beyond, search, page }: { members: AdminTeamMember[] | null; beyond: boolean; search: string; page: number }) {
  const td = 'px-3 py-3 first:pl-5 last:pr-5'
  return (
    <table className="w-full min-w-[620px] table-fixed text-left @xl:min-w-0">
      <colgroup>
        <col className="w-[36%]" />
        <col className="w-[17%]" />
        <col className="w-[15%]" />
        <col className="w-[16%]" />
        <col className="w-[16%]" />
      </colgroup>
      <thead>
        <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          <th className="px-3 py-2.5 font-semibold first:pl-5">Member</th>
          <th className="px-3 py-2.5 font-semibold">Joined</th>
          <th className="px-3 py-2.5 font-semibold">Status</th>
          <th className="px-3 py-2.5 text-right font-semibold">Deposited</th>
          <th className="px-3 py-2.5 text-right font-semibold last:pr-5">Earned</th>
        </tr>
      </thead>
      <tbody key={`${page}-${members ? 'rows' : 'loading'}`} className={`${members ? 'sk-fade ' : ''}divide-y divide-ink/5 border-t border-ink/5`}>
        {!members &&
          Array.from({ length: 5 }, (_, i) => (
            <tr key={i} style={{ opacity: 1 - i * 0.14 }}>
              <td className={td}>
                <div className="flex items-center gap-3">
                  <div className="sk size-8 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="sk h-3 w-24" />
                    <div className="sk h-2.5 w-32" />
                  </div>
                </div>
              </td>
              {[0, 1, 2, 3].map((c) => (
                <td key={c} className={td}>
                  <div className={`sk h-3.5 w-3/5 ${c > 1 ? 'ml-auto' : ''}`} />
                </td>
              ))}
            </tr>
          ))}
        {members?.map((m) => (
          <tr key={m.id} className="transition-colors hover:bg-ink/[0.02]">
            <td className={td}>
              <div className="flex min-w-0 items-center gap-3">
                <UserCell user={m} to={`/admin/users/${m.id}${search}`} />
                {beyond && <Badge tone="slate">L{m.level}</Badge>}
              </div>
            </td>
            <td className={td}>{stamp(m.joined_at)}</td>
            <td className={td}>
              {m.status === 'suspended' ? <Badge tone="red">Suspended</Badge> : Number(m.deposited) > 0 ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Joined</Badge>}
            </td>
            <td className={`${td} text-right text-sm tabular-nums ${Number(m.deposited) > 0 ? 'font-bold text-text' : 'text-muted'}`}>{money(m.deposited)}</td>
            <td className={`${td} text-right text-sm tabular-nums ${beyond ? 'text-muted' : Number(m.earned) > 0 ? 'font-semibold text-primary' : 'text-muted'}`} title={beyond ? 'Past the last tier that pays commission' : undefined}>
              {beyond ? '—' : money(m.earned)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** An account id, shortened, that copies whole on a click */
function CopyId({ id }: { id: string }) {
  const copy = useCopy()
  return (
    <button
      type="button"
      onClick={() => copy(id, 'User id')}
      title={id}
      aria-label={`Copy user id ${id}`}
      className="group inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:bg-ink/[0.09] hover:text-text"
    >
      {id.slice(0, 8)}…{id.slice(-6)}
      <CopyIcon className="size-3.5" />
    </button>
  )
}

/** A card of label and value rows */
function Facts({ title, rows, ready }: { title: string; rows: [string, ReactNode][]; ready: boolean }) {
  return (
    <div className={`${panel} p-5`}>
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      <dl className="mt-3 divide-y divide-ink/[0.06] text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 truncate text-right text-text">{ready ? v : <span className="sk inline-block h-3.5 w-24" />}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** A lifetime figure: a small label over the number */
function Figure({ label, value, tone = 'text-text' }: { label: string; value?: string | null; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      {value ? <p className={`mt-0.5 truncate text-[17px] font-bold tabular-nums tracking-tight ${tone}`}>{value}</p> : <div className="sk mt-1.5 h-4 w-16" />}
    </div>
  )
}

/** One fact about the account as a row. `on` adds a dot: green when true, grey when false, none when unknown. */
function Row({ label, value, on }: { label: string; value?: string | null; on?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <p className="text-muted">{label}</p>
      {value ? (
        <p className="flex min-w-0 items-center gap-2 font-medium text-text">
          {on !== undefined && <span className={`size-2 shrink-0 rounded-full ${on ? 'bg-primary' : 'bg-ink/25'}`} />}
          <span className="truncate">{value}</span>
        </p>
      ) : (
        <div className="sk h-4 w-20" />
      )}
    </div>
  )
}
