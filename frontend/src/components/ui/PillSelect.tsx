import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const HEAD = 40 // the pill's height
const ROW = 32
const GAP = 2
const PAD = 8

/**
 * A dropdown that opens by growing: the pill stretches down into its list and folds back into a pill (same motion as the
 * referral TierFilter). Width comes from `className`, and the row it sits in keeps its height, so nothing around it moves.
 */
export default function PillSelect<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className = '',
  hideSelected = false,
  placeholder,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode; hint?: string }[]
  label: string
  className?: string
  /** leave the chosen option out of the list (it is already shown on the pill) */
  hideSelected?: boolean
  /** shown when `value` matches no option (nothing chosen yet) */
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? (placeholder ? undefined : options[0])
  const listed = hideSelected ? options.filter((o) => o !== current) : options

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className={`relative ${className}`} style={{ height: HEAD }}>
      <div
        className={`absolute inset-x-0 top-0 z-30 overflow-hidden rounded-[1.25rem] ring-1 ring-inset transition-[height,background-color,box-shadow] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'bg-raised ring-ink/10' : 'bg-ink/5 ring-transparent hover:bg-ink/10'
        }`}
        style={{ height: open ? HEAD + listed.length * ROW + (listed.length - 1) * GAP + PAD : HEAD }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          className="flex h-10 w-full items-center gap-1.5 pl-3.5 pr-2.5 text-xs font-medium text-text outline-none sm:gap-2 sm:pl-4 sm:pr-3 sm:text-[13px] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
        >
          {current?.icon}
          <span className={`flex-1 truncate text-left ${current ? '' : 'text-muted'}`}>{current?.label ?? placeholder}</span>
          {current?.hint && <span className="shrink-0 text-[11px] text-muted">{current.hint}</span>}
          <ChevronDown className={`size-4 shrink-0 text-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>

        <div
          role="listbox"
          aria-hidden={!open}
          className={`flex flex-col gap-0.5 px-2 pb-2 transition-opacity duration-300 ${open ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'}`}
        >
          {listed.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={o.value === value}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={`flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs transition-colors sm:text-[13px] ${
                o.value === value ? 'bg-primary/15 font-semibold text-primary' : 'text-text hover:bg-ink/[0.07]'
              }`}
            >
              {o.icon}
              <span className="flex-1 truncate">{o.label}</span>
              {o.hint && <span className={`shrink-0 text-[11px] ${o.value === value ? 'text-primary/70' : 'text-muted'}`}>{o.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
