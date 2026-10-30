import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { DownloadIcon } from '@/icons'
import CenterWindow from '@/components/ui/CenterWindow'
import { Collapse } from '@/components/ui/Collapse'
import { useToast } from '@/context/ToastContext'
import type { AnalyticsDay } from '@/lib/api'
import { download, toDelimited } from './chartExport'

/** The columns of a day, in the file's order, with the heading each gets */
const COLUMNS: { key: keyof AnalyticsDay; label: string; number: boolean }[] = [
  { key: 'date', label: 'Date', number: false },
  { key: 'signups', label: 'Sign-ups', number: true },
  { key: 'deposits_count', label: 'Deposits (count)', number: true },
  { key: 'deposits', label: 'Deposits', number: true },
  { key: 'withdrawals_count', label: 'Withdrawals (count)', number: true },
  { key: 'withdrawals', label: 'Withdrawals', number: true },
  { key: 'payouts', label: 'Payouts', number: true },
  { key: 'reinvested', label: 'Reinvested', number: true },
  { key: 'commissions', label: 'Commissions', number: true },
  { key: 'principal', label: 'Principal', number: true },
]
type Column = (typeof COLUMNS)[number]
type Format = 'csv' | 'tsv' | 'json'

const FORMATS: { value: Format; label: string; mime: string }[] = [
  { value: 'csv', label: 'CSV', mime: 'text/csv' },
  { value: 'tsv', label: 'TSV', mime: 'text/tab-separated-values' },
  { value: 'json', label: 'JSON', mime: 'application/json' },
]

const PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'All', days: 0 },
]

const BUCKETS = 36
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="radiogroup" className="flex rounded-full bg-ink/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${o.value === value ? 'bg-ink/[0.12] text-text' : 'text-muted hover:text-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-text">{label}</span>
      {children}
    </div>
  )
}

function serialise(rows: AnalyticsDay[], cols: Column[], format: Format) {
  if (format === 'json') {
    return JSON.stringify(
      rows.map((r) => Object.fromEntries(cols.map((c) => [c.key, c.number ? Number(r[c.key]) : r[c.key]]))),
      null,
      2,
    )
  }
  return toDelimited([cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => (c.number ? Number(r[c.key]) : String(r[c.key]))))], format === 'csv' ? ',' : '\t')
}

type Mode = 'new' | 'left' | 'right' | 'move'

/**
 * The same export window the History page has, for the platform's daily figures: a timeline of how much money moved each day, where
 * you drag out the period to save (draw it, pull the handles, or slide the middle), a format, and the columns to include.
 * The rows and the file's size follow the selection live; nothing is made until Download.
 */
export default function AnalyticsExport({ onClosed, days }: { onClosed: () => void; days: AnalyticsDay[] }) {
  const toast = useToast()
  const [format, setFormat] = useState<Format>('csv')
  const [cols, setCols] = useState<Column['key'][]>(COLUMNS.map((c) => c.key))
  const [more, setMore] = useState(false)
  const [edge, setEdge] = useState({ start: true, end: false })
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false) // while the pointer is down the selection follows it exactly; otherwise it glides

  // the days cut into equal buckets, with the money that moved in each
  const tl = useMemo(() => {
    const len = days.length
    const n = clamp(len, 1, BUCKETS)
    const first = (b: number) => Math.floor((b * len) / n)
    const sums = Array<number>(n).fill(0)
    days.forEach((d, i) => (sums[Math.min(n - 1, Math.floor((i * n) / Math.max(1, len)))] += Number(d.deposits) + Number(d.withdrawals)))
    return { len, n, first, sums, peak: Math.max(1, ...sums), bucketOf: (i: number) => clamp(Math.floor((i * n) / Math.max(1, len)), 0, n - 1) }
  }, [days])

  const presetRange = (d: number): [number, number] => (d ? [tl.bucketOf(Math.max(0, tl.len - d)), tl.n - 1] : [0, tl.n - 1])
  const [range, setRange] = useState<[number, number]>(() => presetRange(0))
  const [a, b] = range

  const from = tl.first(a)
  const to = tl.first(b + 1) // exclusive
  const rows = useMemo(() => days.slice(from, to), [days, from, to])
  const orderedCols = COLUMNS.filter((c) => cols.includes(c.key))
  const size = useMemo(() => {
    const bytes = new Blob([serialise(rows, orderedCols, format)]).size
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  }, [rows, orderedCols, format])

  // Dragging on the timeline
  const chart = useRef<HTMLDivElement>(null)
  const drag = useRef<{ mode: Mode; start: number; a: number; b: number } | null>(null)
  const at = (x: number) => {
    const r = chart.current!.getBoundingClientRect()
    return clamp(Math.floor(((x - r.left) / r.width) * tl.n), 0, tl.n - 1)
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const part = (e.target as HTMLElement).closest('[data-part]')?.getAttribute('data-part')
    const i = at(e.clientX)
    const mode: Mode = part === 'left' ? 'left' : part === 'right' ? 'right' : part === 'body' ? 'move' : 'new'
    drag.current = { mode, start: i, a, b }
    setDragging(true)
    if (mode === 'new') setRange([i, i])
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const i = at(e.clientX)
    if (d.mode === 'new') setRange([Math.min(d.start, i), Math.max(d.start, i)])
    else if (d.mode === 'left') setRange([Math.min(i, d.b), d.b])
    else if (d.mode === 'right') setRange([d.a, Math.max(i, d.a)])
    else {
      const w = d.b - d.a
      const na = clamp(d.a + (i - d.start), 0, tl.n - 1 - w)
      setRange([na, na + w])
    }
  }
  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }
  const onKey = (side: 'left' | 'right') => (e: KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    e.preventDefault()
    if (side === 'left') setRange([clamp(a + step, 0, b), b])
    else setRange([a, clamp(b + step, a, tl.n - 1)])
  }

  const strip = useRef<HTMLDivElement>(null)
  const measureStrip = () => {
    const el = strip.current
    if (el) setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 4 })
  }
  useEffect(measureStrip, [more])

  const toggle = (k: Column['key']) => setCols((cur) => (cur.includes(k) ? (cur.length > 1 ? cur.filter((x) => x !== k) : cur) : [...cur, k]))

  const save = async (close: () => void) => {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 400)) // a beat, so the button's state is seen
    const meta = FORMATS.find((f) => f.value === format)!
    download(new Blob([serialise(rows, orderedCols, format)], { type: `${meta.mime};charset=utf-8` }), `mofi-analytics-${rows[0].date}_${rows[rows.length - 1].date}.${format}`)
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'day' : 'days'}`)
    setBusy(false)
    close()
  }

  // where the selection's edges sit, as a share of the chart plus the gaps' share of the width (a bar is p·(W+gap)/n from the left)
  const gap = 3
  const pl = a / tl.n
  const pr = 1 - (b + 1) / tl.n
  const edgeLeft = `calc(${pl * 100}% + ${pl * gap}px)`
  const edgeRight = `calc(${pr * 100}% + ${pr * gap}px)`
  const glide = dragging ? '' : 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
  const barHeight = (c: number) => `${Math.max((c / tl.peak) * 100, 6)}%`

  return (
    <CenterWindow title="Export analytics" onClosed={onClosed} width="narrow" reveal="clip">
      {(close) => (
        <div>
          {/* Period */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-base font-semibold tabular-nums text-text">
              {rows.length ? dayLabel(rows[0].date) : '—'} <span className="text-muted">→</span> {rows.length ? dayLabel(rows[rows.length - 1].date) : '—'}
            </p>
            <p className="text-xs tabular-nums text-muted">
              {rows.length} {rows.length === 1 ? 'day' : 'days'} · {size}
            </p>
          </div>

          <div
            ref={chart}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative mt-4 h-32 cursor-crosshair touch-none select-none sm:h-24"
          >
            {/* The selection is a window cut into the green bars: its edges sit exactly on bar edges, and moving it is a transition, so a preset glides */}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {tl.sums.map((c, i) => (
                <span key={i} className="flex-1 rounded-[3px] bg-ink/10" style={{ height: barHeight(c) }} />
              ))}
            </div>
            <div
              className={`absolute inset-0 flex items-end gap-[3px] ${glide}`}
              style={{ clipPath: `inset(0 ${edgeRight} 0 ${edgeLeft})`, transitionProperty: 'clip-path' }}
              aria-hidden="true"
            >
              {tl.sums.map((c, i) => (
                <span key={i} className="flex-1 rounded-[3px] bg-primary" style={{ height: barHeight(c) }} />
              ))}
            </div>

            <div
              data-part="body"
              className={`absolute inset-y-0 cursor-grab rounded-md bg-primary/[0.07] active:cursor-grabbing ${glide}`}
              style={{ left: edgeLeft, right: edgeRight, transitionProperty: 'left, right' }}
            >
              {(['left', 'right'] as const).map((side) => (
                <span
                  key={side}
                  data-part={side}
                  role="slider"
                  tabIndex={0}
                  aria-label={side === 'left' ? 'Start of period' : 'End of period'}
                  aria-valuemin={0}
                  aria-valuemax={tl.n - 1}
                  aria-valuenow={side === 'left' ? a : b}
                  onKeyDown={onKey(side)}
                  className={`group absolute -inset-y-1.5 flex w-5 cursor-ew-resize justify-center outline-none ${side === 'left' ? '-left-2.5' : '-right-2.5'}`}
                >
                  <span className="h-full w-[3px] rounded-full bg-primary transition-transform group-hover:scale-x-150 group-focus-visible:ring-2 group-focus-visible:ring-primary/50" />
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] tabular-nums text-muted">
            <span>{days.length ? dayLabel(days[0].date) : ''}</span>
            <div className="flex gap-0.5">
              {PRESETS.map((p) => {
                const [pa, pb] = presetRange(p.days)
                const active = pa === a && pb === b
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setRange([pa, pb])}
                    className={`h-6 rounded-full px-2.5 font-medium transition-colors ${active ? 'bg-ink/10 text-text' : 'hover:text-text'}`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            <span>{days.length ? dayLabel(days[days.length - 1].date) : ''}</span>
          </div>

          {/* Options */}
          <div className="mt-4 divide-y divide-ink/5">
            <Row label="Format">
              <Seg value={format} onChange={setFormat} options={FORMATS} />
            </Row>
            {/* Opens like the History export's: the pill melts away, the row becomes a card and the chips slide down inside it. Here the card
                pushes the button down with it, rather than floating over it: it is too short to cover it cleanly. */}
            <div>
              <div
                className={`rounded-2xl px-0 py-3 ring-1 ring-inset transition-[background-color,padding,box-shadow] duration-300 ${
                  more ? 'bg-[#16181d] px-3.5 ring-ink/[0.08]' : 'bg-transparent ring-transparent'
                }`}
              >
                <div className="flex h-7 items-center justify-between gap-4">
                  <span className="text-sm text-text">Columns</span>
                  <div className="grid justify-items-end">
                    <button
                      type="button"
                      onClick={() => setMore(true)}
                      aria-expanded={more}
                      tabIndex={more ? -1 : 0}
                      className={`inline-flex h-7 items-center gap-2 rounded-full bg-ink/10 px-3.5 text-xs font-bold text-text transition-[transform,background-color,opacity,filter,scale,translate] duration-300 [grid-area:1/1] hover:bg-ink/15 active:scale-95 ${
                        more ? 'pointer-events-none scale-95 opacity-0 blur-sm' : ''
                      }`}
                    >
                      Customise
                      <span className="font-medium text-muted">
                        {orderedCols.length}/{COLUMNS.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMore(false)}
                      tabIndex={more ? 0 : -1}
                      className={`inline-flex h-7 items-center rounded-full bg-primary px-3.5 text-xs font-bold text-[color:var(--color-base)] transition-[transform,opacity,filter,scale,translate] duration-300 [grid-area:1/1] active:scale-95 ${
                        more ? '' : 'pointer-events-none scale-95 opacity-0 blur-sm'
                      }`}
                    >
                      Done
                    </button>
                  </div>
                </div>
                <Collapse open={more}>
                  <div className="pb-0 pt-2.5">
                    <div className="rounded-full bg-black/30 p-1">
                      <div
                        ref={strip}
                        onScroll={measureStrip}
                        style={{
                          maskImage: `linear-gradient(to right, ${edge.start ? 'black' : 'transparent'}, black 20px, black calc(100% - 20px), ${edge.end ? 'black' : 'transparent'})`,
                        }}
                        className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {COLUMNS.map((c) => {
                          const on = cols.includes(c.key)
                          return (
                            <button
                              key={c.key}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggle(c.key)}
                              className={`h-7 shrink-0 rounded-full px-2.5 text-xs font-medium transition-colors ${on ? 'bg-ink/10 text-text' : 'text-muted/50 hover:bg-ink/5 hover:text-text'}`}
                            >
                              {c.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </Collapse>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => save(close)}
            disabled={busy || rows.length === 0}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-[color:var(--color-base)] transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-[color:var(--color-base)]/30 border-t-[color:var(--color-base)]" />
                Preparing…
              </>
            ) : (
              <>
                <DownloadIcon className="size-5" />
                Download {format.toUpperCase()}
              </>
            )}
          </button>
        </div>
      )}
    </CenterWindow>
  )
}
