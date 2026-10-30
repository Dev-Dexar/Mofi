import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert } from 'lucide-react'
import LegalWindow from '@/components/legal/LegalWindow'
import { LEGAL_DOCS } from '@/components/legal/legal'

/**
 * "Why was my account suspended?" in a small window: what the team wrote when they suspended it, or, when they wrote
 * nothing, that it broke the Terms of Service, with the Terms one tap away. Scales in from the middle like the other windows;
 * Escape or a tap outside closes it (but not while the Terms are open over it, which handle Escape themselves).
 */
export default function SuspensionReason({ open, onClose, message }: { open: boolean; onClose: () => void; message: string | null | undefined }) {
  const [shown, setShown] = useState(open)
  const [closing, setClosing] = useState(false)
  const [terms, setTerms] = useState<HTMLElement | null>(null)
  const doneBtn = useRef<HTMLButtonElement>(null)

  // stays on screen while it animates out
  useEffect(() => {
    if (open) {
      setShown(true)
      setClosing(false)
    } else if (shown) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setShown(false)
      else setClosing(true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    doneBtn.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => {
    if (!open || terms) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, terms, onClose])

  if (!shown) return null

  const reason = message?.trim()

  return createPortal(
    <>
      {/* below the Terms window (z-100), so the Terms open over this one */}
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
        <div onClick={onClose} className={`absolute inset-0 bg-black/60 ${closing ? 'center-backdrop-out' : 'center-backdrop-in'}`} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspension-reason-title"
          onAnimationEnd={(e) => {
            if (closing && e.target === e.currentTarget) {
              setShown(false)
              setClosing(false)
            }
          }}
          className={`relative w-full max-w-sm overflow-hidden rounded-3xl border border-ink/10 bg-surface shadow-[0_30px_60px_color-mix(in_srgb,var(--color-shade)_55%,transparent)] ${
            closing ? 'center-window-out' : 'center-window-in'
          }`}
        >
          {/* title */}
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-400">
              <CircleAlert className="size-5" />
            </span>
            <h2 id="suspension-reason-title" className="text-[15px] font-bold leading-snug tracking-tight text-text">
              Why was my account suspended?
            </h2>
          </div>

          {/* what the team wrote; a long one scrolls. Set into the window like a well, so it reads as the content */}
          <div className="px-4 py-4">
            <div className="rounded-2xl border border-ink/[0.06] bg-base/70 px-4 py-3.5 shadow-[inset_0_2px_10px_color-mix(in_srgb,var(--color-shade)_55%,transparent),inset_0_-1px_0_rgba(255,255,255,0.04)]">
              <p className="text-xs font-semibold text-muted">Our team says:</p>
              <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-text">
                {reason || 'Your account broke our Terms of Service.'}
              </p>
            </div>
          </div>

          {/* the Terms, and close */}
          <div className="px-5 pb-5 pt-1">
            <p className="text-sm text-muted">
              Read our{' '}
              <button
                type="button"
                onClick={(e) => setTerms(e.currentTarget)}
                className="rounded text-text underline decoration-ink/25 underline-offset-2 outline-none transition-colors hover:decoration-ink/70 focus-visible:ring-2 focus-visible:ring-ink/40"
              >
                Terms of Service
              </button>
              .
            </p>
            <button
              ref={doneBtn}
              type="button"
              onClick={onClose}
              className="mt-4 h-10 w-full rounded-full bg-ink/[0.06] text-sm font-bold text-text outline-none transition-[background-color,scale] hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-ink/60 active:scale-95"
            >
              Got it
            </button>
          </div>
        </div>
      </div>

      {terms && (
        <LegalWindow
          doc={LEGAL_DOCS.terms}
          source={terms}
          onClosed={() => {
            terms.focus({ preventScroll: true })
            setTerms(null)
          }}
        />
      )}
    </>,
    document.body,
  )
}
