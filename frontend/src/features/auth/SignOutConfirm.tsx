import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { signOut } from '@/lib/auth'

/**
 * "Sign out?" in a small window over everything (the profile window included), shared by every sign-out button.
 * It scales in from the middle like the other windows, Cancel has focus so Enter or Escape keeps you signed in,
 * and confirming signs out and goes to the login page.
 */
export default function SignOutConfirm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [shown, setShown] = useState(open)
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const cancelBtn = useRef<HTMLButtonElement>(null)

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
    cancelBtn.current?.focus({ preventScroll: true })
    // caught before any window underneath sees it, so Escape closes only this
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      if (!busy) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, busy, onClose])

  const confirm = async () => {
    setBusy(true)
    try {
      await signOut()
    } finally {
      navigate('/login')
    }
  }

  if (!shown) return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="presentation">
      <div
        onClick={() => !busy && onClose()}
        className={`absolute inset-0 bg-black/60 ${closing ? 'center-backdrop-out' : 'center-backdrop-in'}`}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sign-out-title"
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) {
            setShown(false)
            setClosing(false)
          }
        }}
        className={`relative w-full max-w-[17rem] rounded-3xl border border-ink/10 bg-surface p-3 pt-4 text-center shadow-[0_30px_60px_color-mix(in_srgb,var(--color-shade)_55%,transparent)] ${
          closing ? 'center-window-out' : 'center-window-in'
        }`}
      >
        <h2 id="sign-out-title" className="text-sm font-semibold text-text">
          Sign out of MoFi Life?
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            ref={cancelBtn}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-full bg-ink/[0.06] text-sm font-bold text-text outline-none transition-[background-color,scale] hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-ink/60 active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="flex h-10 items-center justify-center gap-2 rounded-full bg-danger text-sm font-bold text-white outline-none transition-[opacity,scale] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-danger/60 active:scale-95 disabled:opacity-70 disabled:active:scale-100"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
