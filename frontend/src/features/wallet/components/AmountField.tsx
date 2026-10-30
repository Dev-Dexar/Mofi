import type { ReactNode } from 'react'
import { Collapse } from '@/components/ui/Collapse'

/**
 * What a typed or pasted amount becomes: digits and at most one dot, at most two places after it (cents), no stray leading zeros, and a
 * sane length. So "12.345" can never be typed ("12.34"), a lone dot becomes "0.", and a pasted "1,234.5x" becomes "1234.5".
 */
function cleanAmount(raw: string): string {
  let v = raw.replace(/,/g, '').replace(/[^\d.]/g, '')
  const dot = v.indexOf('.')
  if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '') // only the first dot counts
  if (v.startsWith('.')) v = `0${v}`
  const [whole, cents] = v.split('.')
  const int = whole.replace(/^0+(?=\d)/, '').slice(0, 11)
  return cents === undefined ? int : `${int}.${cents.slice(0, 2)}`
}

/** A big centred amount (no box) with quick-pick chips underneath. `action` sits on the label row (e.g. Max). */
export default function AmountField({
  label,
  value,
  onChange,
  quick = [],
  hint,
  action,
  id = 'wallet-amount',
  showExtras = true,
  max,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  quick?: { label: string; value: string }[]
  hint?: string
  action?: ReactNode
  id?: string
  /** slide the range hint and quick amounts open or shut */
  showExtras?: boolean
  /** the most that can be entered: a number over it (typed or pasted) is not taken */
  max?: number
}) {
  // the number shrinks as it grows, so every digit stays in view however long it gets
  const size = value.length > 10 ? 'text-3xl' : value.length > 7 ? 'text-4xl' : 'text-5xl'
  return (
    <section className="py-4 text-center max-sm:rounded-2xl max-sm:bg-well max-sm:px-4 max-sm:ring-1 max-sm:ring-inset max-sm:ring-ink/[0.06]">
      <div className={`flex items-center ${action ? 'justify-between' : 'justify-center'}`}>
        <label htmlFor={id} className="text-xs text-muted">
          {label}
        </label>
        {action}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2">
        <span className="text-3xl font-semibold leading-none text-muted/60">$</span>
        {/* the invisible copy sizes the box to the number, so $ and USDT hug it */}
        <span className="relative inline-grid min-w-[1.5ch] max-w-full">
          <span aria-hidden="true" className={`invisible whitespace-pre font-bold leading-none tabular-nums ${size}`}>
            {value || '0'}
          </span>
          <input
            id={id}
            // a text field, not type="number": a number field reports "" while "5." is half typed, which fights a controlled value
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              const v = cleanAmount(e.target.value)
              // over the limit (typed or pasted): the box keeps what it had
              if (max !== undefined && parseFloat(v) > max) return
              onChange(v)
            }}
            placeholder="0"
            className={`absolute inset-0 w-full bg-transparent p-0 text-center font-bold leading-none tabular-nums text-text outline-none placeholder:text-muted/30 ${size}`}
          />
        </span>
        <span className="self-end pb-1 text-xs font-semibold leading-none text-muted">USDT</span>
      </div>
      <Collapse open={showExtras}>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
        <div className={`flex justify-center gap-1 ${quick.length ? 'mt-3' : ''}`}>
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => onChange(q.value)}
              className={`h-8 rounded-full px-3.5 text-xs font-medium transition-colors ${
                value === q.value ? 'bg-ink/10 text-text' : 'bg-ink/[0.04] text-muted hover:bg-ink/[0.08] hover:text-text'
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>
      </Collapse>
    </section>
  )
}
