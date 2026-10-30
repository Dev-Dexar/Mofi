import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CrossIcon } from '@/icons'

/**
 * A panel that slides in from the right over the page, floating a little in from the top, bottom and right edges, about 55% of the screen wide (nearly all of it on a phone), and slides
 * back out on close. The page behind is dimmed and can't scroll; Escape, the close button or a click outside shuts it.
 * Mount = open; `onClosed` fires once the slide out has finished. Give it `instant` when it is already there on arrival
 * (a link or a reload), which skips the slide in.
 */
export default function SidePanel({
  title,
  children,
  onClosed,
  instant = false,
}: {
  title: ReactNode
  children: ReactNode
  onClosed: () => void
  instant?: boolean
}) {
  const closeBtn = useRef<HTMLButtonElement>(null)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const titleId = `side-${useId()}-title`

  const close = () => {
    if (closingRef.current) return
    closingRef.current = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onClosed()
    setClosing(true)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a dialog opened from inside the panel (suspend, make admin) closes first, with its own Escape
      if (e.key === 'Escape' && !document.querySelector('[role="alertdialog"], [aria-modal="true"]:not([data-side-panel])')) close()
    }
    window.addEventListener('keydown', onKey)
    closeBtn.current?.focus({ preventScroll: true })
    // the page behind stays where it is (the scrollbar keeps its strip, so nothing shifts)
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      html.style.overflow = before
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="presentation">
      <div
        onClick={close}
        className={`absolute inset-0 bg-black/60 ${closing ? 'center-backdrop-out' : instant ? '' : 'center-backdrop-in'}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        data-side-panel
        aria-labelledby={titleId}
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClosed()
        }}
        className={`absolute inset-3 flex flex-col rounded-3xl border border-ink/10 bg-surface shadow-[0_30px_60px_color-mix(in_srgb,var(--color-shade)_55%,transparent)] sm:left-auto sm:w-[55vw] sm:min-w-[520px] sm:max-w-[1000px] ${
          closing ? 'drawer-out' : instant ? '' : 'drawer-in'
        }`}
      >
        {/* The whole panel scrolls, and its title bar floats over the top of it, pinned: a gradient that is solid at the very top and
            clear at the bottom, so content passes under it instead of ending at a line. Whatever sits just under the bar can float
            the same way (sticky top-14, z-30). */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[inherit] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="sticky top-0 z-20 flex h-14 items-center justify-between bg-gradient-to-b from-surface via-surface/85 to-transparent px-5">
            <h2 id={titleId} className="text-sm font-semibold text-text/80">
              {title}
            </h2>
            <button
              ref={closeBtn}
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid size-7 cursor-pointer place-items-center rounded-full bg-[#FF5F57] text-white outline-none transition-[transform,filter,scale] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ink/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-90"
            >
              <CrossIcon className="size-3" />
            </button>
          </div>
          <div className="px-4 pb-6 sm:px-5">{children}</div>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
