import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { AdminAppeal, AdminAppealList, AppealFilter } from '@/lib/api'
import PillSelect from '@/components/ui/PillSelect'
import CenterWindow from '@/components/ui/CenterWindow'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { AppealIcon } from '@/icons'
import { useToast } from '@/context/ToastContext'
import { dateOf, timeOf } from '@/features/transactions/txConfig'
import AdminAppealDetails from './AdminAppealDetails'
import { Badge, CardPager, FilterBar, UserCell } from './components/ui'

const FILTERS: { value: AppealFilter; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'Everything' },
]
const PAGE_SIZE = 20

const controlCls = 'h-10 rounded-full bg-ink/5 px-4 text-[13px] font-medium text-text outline-none transition hover:bg-ink/10'

/** How long an appeal has been waiting: "3h", "2d" */
const waited = (iso: string) => {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  return h < 1 ? 'under 1h' : h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`
}

const STATUS = {
  pending: <Badge tone="gold">Waiting</Badge>,
  accepted: <Badge tone="green">Accepted</Badge>,
  rejected: <Badge tone="red">Rejected</Badge>,
} as const

// the same widths for the header, the rows and the loading rows
const cols = (
  <colgroup>
    <col className="w-[26%]" />
    <col className="w-[28%]" />
    <col className="w-[15%]" />
    <col className="w-[15%]" />
    <col className="w-[16%]" />
  </colgroup>
)

/**
 * Suspended users' appeals, laid out like the Users list: a strip of totals, then one card holding the filter bar (search and
 * state), the table and its footer. A row opens that appeal in a popup over the list at /admin/appeals/:id, where it is read and
 * decided; the list's own search, filter and page stay in the address, so closing lands back on them.
 */
export default function AdminAppealsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { id: openId } = useParams()
  const { search: query } = useLocation()
  // reached by a link or a reload the popup is simply there; opened by a click it opens out of the middle
  const [instantOpen] = useState(() => !!openId)
  const open = (id: string) => navigate(`/admin/appeals/${id}${query}`)

  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const filter = (FILTERS.some((f) => f.value === params.get('status')) ? params.get('status') : 'pending') as AppealFilter
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [typed, setTyped] = useState(search)
  const [typing, setTyping] = useState(false) // search focused: on a phone it takes the whole row until focus leaves
  const [data, setData] = useState<AdminAppealList | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  const set = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    if (!('page' in next)) p.delete('page')
    setParams(p, { replace: true })
  }

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
      .adminAppeals({ status: filter, search: search || undefined, page, limit: PAGE_SIZE })
      .then((r) => live && setData(r))
      .catch((e) => toast.error(e.message || 'Could not load appeals'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [filter, search, page, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = !!search || filter !== 'pending'
  const reset = () => {
    setTyped('')
    setParams({}, { replace: true })
  }
  const c = data?.counts
  const summary = [
    { label: 'Waiting', value: c?.pending, tone: c?.pending ? 'text-accent2' : 'text-text' },
    { label: 'Accepted', value: c?.accepted, tone: 'text-text' },
    { label: 'Rejected', value: c?.rejected, tone: 'text-text' },
  ]

  const head = (
    <thead>
      <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
        <th className="py-3 pl-5 pr-3 font-semibold">Member</th>
        <th className="px-3 py-3 font-semibold">Appeal</th>
        <th className="px-3 py-3 font-semibold">Suspension</th>
        <th className="px-3 py-3 font-semibold">Sent</th>
        <th className="py-3 pl-3 pr-5 font-semibold">Status</th>
      </tr>
      <tr aria-hidden="true">
        <td colSpan={5} className="px-4 pb-0 pt-0">
          <div className="h-px bg-ink/10" />
        </td>
      </tr>
    </thead>
  )

  return (
    <div className="sk-fade space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-3 rounded-3xl border border-ink/10 bg-surface [&>*+*]:border-l [&>*+*]:border-ink/10">
        {summary.map((s) => (
          <div key={s.label} className="min-w-0 px-4 py-4 sm:px-6">
            <p className="text-xs text-muted">{s.label}</p>
            {s.value === undefined ? (
              <div className="mt-1 flex h-7 items-center">
                <div className="sk h-4 w-10 sm:h-5" />
              </div>
            ) : (
              <p className={`sk-fade mt-1 text-lg font-bold tabular-nums tracking-tight sm:text-xl ${s.tone}`}>{s.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* The list */}
      <div className="rounded-3xl border border-ink/10 bg-surface">
        {/* Filters: pinned while the table scrolls. Not overflow-hidden, the list grows down out of it. */}
        <FilterBar>
        {/* On a phone the filter sits at the right of the row, fixed, with room kept for it beside the search. While the search has focus the room
              is given up: the search grows over the filter's place, which fades out where it is (nothing slides). When focus leaves, the search
              shrinks back and the filter fades in again in the same place. From sm up they sit side by side and nothing changes. */}
          <div className="relative p-2 sm:flex sm:items-center sm:gap-2.5">
          <div
            className={`relative z-10 min-w-0 transition-[margin] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:mr-0 sm:flex-1 ${
              typing ? 'max-sm:mr-0' : 'max-sm:mr-[9.5rem]'
            }`}
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Search name, email, reference or text"
              aria-label="Search appeals"
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
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
          <div
            className={`max-sm:absolute max-sm:inset-y-2 max-sm:right-2 max-sm:w-36 transition-opacity sm:w-[10rem] ${
              typing ? 'max-sm:pointer-events-none max-sm:opacity-0 duration-[380ms] ease-out' : 'duration-[380ms] ease-out max-sm:delay-150'
            }`}
          >
            <PillSelect label="Show" value={filter} onChange={(v) => set({ status: v === 'pending' ? '' : v })} options={FILTERS} className="w-full" />
          </div>
        </div>
        </FilterBar>

        {/* Table (sideways on small screens) */}
        <div className="no-scrollbar min-h-[320px] overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[860px] table-fixed whitespace-nowrap">
            {cols}
            {head}
            <tbody className={`divide-y divide-ink/5 transition-opacity ${loading && data ? 'opacity-50' : ''}`}>
              {!data &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} style={{ opacity: 1 - i * 0.12 }}>
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="sk size-8 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="sk h-3 w-24" />
                          <div className="sk h-2.5 w-32" />
                        </div>
                      </div>
                    </td>
                    {['w-4/5', 'w-20', 'w-16'].map((w, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className={`sk h-3.5 ${w}`} />
                      </td>
                    ))}
                    <td className="py-3 pl-3 pr-5">
                      <div className="sk h-5 w-16" />
                    </td>
                  </tr>
                ))}
              {data?.items.map((a: AdminAppeal) => (
                <tr
                  key={a.id}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('a')) open(a.id)
                  }}
                  className="group cursor-pointer transition hover:bg-ink/[0.02]"
                >
                  <td className="py-3 pl-5 pr-3">
                    <UserCell user={a.user} to={`/admin/appeals/${a.id}${query}`} />
                  </td>
                  <td className="truncate px-3 py-3 text-sm text-muted" title={a.message}>
                    {a.message}
                  </td>
                  <td className="truncate px-3 py-3 font-mono text-xs text-muted">{a.suspension?.reference ?? '—'}</td>
                  <td className="px-3 py-3">
                    <p className="truncate text-sm text-text">{dateOf(a.created_at)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{timeOf(a.created_at)}</p>
                  </td>
                  <td className="py-3 pl-3 pr-5">
                    {STATUS[a.status]}
                    {a.status === 'pending' && <p className="mt-1 text-xs text-muted">for {waited(a.created_at)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data && data.items.length === 0 && (
            <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-14 text-center">
              <AppealIcon className="size-8 text-muted/50" />
              <p className="mt-4 text-sm font-semibold text-text">{hasFilters ? 'No appeals found' : 'Nothing waiting'}</p>
              <p className="mt-1 text-xs text-muted">{hasFilters ? 'No appeal matches those filters.' : 'Every appeal has been answered.'}</p>
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
        <CenterWindow title="Appeal" instant={instantOpen} onClosed={() => navigate(`/admin/appeals${query}`)}>
          <ErrorBoundary>
            <AdminAppealDetails key={openId} id={openId} preview={data?.items.find((x) => x.id === openId)} onChanged={() => setReload((n) => n + 1)} />
          </ErrorBoundary>
        </CenterWindow>
      )}
    </div>
  )
}
