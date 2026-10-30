import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { AdminStatsResponse, AdminUserRow, AdminUserSort, Paged } from '@/lib/api'
import PillSelect from '@/components/ui/PillSelect'
import SidePanel from '@/components/ui/SidePanel'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { UsersIcon } from '@/icons'
import { useToast } from '@/context/ToastContext'
import AdminUserDetails from './AdminUserDetails'
import { Badge, CardPager, FilterBar, UserCell, day, money } from './components/ui'

const SORTS: { value: AdminUserSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'principal', label: 'Most principal' },
  { value: 'withdrawable', label: 'Most withdrawable' },
  { value: 'deposited', label: 'Most deposited' },
  { value: 'withdrawn', label: 'Most withdrawn' },
]
const FILTERS = [
  { value: '', label: 'Everyone' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'admin', label: 'Admins' },
]

const PAGE_SIZE = 25

// same widths for the header, the rows and the placeholders, so nothing jumps when the data arrives
const cols = (
  <colgroup>
    <col className="w-[27%]" />
    <col className="w-[13%]" />
    <col className="w-[13%]" />
    <col className="w-[14%]" />
    <col className="w-[11%]" />
    <col className="w-[11%]" />
    <col className="w-[11%]" />
  </colgroup>
)

const compact = (v: string | number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v))

const controlCls = 'h-10 rounded-full bg-ink/5 px-4 text-[13px] font-medium text-text outline-none transition hover:bg-ink/10'

/**
 * Every account, laid out like the History page: a strip of totals, then one card holding the filter bar (it stays pinned while
 * you scroll), the table and its footer. Searchable by name, email, referral code or id. A row opens that account in a panel sliding in from the right
 * over the list, at /admin/users/:id (the list's own search, filter and page stay in the address, so closing lands back on them).
 */
export default function AdminUsersPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { id: openId } = useParams()
  const { search: query } = useLocation()
  // reached by a link or a reload the panel is simply there; opened by a click it slides in
  const [instantOpen] = useState(() => !!openId)
  const open = (id: string) => navigate(`/admin/users/${id}${query}`)
  // the address holds the search, filter, sort and page, so a reload or the Back button lands on the same list
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const filter = params.get('filter') ?? ''
  const sort = (params.get('sort') as AdminUserSort) || 'newest'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [typed, setTyped] = useState(search)
  const [data, setData] = useState<Paged<AdminUserRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState<AdminStatsResponse['stats'] | null>(
    () => api.getCached<AdminStatsResponse>('/admin/stats')?.stats || null
  )

  const set = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    if (!('page' in next)) p.delete('page')
    setParams(p, { replace: true })
  }

  useEffect(() => {
    api
      .getAdminStats()
      .then((r) => setTotals(r.stats))
      .catch(() => {}) // the strip is a nicety; the list still works without it
  }, [])

  // the search runs a moment after typing stops
  useEffect(() => {
    if (typed === search) return
    const t = window.setTimeout(() => set({ q: typed.trim() }), 300)
    return () => window.clearTimeout(t)
  }, [typed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true
    setLoading(true)
    api
      .adminUsers({
        search: search || undefined,
        status: filter === 'active' || filter === 'suspended' ? filter : undefined,
        role: filter === 'admin' ? 'admin' : undefined,
        sort,
        page,
        limit: PAGE_SIZE,
      })
      .then((r) => live && setData(r))
      .catch((e) => toast.error(e.message || 'Could not load users'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [search, filter, sort, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = !!(search || filter)
  const reset = () => {
    setTyped('')
    setParams({}, { replace: true })
  }

  const head = (
    <thead>
      <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
        <th className="py-3 pl-5 pr-3 font-semibold">User</th>
        <th className="px-3 py-3 font-semibold">Account</th>
        <th className="px-3 py-3 text-right font-semibold">Principal</th>
        <th className="px-3 py-3 text-right font-semibold">Withdrawable</th>
        <th className="px-3 py-3 text-right font-semibold">Deposited</th>
        <th className="px-3 py-3 text-right font-semibold">Withdrawn</th>
        <th className="py-3 pl-3 pr-5 text-right font-semibold">Joined</th>
      </tr>
      <tr aria-hidden="true">
        <td colSpan={7} className="px-4 pb-0 pt-0">
          <div className="h-px bg-ink/10" />
        </td>
      </tr>
    </thead>
  )

  const summary = [
    { label: 'Users', short: 'Users', value: totals ? String(totals.total_users) : null, extra: false },
    { label: 'Investors', short: 'Investors', value: totals ? String(totals.investors) : null, extra: false },
    { label: 'Locked principal', short: 'Principal', value: totals ? `$${compact(totals.principal_locked)}` : null, extra: false },
    { label: 'On auto-reinvest', short: 'Auto-reinvest', value: totals ? String(totals.auto_reinvest_users) : null, extra: true },
  ]

  return (
    <div className="sk-fade space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-3 rounded-3xl border border-ink/10 bg-surface sm:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-ink/10">
        {summary.map((s) => (
          <div key={s.label} className={`min-w-0 px-3 py-4 sm:px-6 ${s.extra ? 'hidden sm:block' : ''}`}>
            {/* one line always, so the figures under the labels sit on the same level: the short name on a phone, the full one from tablet up */}
            <p className="truncate whitespace-nowrap text-xs text-muted">
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </p>
            {s.value === null ? (
              <div className="mt-1 flex h-7 items-center">
                <div className="sk h-4 w-4/5 max-w-28 sm:h-5" />
              </div>
            ) : (
              <p className="sk-fade mt-1 truncate text-lg font-bold tabular-nums tracking-tight text-text sm:text-xl">{s.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* The list */}
      <div className="rounded-3xl border border-ink/10 bg-surface">
        {/* Filters: pinned under the top edge while the table scrolls. Not overflow-hidden, the lists grow down out of it. */}
        <FilterBar>
        <div className="grid grid-cols-1 gap-2.5 p-2 sm:flex sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search name, email, referral code or id"
              aria-label="Search users"
              className={`${controlCls} w-full pl-10 pr-10 placeholder:text-muted`}
            />
            {typed && (
              <button
                type="button"
                onClick={() => {
                  setTyped('')
                  set({ q: '' })
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-text"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:contents">
            <PillSelect label="Show" value={filter} onChange={(v) => set({ filter: v })} options={FILTERS} className="sm:w-36" />
            <PillSelect label="Sort" value={sort} onChange={(v) => set({ sort: v })} options={SORTS} className="sm:w-44" />
          </div>
        </div>
        </FilterBar>

        {/* Table (sideways on small screens) */}
        <div className="no-scrollbar min-h-[320px] overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[900px] table-fixed whitespace-nowrap">
            {cols}
            {head}
            <tbody className={`divide-y divide-ink/5 transition-opacity ${loading && data ? 'opacity-50' : ''}`}>
              {!data &&
                Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} style={{ opacity: 1 - i * 0.08 }}>
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="sk size-8 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="sk h-3 w-24" />
                          <div className="sk h-2.5 w-36" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="sk h-5 w-16" />
                    </td>
                    {['w-16', 'w-16', 'w-14', 'w-14'].map((w, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className={`sk ml-auto h-3 ${w}`} />
                      </td>
                    ))}
                    <td className="py-3 pl-3 pr-5">
                      <div className="sk ml-auto h-3 w-16" />
                    </td>
                  </tr>
                ))}
              {data?.items.map((u) => (
                <tr
                  key={u.id}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('a')) open(u.id) // the name is a link of its own (middle-click opens a tab)
                  }}
                  className="group cursor-pointer transition hover:bg-ink/[0.02]"
                >
                  <td className="py-3 pl-5 pr-3">
                    <UserCell user={u} to={`/admin/users/${u.id}${query}`} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.status === 'suspended' && <Badge tone="red">Suspended</Badge>}
                      {u.role === 'admin' && <Badge tone="gold">Admin</Badge>}
                      {u.auto_reinvest && <Badge tone="green">Auto</Badge>}
                      {u.status === 'active' && u.role === 'user' && !u.auto_reinvest && <span className="font-mono text-xs text-muted">{u.referral_code}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-text">{money(u.principal)}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-text">{money(u.withdrawable)}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-muted">{money(u.deposited)}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-muted">{money(u.withdrawn)}</td>
                  <td className="py-3 pl-3 pr-5 text-right text-xs text-muted">{day(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {data && data.items.length === 0 && (
            <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-14 text-center">
              <UsersIcon className="size-8 text-muted/50" />
              <p className="mt-4 text-sm font-semibold text-text">No users found</p>
              <p className="mt-1 text-xs text-muted">{hasFilters ? 'No one matches those filters.' : 'Accounts will show up here.'}</p>
              {hasFilters && (
                <button type="button" onClick={reset} className="mt-4 text-xs font-semibold text-primary hover:underline">
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {data && <CardPager page={data.page} totalPages={data.total_pages} total={data.total} pageSize={PAGE_SIZE} onPage={(p) => set({ page: String(p) })} />}
      </div>

      {openId && (
        <SidePanel title="Account" instant={instantOpen} onClosed={() => navigate(`/admin/users${query}`)}>
          <ErrorBoundary>
            <AdminUserDetails key={openId} id={openId} />
          </ErrorBoundary>
        </SidePanel>
      )}
    </div>
  )
}
