import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BackIcon, CrossIcon } from '@/icons'

/** A floating window that scales and fades in from the middle of the screen, and back out on close. The legal documents use it too. */
export default function CenterWindow({
  title,
  children,
  onClosed,
  width = 'default',
  onBack,
  headerLeft,
  snug = false,
  instant = false,
  reveal = 'scale',
}: {
  title: ReactNode
  /** a function gets `close`, to shut the window with its animation from inside (after a Download, say) */
  children: ReactNode | ((close: () => void) => ReactNode)
  onClosed: () => void
  width?: 'narrow' | 'default' | 'wide'
  /** shows a back arrow in the title bar */
  onBack?: () => void
  /** something for the left end of the title bar (not shown while there is a back arrow, which takes that place) */
  headerLeft?: ReactNode
  /** less room around the content */
  snug?: boolean
  /** already open when it appears (a direct link or a reload): no opening animation, though it still closes with one */
  instant?: boolean
  /** 'scale' grows from the middle (the profile); 'clip' opens out of a small rounded box */
  reveal?: 'scale' | 'clip'
}) {
  const root = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)

  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onClosed()
    setClosing(true)
  }

  useEffect(() => {
    const el = root.current
    const swallow = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.('.overflow-y-auto')) e.preventDefault()
    }
    el?.addEventListener('wheel', swallow, { passive: false })
    el?.addEventListener('touchmove', swallow, { passive: false })
    // a dialog opened from inside the window (a confirmation) takes Escape first
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[aria-modal="true"]:not([data-center-window])') && close()
    window.addEventListener('keydown', onKey)
    closeBtn.current?.focus({ preventScroll: true })
    return () => {
      el?.removeEventListener('wheel', swallow)
      el?.removeEventListener('touchmove', swallow)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const titleId = `center-${useId()}-title`

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[100] flex items-center justify-center overscroll-none p-3 sm:p-6" role="presentation">
      <div
        onClick={close}
        className={`absolute inset-0 ${closing ? 'center-backdrop-out' : instant ? '' : 'center-backdrop-in'}`}
        style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.62), rgba(0,0,0,0.84))' }}
      />

      <div
        role="dialog"
        aria-modal="true"
        data-center-window
        aria-labelledby={titleId}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClosed()
        }}
        className={`relative w-full ${width === 'narrow' ? 'max-w-md' : width === 'wide' ? 'max-w-3xl' : 'max-w-2xl'} ${closing ? (reveal === 'clip' ? 'center-clip-out' : 'center-window-out') : instant ? '' : reveal === 'clip' ? 'center-clip-in' : 'center-window-in'}`}
      >
        <div className="flex max-h-[min(82vh,720px)] flex-col overflow-hidden rounded-2xl border border-ink/10 bg-surface shadow-[0_30px_60px_color-mix(in_srgb,var(--color-shade)_55%,transparent)]">
          <div className="relative flex h-12 shrink-0 items-center border-b border-ink/[0.06] px-4">
            <h2 id={titleId} className="pointer-events-none absolute inset-x-0 text-center text-sm font-semibold text-text/80">
              {title}
            </h2>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="view-in relative z-10 grid size-6 cursor-pointer place-items-center rounded-full bg-ink/10 text-text outline-none transition-[transform,background-color,scale,translate] duration-150 hover:bg-ink/15 focus-visible:ring-2 focus-visible:ring-ink/70 active:scale-90"
              >
                <BackIcon className="size-3" />
              </button>
            )}
            {!onBack && headerLeft && <div className="view-in relative z-10">{headerLeft}</div>}
            <button
              ref={closeBtn}
              type="button"
              onClick={close}
              aria-label="Close"
              className="ml-auto grid size-6 cursor-pointer place-items-center rounded-full bg-[#FF5F57] text-white outline-none transition-[transform,filter,scale,translate] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-90"
            >
              <CrossIcon className="size-2.5" />
            </button>
          </div>

          <div
            className={`overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${width === 'wide' ? 'p-3' : snug ? 'p-2.5' : 'p-6 sm:p-8'}`}
          >
            {typeof children === 'function' ? children(close) : children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
