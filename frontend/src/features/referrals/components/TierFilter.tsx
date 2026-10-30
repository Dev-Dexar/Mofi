import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CrossIcon, FilterIcon } from '@/icons'

const HEAD = 40 // the pill's height
const ROW = 32 // slim rows, with a small gap between them so a hover reads as one row, not a joined strip
const GAP = 2
const PAD = 8 // room under the last row: with the side padding it keeps the rows' corners inside the box's rounded corners
const WIDTH = 136 // the pill's width when it shows its label (always, from sm up; on phones only while open)

/**
 * "Tier 2" as a pill that opens by growing: the pill itself stretches down into the list of tiers, and folds back into a pill.
 * From sm up its width never changes. On a phone it rests as a round filter button (so it can share a row with the tabs) and,
 * opened, grows to full width toward the left, over the tabs, as well as downward. The row it sits in never changes size.
 */
export default function TierFilter({
  value,
  onChange,
  options,
}: {
  value: number
  onChange: (v: number) => void
  options: { value: number; label: string; count?: number }[]
}) {
  const [open, setOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const icon = narrow && !open // phone, closed: just the filter button
  const restW = narrow ? HEAD : WIDTH
  const box = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

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

  const changed = value !== options[0]?.value // a tier other than the default is picked: say so on the bare icon
  const pillContent = (
    <>
      <span className="relative shrink-0">
        <FilterIcon className="size-4 text-muted" />
        {icon && changed && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary" />}
      </span>
      <span className={`overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity] duration-300 ${icon ? 'max-w-0 opacity-0' : 'max-w-24 flex-1 opacity-100'}`}>
        {current?.label}
      </span>
      {/* the chevron; on a phone, once open, it turns into a cross: this is the way to put the list away */}
      <span className={`relative size-4 shrink-0 text-muted transition-[width,opacity] duration-300 ${icon ? 'w-0 opacity-0' : 'opacity-100'}`}>
        <ChevronDown
          className={`absolute inset-0 size-4 transition-[transform,opacity] duration-300 ${open ? 'rotate-180' : ''} ${open && narrow ? 'scale-50 opacity-0' : ''}`}
        />
        <CrossIcon
          className={`absolute inset-0 m-auto size-3.5 transition-[transform,opacity] duration-300 ${open && narrow ? 'rotate-0 opacity-100' : '-rotate-90 scale-50 opacity-0'}`}
        />
      </span>
    </>
  )

  return (
    <div ref={box} className="relative shrink-0" style={{ height: HEAD, width: restW }}>
      <div
        className={`absolute right-0 top-0 z-30 overflow-hidden rounded-[1.25rem] ring-1 ring-inset transition-[height,width,background-color,box-shadow] duration-[350ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'bg-raised ring-ink/10' : 'bg-ink/5 ring-transparent hover:bg-ink/10'
        }`}
        style={{ width: open ? WIDTH : restW, height: open ? HEAD + options.length * ROW + (options.length - 1) * GAP + PAD : HEAD }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex h-10 w-full items-center text-sm font-semibold text-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 ${
            icon ? 'justify-center' : 'gap-2 pl-3.5 pr-3'
          }`}
        >
          {pillContent}
        </button>

        <div
          role="listbox"
          aria-hidden={!open}
          className={`flex flex-col gap-0.5 px-2 pb-2 transition-opacity duration-300 ${open ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'}`}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={`flex h-8 w-full items-center rounded-xl px-2.5 text-left text-sm transition-colors ${
                o.value === value ? 'bg-primary/15 font-semibold text-primary' : 'text-text hover:bg-ink/[0.07]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
