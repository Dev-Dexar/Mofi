import { useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import type { TransactionItem } from '@/lib/api'
import { api } from '@/lib/api'
import { formatDecimal, truncateText } from '@/lib/formatters'
import { CopyIcon, DownloadIcon, TransactionIcon } from '@/icons'
import { AmountLink, Glyph, Status } from '@/features/transactions/parts'
import { LABEL, dateOf, refOf, signed, timeOf } from '@/features/transactions/txConfig'
import type { TxType } from '@/features/transactions/txConfig'
import PillSelect from '@/components/ui/PillSelect'
import TransactionExport from './components/TransactionExport'
import type { ExportRecord } from './components/TransactionExport'
import { useToast } from '@/context/ToastContext'

// Short labels: they also have to fit a dropdown that is a third of a phone's width
const TABS: { label: string; key: string; types: TxType[] | null }[] = [
  { label: 'All types', key: '', types: null },
  { label: 'Deposits', key: 'deposit', types: ['deposit', 'reinvest'] },
  { label: 'Earnings', key: 'earnings', types: ['daily_yield', 'referral_bonus'] },
  { label: 'Withdraw', key: 'withdraw', types: ['withdraw', 'withdraw_refund'] },
]

const EARNING_TYPES: TxType[] = ['daily_yield', 'referral_bonus']

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
]

const PAGE_SIZE = 20

const compact = (v: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

// placeholder rows with the same cell layout as the real table, so nothing jumps when the data arrives
const SK_WIDTHS = [
  ['w-24', 'w-24', 'w-20', 'w-28', 'w-14'],
  ['w-28', 'w-20', 'w-24', 'w-24', 'w-16'],
  ['w-20', 'w-24', 'w-24', 'w-28', 'w-12'],
  ['w-24', 'w-20', 'w-20', 'w-24', 'w-16'],
]

function HistorySkeleton({ cols }: { cols: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-label="Loading transactions">
      <div className="overflow-hidden">
        <table className="w-full min-w-[720px] table-fixed">
          {cols}
          <tbody className="divide-y divide-ink/5">
            {Array.from({ length: 8 }).map((_, i) => {
              const w = SK_WIDTHS[i % SK_WIDTHS.length]
              return (
                <tr key={i} style={{ opacity: 1 - i * 0.08 }}>
                  <td className="py-3 pl-5 pr-3">
                    <div className="flex items-center gap-3">
                      <div className="sk h-9 w-9 shrink-0" />
                      <div className={`sk h-3 ${w[0]}`} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className={`sk h-3 ${w[1]}`} />
                    <div className="sk mt-2.5 h-2.5 w-14" />
                  </td>
                  <td className="px-3 py-3">
                    <div className={`sk h-6 ${w[2]}`} />
                  </td>
                  <td className="px-3 py-3">
                    <div className={`sk h-3 ${w[3]}`} />
                  </td>
                  <td className="py-3 pl-3 pr-5">
                    <div className={`sk ml-auto h-3 ${w[4]}`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="m-3 flex items-center justify-between rounded-full border border-ink/10 bg-ink/[0.03] py-1.5 pl-5 pr-1.5 sm:m-4">
        <div className="sk h-3 w-20" />
        <div className="flex items-center gap-1.5">
          <div className="sk h-9 w-9" />
          <div className="sk mx-2 h-3 w-16" />
          <div className="sk h-9 w-9" />
        </div>
      </div>
    </div>
  )
}

const describe = (t: TransactionItem): ExportRecord => ({
  Date: t.created_at,
  Type: LABEL[t.type],
  Amount: signed(t).toFixed(2),
  Currency: t.currency,
  Status: t.status,
  Reference: refOf(t),
  Hash: t.tx_hash ?? '',
})

const controlCls =
  'h-10 rounded-full bg-ink/5 px-4 text-[13px] font-medium text-text outline-none transition hover:bg-ink/10'

export default function HistoryPage() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  // ?type=deposit|earnings|withdraw and ?status=pending|completed|failed preselect the filters, so other pages can link straight into them
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState(() => Math.max(0, TABS.findIndex((t) => t.key && t.key === params.get('type'))))
  const [status, setStatus] = useState(() => (STATUS_OPTIONS.some((o) => o.value && o.value === params.get('status')) ? params.get('status')! : ''))
  const [oldestFirst, setOldestFirst] = useState(false)
  const [page, setPage] = useState(1)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [all, setAll] = useState<TransactionItem[]>(() => {
    return api.getCached<{ items: TransactionItem[] }>('/transactions', { page: 1, limit: 100 })?.items || []
  })
  const [loading, setLoading] = useState(() => {
    return !api.getCached<{ items: TransactionItem[] }>('/transactions', { page: 1, limit: 100 })
  })
  const sentinel = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; left: number } | null>(null)
  const [stuck, setStuck] = useState(false)
  const [typing, setTyping] = useState(false) // search focused: on phones Export steps aside and the search takes its room
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    // the strip pins 12px (16px on desktop) from the top: it is pinned once its resting spot has scrolled past that line
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0)), {
      rootMargin: '-13px 0px 0px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // the API pages 100 at a time; History filters and sums client-side, so pull every page (capped)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const items: TransactionItem[] = []
        for (let p = 1; p <= 50; p++) {
          const res = await api.getTransactions({ page: p, limit: 100 })
          items.push(...res.items)
          if (p >= res.total_pages) break
        }
        if (alive) setAll(items)
      } catch (err: any) {
        if (alive) toast.error(err.message || 'Failed to load your transactions')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // load once; the toast helpers are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keep the address in step with the filters, so a copied link reopens the same view
  useEffect(() => {
    const next = new URLSearchParams(params)
    const key = TABS[tab].key
    if (key) next.set('type', key)
    else next.delete('type')
    if (status) next.set('status', status)
    else next.delete('status')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // only the filters should write the address; `params` changing is the result, not a cause
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, status])

  const hasFilters = !!(search || status || tab)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const types = TABS[tab].types
    const rows = all.filter(
      (t) =>
        (!types || types.includes(t.type)) &&
        (!status || t.status === status) &&
        (!q || [t.reference, t.tx_hash, t.meta?.payment_id, LABEL[t.type]].some((v) => v && String(v).toLowerCase().includes(q)))
    )
    return oldestFirst ? [...rows].reverse() : rows
  }, [all, search, tab, status, oldestFirst])

  const summary = useMemo(() => {
    let inflow = 0
    let outflow = 0
    let earned = 0
    for (const t of filtered) {
      // a reinvest moves earnings into principal: nothing comes in or goes out of the account, so it counts on neither side
      if (t.status !== 'completed' || t.type === 'reinvest') continue
      const v = signed(t)
      if (v >= 0) inflow += v
      else outflow -= v
      if (EARNING_TYPES.includes(t.type)) earned += v
    }
    return { inflow, outflow, earned, net: inflow - outflow }
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const reset = () => {
    setTab(0)
    setSearch('')
    setStatus('')
    setPage(1)
  }

  const copy = (tx: TransactionItem) => {
    navigator.clipboard.writeText(refOf(tx))
    setCopiedId(tx.id)
    setTimeout(() => setCopiedId(null), 1800)
    toast.success('Reference copied', 'copied')
  }

  const CopyBtn = ({ tx }: { tx: TransactionItem }) => (
    <button
      onClick={() => copy(tx)}
      className={`rounded-md p-1.5 transition hover:bg-ink/5 group-hover:opacity-100 ${
        copiedId === tx.id ? 'text-emerald-400 opacity-100' : 'text-muted opacity-60 hover:text-text'
      }`}
      aria-label="Copy reference"
    >
      <CopyIcon className="size-4" />
    </button>
  )

  const head = (
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
              <th className="py-3 pl-5 pr-3 font-semibold">Transaction</th>
              <th className="px-3 py-3 font-semibold">
                <button
                  onClick={() => setOldestFirst((v) => !v)}
                  className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-text"
                >
                  Date
                  <ChevronDown className={`h-3.5 w-3.5 transition ${oldestFirst ? 'rotate-180' : ''}`} />
                </button>
              </th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Reference</th>
              <th className="py-3 pl-3 pr-5 text-right font-semibold">Amount (USDT)</th>
            </tr>
            <tr aria-hidden="true">
              <td colSpan={5} className="px-4 pb-0 pt-0">
                <div className="h-px bg-ink/10" />
              </td>
            </tr>
          </thead>
  )

  const cols = (
    <colgroup>
      <col className="w-[27%]" />
      <col className="w-[20%]" />
      <col className="w-[17%]" />
      <col className="w-[20%]" />
      <col className="w-[16%]" />
    </colgroup>
  )

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 rounded-3xl [&>*+*]:border-l [&>*+*]:border-ink/10 border border-ink/10 bg-surface sm:grid-cols-4">
        {[
          { label: 'Money in', value: summary.inflow, sign: '+', tone: 'text-emerald-400', extra: false },
          { label: 'Money out', value: summary.outflow, sign: '−', tone: 'text-text', extra: false },
          { label: 'Net', value: Math.abs(summary.net), sign: summary.net >= 0 ? '+' : '−', tone: 'text-accent2', extra: false },
          { label: 'Earned', value: summary.earned, sign: '+', tone: 'text-text', extra: true },
        ].map((s) => (
          <div key={s.label} className={`min-w-0 px-4 py-4 sm:px-6 ${s.extra ? 'hidden sm:block' : ''}`}>
            <p className="text-xs text-muted">{s.label}</p>
            {loading ? (
              <div className="mt-1 flex h-7 items-center"><div className="sk h-4 w-4/5 max-w-28 sm:h-5" /></div>
            ) : (
              <p className={`sk-fade mt-1 truncate text-lg font-bold tabular-nums tracking-tight sm:text-xl ${s.tone}`}>
                {s.sign}$<span className="sm:hidden">{compact(s.value)}</span>
                <span className="hidden sm:inline">{formatDecimal(s.value)}</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Ledger */}
      <div className="rounded-3xl border border-ink/10 bg-surface">
        {/* Filters */}
        <div ref={sentinel} aria-hidden="true" className="h-px" />
        <div
          className={`sticky top-3 z-30 mx-(--sx) mb-1 mt-0 rounded-[2.1rem] p-2 transition-[margin,background-color,backdrop-filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:top-4 sm:mx-2 sm:mt-1 ${
            stuck
              ? 'bg-transparent'
              : 'bg-transparent'
          }`}
          // once it is pinned, on a phone it reaches out toward the screen edges instead of keeping the card's side margin
          style={{ ['--sx' as string]: stuck ? '-16px' : '4px' }}
        >
        {/* not overflow-hidden: the Type and Status lists grow down out of this bar, over the table */}
        <div className="relative z-20 rounded-[1.75rem] bg-surface/70 ring-1 ring-inset ring-ink/[0.08] backdrop-blur-xl">
        <div className="grid grid-cols-[1fr_auto] gap-y-2.5 p-2 sm:flex sm:items-center sm:gap-2.5">
          <div className={`relative flex-1 transition-[margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:mr-0 ${typing ? 'mr-0' : 'mr-2.5'}`}>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search by reference or type"
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              className={`${controlCls} w-full pl-10 pr-10 placeholder:text-muted`}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-text"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            aria-label="Export"
            className={`flex h-10 items-center justify-center gap-2 overflow-hidden rounded-full bg-ink/5 text-[13px] font-medium text-text transition-[width,opacity,transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-ink/10 sm:order-last sm:w-auto sm:scale-100 sm:px-4 sm:opacity-100 ${
              typing ? 'pointer-events-none w-0 scale-75 opacity-0 sm:pointer-events-auto' : 'w-10'
            }`}
            tabIndex={typing ? -1 : 0}
          >
            <DownloadIcon className="size-5 text-muted" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <div className="col-span-2 grid grid-cols-2 gap-2.5 sm:contents">
            <PillSelect
              label="Type"
              value={tab}
              onChange={(v) => {
                setTab(v)
                setPage(1)
              }}
              options={TABS.map((t, i) => ({ value: i, label: t.label }))}
              className="sm:w-36"
            />
            <PillSelect
              label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v)
                setPage(1)
              }}
              options={STATUS_OPTIONS}
              className="sm:w-36"
            />
          </div>
        </div>
        </div>
        </div>

        {loading ? (
          <>
            <div className="overflow-hidden">
              <table className="w-full min-w-[720px] table-fixed whitespace-nowrap">
                {cols}
                {head}
              </table>
            </div>
            <HistorySkeleton cols={cols} />
          </>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-14 text-center">
            <TransactionIcon className="size-8 text-muted/50" />
            <p className="mt-4 text-sm font-semibold text-text">No transactions found</p>
            <p className="mt-1 text-xs text-muted">
              {hasFilters ? 'Nothing matches those filters.' : 'Activity on your account will show up here.'}
            </p>
            {hasFilters && (
              <button onClick={reset} className="mt-4 text-xs font-semibold text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="sk-fade">
            {/* Table (horizontally scrollable on small screens) */}
            <div
              ref={bodyRef}
              className="no-scrollbar min-h-[320px] cursor-grab select-none overflow-x-auto active:cursor-grabbing"
              // mouse drag scrolls sideways; touch scrolls natively
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse' || (e.target as HTMLElement).closest('button, a')) return
                drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                if (drag.current) e.currentTarget.scrollLeft = drag.current.left - (e.clientX - drag.current.x)
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
            <table className="w-full min-w-[720px] table-fixed whitespace-nowrap">
              {cols}
              {head}
              <tbody className="divide-y divide-ink/5">
                {rows.map((tx) => (
                  <tr key={tx.id} className="group transition hover:bg-ink/[0.02]">
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <Glyph tx={tx} />
                        <span className="text-sm font-semibold text-text">{LABEL[tx.type]}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-sm text-text">{dateOf(tx.created_at)}</p>
                      <p className="mt-0.5 text-xs text-muted">{timeOf(tx.created_at)}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Status status={tx.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs text-muted">{truncateText(refOf(tx), 7, 4)}</span>
                        <CopyBtn tx={tx} />
                      </div>
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right text-sm">
                      <AmountLink tx={tx} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Footer */}
            <div className="m-3 flex items-center justify-between rounded-full border border-ink/10 bg-ink/[0.03] py-1.5 pl-5 pr-1.5 sm:m-4">
              <p className="text-xs text-muted tabular-nums">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-text transition hover:bg-ink/5 disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 text-xs font-medium text-muted tabular-nums">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage >= totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-text transition hover:bg-ink/5 disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {exportOpen && (
        <TransactionExport
          onClosed={() => setExportOpen(false)}
          all={all}
          describe={describe}
        />
      )}
    </div>
  )
}
