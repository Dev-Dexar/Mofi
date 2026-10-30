import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { formatDecimal } from '@/lib/formatters'
import { coinOf, coinSymbol } from '@/lib/coins'
import { CoinIcon } from '@/icons'

/** The building blocks every admin page shares, in the app's own look (the same cards, pills and type). */

export const panel = 'rounded-3xl border border-ink/10 bg-surface'
export const money = (v: string | number | null | undefined) => `$${formatDecimal(v ?? 0)}`
export const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
export const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

/** "just now", "7m ago", "3h ago", then the date */
export const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 24 * 60) return `${Math.floor(m / 60)}h ago`
  return day(iso)
}

/** A round badge for a window's one big idea: a solid tint of the status colour with its icon in the light shade of it */
export function Medallion({ tone, children }: { tone: 'gold' | 'green' | 'amber' | 'red' | 'neutral'; children: ReactNode }) {
  const cls = {
    gold: 'bg-[#3a3114] text-[#e6c65c]',
    green: 'bg-[#163a2f] text-emerald-300',
    amber: 'bg-[#3b3217] text-amber-300',
    red: 'bg-[#3d1c25] text-rose-300',
    neutral: 'bg-raised text-muted',
  }[tone]
  return <span className={`grid size-14 place-items-center rounded-full ${cls}`}>{children}</span>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-black tracking-tight text-text">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Stat({ label, value, note, tone = 'text-text', loading }: { label: string; value: ReactNode; note?: ReactNode; tone?: string; loading?: boolean }) {
  return (
    <div className={`${panel} min-w-0 p-5`}>
      <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {loading ? <div className="sk mt-2.5 h-7 w-32" /> : <p className={`mt-1.5 truncate text-2xl font-black tabular-nums ${tone}`}>{value}</p>}
      {note && (loading ? <div className="sk mt-2 h-3 w-40" /> : <p className="mt-1 truncate text-[11px] text-muted">{note}</p>)}
    </div>
  )
}

export function Pager({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (total === 0) return null
  const btn =
    'grid size-9 place-items-center rounded-full bg-ink/[0.06] text-text transition-[background-color,scale] hover:bg-ink/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30'
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-4 text-xs text-muted">
      <span className="tabular-nums">
        {total} {total === 1 ? 'result' : 'results'} · page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** The footer of a table card, the way the History page has it: a rounded bar with the range on the left and the pages on the right */
export function CardPager({ page, totalPages, total, pageSize, onPage }: { page: number; totalPages: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  if (total === 0) return null
  const btn = 'flex size-9 items-center justify-center rounded-full border border-ink/10 text-text transition hover:bg-ink/5 disabled:opacity-30'
  return (
    <div className="m-3 flex items-center justify-between rounded-full border border-ink/10 bg-ink/[0.03] py-1.5 pl-5 pr-1.5 sm:m-4">
      <p className="text-xs tabular-nums text-muted">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 text-xs font-medium tabular-nums text-muted">
          Page {page} of {totalPages}
        </span>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** A user as a small avatar, name and email, linking to their page */
export function UserCell({ user, to }: { user: { id: string; email: string | null; full_name: string | null; avatar_url?: string | null } | null; to?: string }) {
  if (!user) return <span className="text-muted">Unknown</span>
  const initial = (user.full_name || user.email || '?')[0].toUpperCase()
  return (
    <Link to={to ?? `/admin/users/${user.id}`} className="group flex min-w-0 items-center gap-3">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="size-8 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink/10 text-xs font-bold text-primary">{initial}</span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text group-hover:underline">{user.full_name || 'No name'}</span>
        <span className="block truncate text-xs text-muted">{user.email}</span>
      </span>
    </Link>
  )
}

const TONE = {
  green: 'bg-emerald-500/10 text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-400',
  red: 'bg-rose-500/10 text-rose-400',
  gold: 'bg-accent2/15 text-accent2',
  slate: 'bg-ink/[0.06] text-muted',
} as const

export function Badge({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONE[tone]}`}>{children}</span>
}

const MONEY_TONE: Record<string, keyof typeof TONE> = {
  finished: 'green', completed: 'green',
  waiting: 'slate', confirming: 'amber', confirmed: 'amber', sending: 'amber', processing: 'amber',
  partially_paid: 'gold', failed: 'red', refunded: 'red', expired: 'slate',
}

/** `label` replaces the raw status where it reads better (a deposit that is "finished" was credited; a withdrawal that "failed" was refunded) */
export const MoneyStatus = ({ status, label }: { status: string; label?: string }) => <Badge tone={MONEY_TONE[status] ?? 'slate'}>{label ?? status.replace('_', ' ')}</Badge>

// "refunded" on a deposit is the gateway sending a stuck payment (wrong network or coin, below the minimum) back to whoever sent it: nothing was credited
const DEPOSIT_LABEL: Record<string, string> = { finished: 'Credited', partially_paid: 'Underpaid', refunded: 'Returned' }
const WITHDRAWAL_LABEL: Record<string, string> = { completed: 'Delivered', failed: 'Refunded' }
export const depositLabel = (status: string) => DEPOSIT_LABEL[status] ?? status.replace('_', ' ')
export const withdrawalLabel = (status: string) => WITHDRAWAL_LABEL[status] ?? status.replace('_', ' ')

/** A pill-shaped set of options, one chosen */
export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-full bg-ink/[0.05] p-1" role="group">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${value === o.value ? 'bg-ink/10 text-text' : 'text-muted hover:text-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const pillBtn =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink/[0.06] px-4 text-xs font-bold text-text transition-[background-color,scale] hover:bg-ink/10 active:scale-95 disabled:opacity-50'
export const dangerBtn =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-danger/10 px-4 text-xs font-bold text-danger transition-[background-color,scale] hover:bg-danger/20 active:scale-95 disabled:opacity-50'
export const goodBtn =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary/15 px-4 text-xs font-bold text-primary transition-[background-color,scale] hover:bg-primary/25 active:scale-95 disabled:opacity-50'

export type ActionField = { key: string; label: string; placeholder?: string; type?: 'text' | 'number'; required?: boolean; initial?: string }

/**
 * Confirms an admin action that changes someone's money or account: a short title, what will happen, the fields it needs
 * (always a note for the admin log) and a confirm button in the action's own colour. Errors from the API show inside it.
 */
export function ActionDialog({
  open,
  title,
  body,
  fields,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body?: ReactNode
  fields: ActionField[]
  confirmLabel: string
  tone?: 'primary' | 'danger'
  onConfirm: (values: Record<string, string>) => Promise<void>
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef<(HTMLInputElement & HTMLTextAreaElement) | null>(null)

  useEffect(() => {
    if (!open) return
    setValues(Object.fromEntries(fields.map((f) => [f.key, f.initial ?? ''])))
    setError(null)
    setBusy(false)
    const t = window.setTimeout(() => first.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null
  const ready = fields.every((f) => !f.required || (values[f.key] ?? '').trim().length >= (f.key === 'note' ? 3 : 1))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm(values)
      onClose()
    } catch (err: any) {
      setError(err.message || 'That did not go through')
      setBusy(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="presentation">
      <div onClick={() => !busy && onClose()} className="center-backdrop-in absolute inset-0 bg-black/60" />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="center-window-in relative w-full max-w-md rounded-3xl border border-ink/10 bg-surface p-6 shadow-[0_30px_60px_color-mix(in_srgb,var(--color-shade)_55%,transparent)]"
      >
        <h2 className="text-[15px] font-bold tracking-tight text-text">{title}</h2>
        {body && <div className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</div>}
        {fields.length > 0 && (
          <div className="mt-5 space-y-4">
            {fields.map((f, i) => {
              const set = (raw: string) => setValues((v) => ({ ...v, [f.key]: f.type === 'number' ? raw.replace(/[^0-9.]/g, '') : raw }))
              return (
                <label key={f.key} className="block">
                  <span className="text-xs font-medium text-muted">{f.label}</span>
                  {f.type === 'number' ? (
                    <input
                      ref={i === 0 ? first : undefined}
                      type="text"
                      inputMode="decimal"
                      value={values[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => set(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl bg-popover px-3.5 text-sm text-text outline-none transition-shadow placeholder:text-muted/50 focus:ring-2 focus:ring-ink/20"
                    />
                  ) : (
                    // a note or a reply can run to a few lines, so it is a small text area (Ctrl or Cmd + Enter sends it)
                    <textarea
                      ref={i === 0 ? first : undefined}
                      rows={3}
                      value={values[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => set(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit()
                      }}
                      className="mt-1.5 block w-full resize-none rounded-xl bg-popover px-3.5 py-2.5 text-sm leading-relaxed text-text outline-none transition-shadow placeholder:text-muted/50 focus:ring-2 focus:ring-ink/20"
                    />
                  )}
                </label>
              )
            })}
          </div>
        )}
        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-full bg-raised text-sm font-semibold text-text transition hover:bg-[#2b2e36] disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            className={`flex h-10 items-center justify-center gap-2 rounded-full text-sm font-bold transition-[opacity,scale] active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${
              tone === 'danger' ? 'bg-danger text-white' : 'bg-primary text-[color:var(--color-base)]'
            }`}
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

/**
 * The floating glass bar a list's search and filters sit in. It pins near the top while the table scrolls beneath it. On a phone, once it is
 * pinned it stretches out toward the screen's edges (the way the History page's does) and eases back when it is not. Not overflow-hidden:
 * the dropdowns grow down out of it.
 */
export function FilterBar({ children }: { children: ReactNode }) {
  const marker = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = marker.current
    if (!el) return
    // the marker sits just above the bar: once it has scrolled up past where the bar pins, the bar is pinned
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 16), { rootMargin: '-16px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <div ref={marker} aria-hidden="true" className="-mb-px h-px" />
      <div
        className={`sticky top-3 z-30 mb-1 rounded-[2.1rem] p-2 transition-[margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:top-4 sm:mx-2 sm:mt-1 ${stuck ? 'max-sm:-mx-3' : 'max-sm:mx-1'}`}
      >
        <div className="relative z-20 rounded-[1.75rem] bg-surface/70 ring-1 ring-inset ring-ink/[0.08] backdrop-blur-xl">{children}</div>
      </div>
    </>
  )
}

/** A coin as a chip: its logo and its name (USDT shows its network too, since it runs on one). A code the app does not know shows in capitals. */
export function CoinChip({ code }: { code: string }) {
  const coin = coinOf(code)
  const symbol = coinSymbol(code)
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-raised py-1 pl-1.5 pr-3 text-xs font-semibold leading-none text-text">
      <CoinIcon symbol={symbol} className="size-4 shrink-0" />
      {symbol}
      {coin?.symbol === 'USDT' && <span className="font-medium text-muted">{coin.network}</span>}
    </span>
  )
}
