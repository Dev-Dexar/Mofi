import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { DownloadIcon } from '@/icons'
import CenterWindow from '@/components/ui/CenterWindow'
import { Collapse } from '@/components/ui/Collapse'
import { useToast } from '@/context/ToastContext'
import type { TransactionItem } from '@/lib/api'

const COLUMNS = ['Date', 'Type', 'Amount', 'Currency', 'Status', 'Reference', 'Hash'] as const
type Column = (typeof COLUMNS)[number]
type Format = 'csv' | 'tsv' | 'json'
export type ExportRecord = Record<Column, string>

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

const DAY = 86400000
const BUCKETS = 36
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div role="radiogroup" className="flex rounded-full bg-ink/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-full px-3 text-xs font-medium transition-colors ${
            o.value === value ? 'bg-ink/[0.12] text-text' : 'text-muted hover:text-text'
          }`}
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

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-10 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-ink/10'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-4' : ''}`}
      />
    </button>
  )
}

function serialise(rows: ExportRecord[], cols: Column[], format: Format) {
  if (format === 'json') {
    return JSON.stringify(
      rows.map((r) => Object.fromEntries(cols.map((c) => [c.toLowerCase(), r[c]]))),
      null,
      2
    )
  }
  const sep = format === 'csv' ? ',' : '\t'
  const cell = (v: string) => (format === 'csv' ? `"${v.replace(/"/g, '""')}"` : v.replace(/\t/g, ' '))
  return [cols.join(sep), ...rows.map((r) => cols.map((c) => cell(r[c])).join(sep))].join('\n')
}

type Mode = 'new' | 'left' | 'right' | 'move'

/**
 * Export dialog built around a timeline: a bar chart of activity over time where you drag out the period to export
 * (drag to draw, pull the handles to resize, drag the middle to slide it). Rows and file size follow the selection live.
 */
export default function TransactionExport({
  onClosed,
  all,
  describe,
}: {
  onClosed: () => void
  all: TransactionItem[]
  describe: (tx: TransactionItem) => ExportRecord
}) {
  const toast = useToast()
  const [format, setFormat] = useState<Format>('csv')
  const [onlyDone, setOnlyDone] = useState(false)
  const [cols, setCols] = useState<Column[]>([...COLUMNS])
  const [more, setMore] = useState(false)
  const [edge, setEdge] = useState({ start: true, end: false }) // whether the column strip is scrolled to its start / end, for the fade hints
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false) // while the pointer is down the selection follows it exactly; otherwise it glides

  // The timeline: the whole history cut into equal buckets, with how many transactions fall in each
  const tl = useMemo(() => {
    const times = all.map((t) => new Date(t.created_at).getTime())
    const first = times.length ? Math.min(...times) : Date.now()
    const last = times.length ? Math.max(...times) : Date.now()
    const min = new Date(first).setHours(0, 0, 0, 0)
    const span = last - min + 1
    const n = clamp(Math.ceil(span / DAY), 1, BUCKETS)
    const width = span / n
    const counts = Array<number>(n).fill(0)
    for (const t of times) counts[clamp(Math.floor((t - min) / width), 0, n - 1)]++
    return { min, last, n, width, counts, peak: Math.max(1, ...counts) }
  }, [all])

  const presetRange = (days: number): [number, number] =>
    days ? [clamp(Math.floor((tl.last - days * DAY - tl.min) / tl.width), 0, tl.n - 1), tl.n - 1] : [0, tl.n - 1]

  const [range, setRange] = useState<[number, number]>(() => presetRange(30))
  const [a, b] = range

  const rows = useMemo(() => {
    const from = tl.min + a * tl.width
    const to = tl.min + (b + 1) * tl.width
    return all
      .filter((t) => {
        const ms = new Date(t.created_at).getTime()
        return ms >= from && ms < to && (!onlyDone || t.status === 'completed')
      })
      .map(describe)
  }, [all, tl, a, b, onlyDone, describe])

  const orderedCols = COLUMNS.filter((c) => cols.includes(c))
  const size = useMemo(() => {
    const bytes = new Blob([serialise(rows, orderedCols, format)]).size
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`
  }, [rows, orderedCols, format])

  // Dragging on the chart
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

  const toggle = (c: Column) =>
    setCols((cur) => (cur.includes(c) ? (cur.length > 1 ? cur.filter((x) => x !== c) : cur) : [...cur, c]))

  const download = async (close: () => void) => {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 600)) // stands in for the server building the file
    const meta = FORMATS.find((f) => f.value === format)!
    const url = URL.createObjectURL(new Blob([serialise(rows, orderedCols, format)], { type: meta.mime }))
    const link = document.createElement('a')
    link.href = url
    link.download = `mofi-transactions-${new Date().toISOString().slice(0, 10)}.${format}`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} transactions`)
    setBusy(false)
    close()
  }

  // where the selection's edges sit, as a share of the chart plus the gaps' share of the width (see the chart's comment)
  const gap = 3
  const pl = a / tl.n
  const pr = 1 - (b + 1) / tl.n
  const edgeLeft = `calc(${pl * 100}% + ${pl * gap}px)`
  const edgeRight = `calc(${pr * 100}% + ${pr * gap}px)`
  const glide = dragging ? '' : 'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]'
  const barHeight = (c: number) => `${Math.max((c / tl.peak) * 100, 6)}%`

  const periodStart = tl.min + a * tl.width
  const periodEnd = tl.min + (b + 1) * tl.width - 1

  return (
    <CenterWindow title="Export transactions" onClosed={onClosed} width="narrow" reveal="clip">
      {(close) => (
        <div>
          {/* Period */}
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-base font-semibold tabular-nums text-text">
              {day(periodStart)} <span className="text-muted">→</span> {day(periodEnd)}
            </p>
            <p className="text-xs tabular-nums text-muted">
              {rows.length} {rows.length === 1 ? 'row' : 'rows'} · {size}
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
            {/* The selection is a window cut into the green bars: its edges sit exactly on bar edges (a bar is
                p·(W+gap)/n from the left), and moving it is a transition, so a preset makes it glide instead of blink */}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {tl.counts.map((c, i) => (
                <span key={i} className="flex-1 rounded-[3px] bg-ink/10" style={{ height: barHeight(c) }} />
              ))}
            </div>
            <div
              className={`absolute inset-0 flex items-end gap-[3px] ${glide}`}
              style={{ clipPath: `inset(0 ${edgeRight} 0 ${edgeLeft})`, transitionProperty: 'clip-path' }}
              aria-hidden="true"
            >
              {tl.counts.map((c, i) => (
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
                  className={`group absolute -inset-y-1.5 flex w-5 cursor-ew-resize justify-center outline-none ${
                    side === 'left' ? '-left-2.5' : '-right-2.5'
                  }`}
                >
                  <span className="h-full w-[3px] rounded-full bg-primary transition-transform group-hover:scale-x-150 group-focus-visible:ring-2 group-focus-visible:ring-primary/50" />
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] tabular-nums text-muted">
            <span>{day(tl.min)}</span>
            <div className="flex gap-0.5">
              {PRESETS.map((p) => {
                const [pa, pb] = presetRange(p.days)
                const active = pa === a && pb === b
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setRange([pa, pb])}
                    className={`h-6 rounded-full px-2.5 font-medium transition-colors ${
                      active ? 'bg-ink/10 text-text' : 'hover:text-text'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
            <span>{day(tl.last)}</span>
          </div>

          {/* Options */}
          <div className="mt-4 divide-y divide-ink/5">
            <Row label="Format">
              <Seg value={format} onChange={setFormat} options={FORMATS} />
            </Row>
            {/* Opens like the profile's password section (the pill melts away, the row becomes a card, the controls slide down
                inside it), but the row keeps its height and the card floats over what is below, so the window never resizes */}
            <div className="relative h-[52px]">
              <div
                className={`absolute inset-x-0 top-0 z-20 rounded-2xl px-0 py-3 ring-1 ring-inset transition-[background-color,padding,box-shadow] duration-300 ${
                  more ? 'bg-popover px-3.5 ring-ink/[0.08]' : 'bg-transparent ring-transparent'
                }`}
              >
                <div className="flex h-7 items-center justify-between gap-4">
                  <span className="text-sm text-text">Options</span>
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
                  <div className="space-y-2.5 pb-0 pt-2.5">
                    <div className="flex h-7 items-center justify-between gap-4">
                      <span className="text-[13px] text-muted">Completed only</span>
                      <Switch on={onlyDone} onChange={setOnlyDone} label="Completed only" />
                    </div>
                    <div className="rounded-full bg-well-md p-1">
                      <div
                        ref={strip}
                        onScroll={measureStrip}
                        style={{
                          maskImage: `linear-gradient(to right, ${edge.start ? 'black' : 'transparent'}, black 20px, black calc(100% - 20px), ${edge.end ? 'black' : 'transparent'})`,
                        }}
                        className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {COLUMNS.map((c) => {
                          const on = cols.includes(c)
                          return (
                            <button
                              key={c}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggle(c)}
                              className={`h-7 shrink-0 rounded-full px-2.5 text-xs font-medium transition-colors ${
                                on ? 'bg-ink/10 text-text' : 'text-muted/50 hover:bg-ink/5 hover:text-text'
                              }`}
                            >
                              {c}
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
            onClick={() => download(close)}
            disabled={busy || rows.length === 0}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-base transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-base/30 border-t-base" />
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
