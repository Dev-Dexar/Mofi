import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useToast } from '@/context/ToastContext'

/** A flat card: neutral near-black with the app's hairline border */
export const panel = 'rounded-3xl border border-ink/10 bg-surface' // same surface colour as Wallet and History

/** What sits inside the outer container of the tabs: the Dashboard's inner style (a darker well with a hairline, still neutral), so the outer card reads as the frame */
export const inner = 'rounded-2xl border border-ink/5 bg-base' // a step darker than the surface around it

/** Nothing here yet: an icon, a line and a hint, centred in the well */
export function EmptyBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className={`${inner} flex flex-col items-center px-6 py-12 text-center`}>
      <span className="grid size-11 place-items-center rounded-2xl bg-ink/[0.06] text-muted">{icon}</span>
      <h3 className="mt-4 text-sm font-semibold text-text">{title}</h3>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">{description}</p>
    </div>
  )
}

/** A grey stand-in for something that has not arrived yet */
export const bone = 'animate-pulse rounded-full bg-ink/[0.07]'

export const shortDate = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Copies to the clipboard and says so; resolves to whether it worked */
export function useCopy() {
  const toast = useToast()
  return async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied`, 'copied')
      return true
    } catch {
      toast.error('Could not copy. Select it and copy by hand.')
      return false
    }
  }
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  const btn =
    'grid size-9 place-items-center rounded-full bg-ink/5 text-muted transition-colors hover:bg-ink/10 hover:text-text disabled:opacity-30 disabled:hover:bg-ink/5'
  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-xs text-muted">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  )
}
