import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * A small window for what an admin typed (a reason, a reply) or what a user wrote, kept out of rows and cards so a long or odd
 * text can't break them. Mount = open; `onClosed` fires after it has faded out. Opened from inside the account panel (`host`),
 * it sits within that panel, centred in it and dimming only it, rather than over the whole screen.
 */
export function NoteWindow({ title, host, onClosed, children }: { title: string; host: HTMLElement | null; onClosed: () => void; children: ReactNode }) {
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const doneBtn = useRef<HTMLButtonElement>(null)

  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onClosed()
    setClosing(true)
  }

  useEffect(() => {
    doneBtn.current?.focus({ preventScroll: true })
    // caught before anything underneath (the account panel) sees it, so Escape closes only this
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div className={`${host ? 'absolute inset-0 z-50 rounded-[inherit]' : 'fixed inset-0 z-[120]'} flex items-center justify-center p-4`} role="presentation">
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/60 ${host ? 'rounded-[inherit]' : ''} ${closing ? 'center-backdrop-out' : 'center-backdrop-in'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClosed()
        }}
        className={`relative w-full max-w-md overflow-hidden rounded-3xl border border-ink/10 bg-surface shadow-[0_30px_60px_color-mix(in_srgb,var(--color-shade)_55%,transparent)] ${
          closing ? 'center-window-out' : 'center-window-in'
        }`}
      >
        <h2 className="px-5 pb-3 pt-5 text-[15px] font-bold leading-snug tracking-tight text-text [overflow-wrap:anywhere]">{title}</h2>
        {/* the bubbles scroll under the button, which floats over the bottom of the window with a fade behind it */}
        <div className="relative">
          <div className="px-4">{children}</div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface from-55% to-transparent px-5 pb-5 pt-10">
            <button
              ref={doneBtn}
              type="button"
              onClick={close}
              className="pointer-events-auto h-10 w-full rounded-full bg-[#2b2e36] text-sm font-bold text-text shadow-[0_10px_24px_color-mix(in_srgb,var(--color-shade)_45%,transparent)] outline-none transition-[background-color,scale] hover:bg-[#343842] focus-visible:ring-2 focus-visible:ring-ink/60 active:scale-95"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>,
    host ?? document.body,
  )
}

/** Where the bubbles go: scrolls when there are many or long ones */
export function NoteWell({ children }: { children: ReactNode }) {
  return <div className="max-h-[min(26rem,55vh)] space-y-4 overflow-y-auto px-1 pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
}

/**
 * One piece of text as a chat bubble with its label above. What the user wrote sits on the left (solid green); what we wrote, on the right (solid grey).
 * A note meant only for admins is drawn darker with a dashed outline so it can't be mistaken for something the user saw.
 */
export function NoteField({ label, from = 'team', internal = false, children }: { label: string; from?: 'team' | 'user'; internal?: boolean; children: ReactNode }) {
  const user = from === 'user'
  return (
    <div className={`flex flex-col ${user ? 'items-start' : 'items-end'}`}>
      <p className="mb-1.5 px-1 text-xs font-semibold text-muted">{label}</p>
      <p
        className={`max-w-[92%] whitespace-pre-line px-4 py-3 text-sm leading-relaxed text-text [overflow-wrap:anywhere] ${
          user
            ? 'rounded-2xl rounded-tl-md bg-[#15382e]'
            : internal
              ? 'rounded-2xl rounded-tr-md border border-dashed border-ink/25 bg-popover'
              : 'rounded-2xl rounded-tr-md bg-[#262a33]'
        }`}
      >
        {children}
      </p>
    </div>
  )
}

/** The dotted-underlined link that says "click me" and opens a NoteWindow (in the account panel when it is in one) */
export function NoteLink({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const link = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={link}
        type="button"
        onClick={() => {
          setHost(link.current?.closest<HTMLElement>('[data-side-panel]') ?? null)
          setOpen(true)
        }}
        className="rounded text-muted underline decoration-dotted decoration-muted/70 underline-offset-4 outline-none transition-colors hover:text-text hover:decoration-text/60 focus-visible:ring-2 focus-visible:ring-ink/40"
      >
        {label}
      </button>
      {open && (
        <NoteWindow title={title} host={host} onClosed={() => setOpen(false)}>
          {children}
        </NoteWindow>
      )}
    </>
  )
}

/**
 * What an admin typed when they did something, kept out of the log's rows: a dotted "Note" that opens it whole, with who wrote it
 * and when.
 */
export default function LogNote({ title, note, who, at }: { title: string; note: string; who?: string | null; at?: string }) {
  return (
    <NoteLink label="Note" title={title}>
      <NoteWell>
        <NoteField label="Entered by the admin:">{note}</NoteField>
        {(who || at) && <p className="px-1 text-xs text-muted [overflow-wrap:anywhere]">{[who, at].filter(Boolean).join(' · ')}</p>}
      </NoteWell>
    </NoteLink>
  )
}
