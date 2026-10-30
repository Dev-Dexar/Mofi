import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import type { AdminMoneyItem, AdminMoneyList } from '@/lib/api'
import CenterWindow from '@/components/ui/CenterWindow'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { TypeBadge } from './components/StatusBadge'
import PillSelect from '@/components/ui/PillSelect'
import { WalletIcon } from '@/icons'
import { useToast } from '@/context/ToastContext'
import { dateOf, timeOf } from '@/features/transactions/txConfig'
import AdminMoneyDetails from './AdminMoneyDetails'
import { moneySource } from './moneySource'
import { Badge, CardPager, CoinChip, FilterBar, MoneyStatus, UserCell, depositLabel, money, withdrawalLabel } from './components/ui'

type Kind = 'all' | 'deposits' | 'withdrawals'

// A deposit's states, the way an admin thinks of them: the ones that need a person, the ones on their way, the ones done, and the ones that
// ended without a credit. ("Refunded" is not something this app does: it is NOWPayments sending a stuck payment back to the sender, so it
// sits in "Closed", shown as "Returned".)
const DEPOSIT_FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'progress', label: 'In progress' },
  { value: 'finished', label: 'Credited' },
  { value: 'closed', label: 'Closed' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Failed' },
]
const WITHDRAWAL_FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'processing', label: 'Processing' },
  { value: 'sending', label: 'Sending' },
  { value: 'completed', label: 'Delivered' },
  { value: 'failed', label: 'Refunded' },
]
// the same words on both sides, for when they are listed together
const ALL_FILTERS = [
  { value: '', label: 'Everything' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'closed', label: 'Closed' },
]
const KIND_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'deposits', label: 'Deposits' },
  { value: 'withdrawals', label: 'Withdrawals' },
]
const PAGE_SIZE = 20

const controlCls = 'h-10 rounded-full bg-ink/5 px-4 text-[13px] font-medium text-text outline-none transition hover:bg-ink/10'

/** How long ago something started: "3h", "2d" */
const waited = (iso: string) => {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  return h < 1 ? 'under 1h' : h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`
}

// the same widths for the header, the rows and the loading rows, per tab
const COLS: Record<Kind, { label: string; width: string; right?: boolean }[]> = {
  all: [
    { label: 'Member', width: 'w-[22%]' },
    { label: 'Reference', width: 'w-[18%]' },
    { label: 'Type', width: 'w-[12%]' },
    { label: 'Date', width: 'w-[12%]' },
    { label: 'Amount', width: 'w-[11%]', right: true },
    { label: 'Coin', width: 'w-[13%]' },
    { label: 'Status', width: 'w-[12%]' },
  ],
  deposits: [
    { label: 'Member', width: 'w-[23%]' },
    { label: 'Reference', width: 'w-[19%]' },
    { label: 'Started', width: 'w-[13%]' },
    { label: 'Ordered', width: 'w-[11%]', right: true },
    { label: 'Coin', width: 'w-[18%]' },
    { label: 'Status', width: 'w-[16%]' },
  ],
  withdrawals: [
    { label: 'Member', width: 'w-[23%]' },
    { label: 'Reference', width: 'w-[19%]' },
    { label: 'Requested', width: 'w-[14%]' },
    { label: 'Amount', width: 'w-[14%]', right: true },
    { label: 'Network', width: 'w-[15%]' },
    { label: 'Status', width: 'w-[15%]' },
  ],
}

/**
 * Every deposit and withdrawal across the platform, laid out like the Users and Appeals lists: a strip of totals, then one card with the
 * filter bar (search, which kind to show, and a status that follows the kind), the table and its footer. "All" mixes them by date. Search
 * takes a name or email, the MF- reference the member sees (or any order or payment id), a hash or an address, or an exact amount. Most
 * settle by themselves through the gateway; the ones that need a person (paid short of what was ordered, or a payout still in flight after
 * half an hour) are one filter away. A row opens in a popup at /admin/money/<deposits|withdrawals>/<id>, where the fix is.
 */
export default function AdminMoneyPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { tab: tabParam, id: openId } = useParams()
  const { search: query } = useLocation()
  const [params, setParams] = useSearchParams()
  // the kind is in the address (?kind=withdrawals); earlier links spelled it as a path (/admin/money/withdrawals) or ?tab=
  const asked = params.get('kind') ?? params.get('tab') ?? (!openId ? tabParam : undefined)
  const kind: Kind = asked === 'deposits' || asked === 'withdrawals' ? asked : 'all'
  const openKind: 'deposits' | 'withdrawals' = tabParam === 'withdrawals' ? 'withdrawals' : 'deposits'
  const filter = params.get('status') ?? ''
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  // reached by a link or a reload the popup is simply there; opened by a click it opens out of the middle
  const [instantOpen] = useState(() => !!openId)

  const [typed, setTyped] = useState(search)
  // the rows on screen, with the kind they were fetched for (a new kind keeps them, dimmed, until its own arrive: their columns differ)
  const [list, setList] = useState<{ for: Kind; data: AdminMoneyList } | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)

  const set = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    p.delete('tab')
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    if (!('page' in next)) p.delete('page')
    setParams(p, { replace: true })
  }
  // a different kind starts over: its own statuses, its own first page, on the plain list address
  const setKind = (v: string) => {
    const p = new URLSearchParams(params)
    for (const k of ['tab', 'status', 'page']) p.delete(k)
    if (v) p.set('kind', v)
    else p.delete('kind')
    navigate({ pathname: '/admin/money', search: p.toString() ? `?${p}` : '' }, { replace: true })
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
    moneySource
      .list({ kind, status: filter || undefined, search: search || undefined, page, limit: PAGE_SIZE })
      .then((r) => live && setList({ for: kind, data: r }))
      .catch((e) => toast.error(e.message || 'Could not load the list'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [kind, filter, search, page, reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const data = list?.data ?? null
  const view = list?.for ?? kind // the columns follow the rows on screen
  const cols = COLS[view]
  const statusOptions = kind === 'deposits' ? DEPOSIT_FILTERS : kind === 'withdrawals' ? WITHDRAWAL_FILTERS : ALL_FILTERS
  // a row opens its own popup, and the list under it stays as it was (kind and filters stay in the address)
  const detailPath = (item: AdminMoneyItem) => {
    const p = new URLSearchParams(params)
    p.delete('tab')
    if (kind !== 'all') p.set('kind', kind)
    return `/admin/money/${item.kind === 'deposit' ? 'deposits' : 'withdrawals'}/${item.id}${p.toString() ? `?${p}` : ''}`
  }
  const hasFilters = !!filter || !!search
  const reset = () => {
    setTyped('')
    setParams({}, { replace: true })
  }

  const c = data?.counts
  const names = view === 'deposits' ? ['Credited', 'Closed'] : view === 'withdrawals' ? ['Delivered', 'Refunded'] : ['Done', 'Closed']
  const summary = [
    { label: 'Needs attention', value: c?.attention, tone: c?.attention ? 'text-accent2' : 'text-text' },
    { label: view === 'withdrawals' ? 'In flight' : 'In progress', value: c?.progress, tone: 'text-text' },
    { label: names[0], value: c?.done, tone: 'text-text' },
    { label: names[1], value: c?.closed, tone: 'text-text' },
  ]

  const head = (
    <thead>
      <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
        {cols.map((c, i) => (
          <th key={c.label} className={`px-3 py-3 font-semibold ${i === 0 ? 'pl-5' : ''} ${i === cols.length - 1 ? 'pr-5' : ''} ${c.right ? 'text-right' : ''}`}>
            {c.label}
          </th>
        ))}
      </tr>
      <tr aria-hidden="true">
        <td colSpan={cols.length} className="px-4 pb-0 pt-0">
          <div className="h-px bg-ink/10" />
        </td>
      </tr>
    </thead>
  )
  const td = 'px-3 py-3 first:pl-5 last:pr-5'
  const onRow = (item: AdminMoneyItem) => (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('a, button')) navigate(detailPath(item))
  }

  return (
    <div className="sk-fade space-y-6">
      {/* Totals */}
      <div className="grid grid-cols-2 rounded-3xl border border-ink/10 bg-surface sm:grid-cols-4 [&>*+*]:border-l [&>*+*]:border-ink/10 max-sm:[&>*:nth-child(3)]:border-l-0 max-sm:[&>*:nth-child(n+3)]:border-t">
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
        {/* Filters: pinned while the table scrolls (and, on a phone, stretching out toward the screen's edges while pinned) */}
        <FilterBar>
          {/* search; then what to show (all, deposits or withdrawals) and, following it, a status. On a phone the two selects take a row of their own. */}
          <div className="p-2 sm:flex sm:items-center sm:gap-2.5">
            <div className="relative min-w-0 sm:flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={kind === 'deposits' ? 'Search name, email, reference, hash or amount' : kind === 'withdrawals' ? 'Search name, email, reference, address or amount' : 'Search name, email, reference, hash, address or amount'}
                aria-label="Search deposits and withdrawals"
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
            <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:gap-2.5">
              <div className="sm:w-[9.5rem]">
                <PillSelect label="Show" value={kind === 'all' ? '' : kind} onChange={setKind} options={KIND_OPTIONS} className="w-full" />
              </div>
              <div className="sm:w-[11rem]">
                <PillSelect key={kind} label="Status" value={filter} onChange={(v) => set({ status: v })} options={statusOptions} className="w-full" />
              </div>
            </div>
          </div>
        </FilterBar>

        {/* Table (sideways on small screens) */}
        <div className="no-scrollbar min-h-[320px] overflow-x-auto" aria-busy={loading}>
          <table className="w-full min-w-[900px] table-fixed whitespace-nowrap">
            <colgroup>
              {cols.map((c) => (
                <col key={c.label} className={c.width} />
              ))}
            </colgroup>
            {head}
            <tbody key={view} className={`divide-y divide-ink/5 transition-opacity ${loading && data ? 'opacity-50' : ''}`}>
              {!data &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} style={{ opacity: 1 - i * 0.12 }}>
                    {cols.map((col, j) => (
                      <td key={col.label} className={td}>
                        {j === 0 ? (
                          <div className="flex items-center gap-3">
                            <div className="sk size-8 shrink-0" />
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="sk h-3 w-24" />
                              <div className="sk h-2.5 w-32" />
                            </div>
                          </div>
                        ) : (
                          <div className={`sk h-3.5 w-3/5 ${col.right ? 'ml-auto' : ''}`} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

              {data?.items.map((item) => {
                const deposit = item.kind === 'deposit'
                const inFlight = !deposit && (item.status === 'processing' || item.status === 'sending')
                return (
                  <tr key={`${item.kind}-${item.id}`} onClick={onRow(item)} className="group cursor-pointer transition hover:bg-ink/[0.02]">
                    <td className={td}>{item.user ? <UserCell user={item.user} to={detailPath(item)} /> : <span className="text-muted">Unknown</span>}</td>
                    <td className={`${td} truncate font-mono text-xs text-muted`} title={item.reference ?? undefined}>
                      {item.reference ?? '—'}
                    </td>
                    {view === 'all' && (
                      <td className={td}>
                        <TypeBadge type={deposit ? 'deposit' : 'withdraw'} />
                      </td>
                    )}
                    <td className={td}>
                      <p className="truncate text-sm text-text">{dateOf(item.created_at)}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{timeOf(item.created_at)}</p>
                    </td>
                    <td className={`${td} text-right`}>
                      <p className="truncate text-sm font-bold tabular-nums text-text">{money(deposit ? item.price_amount : item.amount)}</p>
                      {view === 'withdrawals' && !deposit && item.payout_amount && <p className="mt-0.5 truncate text-xs tabular-nums text-muted">{item.payout_amount}</p>}
                    </td>
                    <td className={td}>
                      <CoinChip code={deposit ? item.pay_currency : item.network} />
                    </td>
                    <td className={td}>
                      {/* just the chip: a payout still in flight after half an hour says how long, in the chip; the gateway's error is in the popup */}
                      {inFlight && Date.now() - new Date(item.created_at).getTime() > 30 * 60_000 ? (
                        <Badge tone="gold">Stuck {waited(item.created_at)}</Badge>
                      ) : (
                        <MoneyStatus status={item.status} label={deposit ? depositLabel(item.status) : withdrawalLabel(item.status)} />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {data && data.items.length === 0 && (
            <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-14 text-center">
              <WalletIcon className="size-8 text-muted/50" />
              <p className="mt-4 text-sm font-semibold text-text">{hasFilters ? 'Nothing found' : kind === 'all' ? 'No deposits or withdrawals yet' : `No ${kind} yet`}</p>
              <p className="mt-1 text-xs text-muted">{filter === 'attention' && !search ? 'Nothing needs you right now.' : hasFilters ? 'Nothing matches those filters.' : 'They will show up here.'}</p>
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
        <CenterWindow title={openKind === 'deposits' ? 'Deposit' : 'Withdrawal'} instant={instantOpen} onClosed={() => navigate(`/admin/money${query}`)}>
          <ErrorBoundary>
            <AdminMoneyDetails
              key={`${openKind}-${openId}`}
              kind={openKind}
              id={openId}
              preview={data?.items.find((x) => x.id === openId && x.kind === (openKind === 'deposits' ? 'deposit' : 'withdrawal'))}
              onChanged={() => setReload((n) => n + 1)}
            />
          </ErrorBoundary>
        </CenterWindow>
      )}
    </div>
  )
}
