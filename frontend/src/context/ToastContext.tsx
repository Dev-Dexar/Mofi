import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { TOAST_ICONS, type ToastIconName } from '@/icons'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  icon: ToastIconName
  leaving: boolean
  nonce: number // bumped when the same message fires again while still showing
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, icon?: ToastIconName) => void
  success: (message: string, icon?: ToastIconName) => void
  error: (message: string, icon?: ToastIconName) => void
  info: (message: string, icon?: ToastIconName) => void
  /** Centre the toasts over this element instead of the whole window (null to go back) */
  setAnchor: (el: HTMLElement | null) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

const MAX_VISIBLE = 2
const LIFETIME_MS = 4000
const RESUME_MS = 2500 // what is left after a toast was held or dragged and let go
const EXIT_MS = 440 // the toast flies off in about 220 ms, then the space it held closes (so the ones below glide up): see the wrapper in the provider
const SWIPE_DISMISS_PX = 36

const TONE: Record<ToastType, string> = { success: 'text-primary', error: 'text-danger', info: 'text-accent2' }

interface ToastViewProps {
  toast: ToastItem
  onDismiss: (id: string) => void
  onHold: (id: string) => void
  onRelease: (id: string) => void
}

/** One notification. Swipe it up (or tap it) to dismiss; holding it pauses its timer. */
function ToastView({ toast, onDismiss, onHold, onRelease }: ToastViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startT: number; moved: boolean; dy: number } | null>(null)
  const nudged = useRef(toast.nonce)

  // The same message fired again while it was up: a small pulse. (Played on the same element, so a held or dragged toast is not rebuilt under the finger.)
  useEffect(() => {
    if (toast.nonce === nudged.current) return
    nudged.current = toast.nonce
    el.current?.animate([{ scale: '1' }, { scale: '1.03' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(0.22,1,0.36,1)' })
  }, [toast.nonce])

  // While dragging, the element is moved directly (no React render per move) and without any transition, so it stays under the finger on
  // every frame. Only the way back (and the exit) is animated.
  const place = (dy: number) => {
    const n = el.current
    if (!n) return
    n.style.transform = dy ? `translateY(${dy}px)` : ''
    n.style.opacity = dy < 0 ? String(Math.max(0.35, 1 + dy / 140)) : ''
  }

  const end = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current
    const n = el.current
    if (!d || !n) return
    drag.current = null
    if (n.hasPointerCapture(e.pointerId)) n.releasePointerCapture(e.pointerId)
    const flick = performance.now() - d.startT < 250 && d.dy < -14
    if (!cancelled && (!d.moved || d.dy < -SWIPE_DISMISS_PX || flick)) {
      // a tap, a long swipe or a quick flick: the exit starts from wherever the finger left it
      n.style.setProperty('--dy', `${d.dy}px`)
      n.style.setProperty('--op', n.style.opacity || '1')
      n.style.transition = 'none'
      n.style.transform = ''
      n.style.opacity = ''
      onDismiss(toast.id)
    } else {
      n.style.transition = 'transform 260ms cubic-bezier(0.22,1,0.36,1), opacity 200ms' // snap back
      place(0)
      onRelease(toast.id)
    }
  }

  return (
    <div
      ref={el}
      role={toast.type === 'error' ? 'alert' : 'status'}
      onPointerDown={(e) => {
        if (toast.leaving || e.button > 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.style.transition = 'none'
        drag.current = { startY: e.clientY, startT: performance.now(), moved: false, dy: 0 }
        onHold(toast.id)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const delta = e.clientY - d.startY
        if (Math.abs(delta) > 5) d.moved = true
        d.dy = delta < 0 ? delta : delta * 0.15 // up follows the finger, down barely moves
        place(d.dy)
      }}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      onLostPointerCapture={(e) => drag.current && end(e, true)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHold(toast.id)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && !drag.current && onRelease(toast.id)}
      style={{ touchAction: 'none', willChange: 'transform' }}
      className={`pointer-events-auto flex h-12 w-full cursor-grab select-none items-center gap-2.5 rounded-full border border-ink/[0.14] bg-raised/85 pl-3.5 pr-5 backdrop-blur-xl backdrop-saturate-150 active:cursor-grabbing ${
        toast.leaving ? 'toast-out' : 'toast-in'
      }`}
    >
      <span className={`grid size-6 shrink-0 place-items-center ${toast.icon === 'wallet' ? 'text-text/80' : TONE[toast.type]}`}>{TOAST_ICONS[toast.icon]}</span>
      <span className="line-clamp-2 text-[0.8125rem] font-medium leading-[1.2] text-text">{toast.message}</span>
    </div>
  )
}

/** Where an element sits in the layout, ignoring any transform on it or its parents (pages slide in) */
function layoutBox(el: HTMLElement) {
  let left = 0
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) left += node.offsetLeft
  return { left, width: el.offsetWidth }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!anchor) return setBox(null)
    const measure = () => setBox(layoutBox(anchor))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(anchor)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [anchor])

  // The list lives in a ref too, so back-to-back calls in one tick see each other
  const list = useRef<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())

  const update = useCallback((fn: (prev: ToastItem[]) => ToastItem[]) => {
    list.current = fn(list.current)
    setToasts(list.current)
  }, [])

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t !== undefined) window.clearTimeout(t)
    timers.current.delete(id)
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id)
      const current = list.current.find((t) => t.id === id)
      if (!current || current.leaving) return
      update((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
      window.setTimeout(() => update((prev) => prev.filter((t) => t.id !== id)), EXIT_MS)
    },
    [clearTimer, update],
  )

  const arm = useCallback(
    (id: string, ms: number) => {
      clearTimer(id)
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms))
    },
    [clearTimer, dismiss],
  )

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', icon: ToastIconName = type) => {
      // The same message while it is still up: nudge it and restart its timer instead of stacking a copy
      const same = list.current.find((t) => !t.leaving && t.message === message && t.type === type)
      if (same) {
        update((prev) => prev.map((t) => (t.id === same.id ? { ...t, nonce: t.nonce + 1 } : t)))
        arm(same.id, LIFETIME_MS)
        return
      }

      const id = Math.random().toString(36).slice(2, 9)
      // Only MAX_VISIBLE at once: the oldest makes room
      const live = list.current.filter((t) => !t.leaving)
      live.slice(0, Math.max(0, live.length - MAX_VISIBLE + 1)).forEach((t) => dismiss(t.id))
      update((prev) => [...prev, { id, message, type, icon, leaving: false, nonce: 0 }])
      arm(id, LIFETIME_MS)
    },
    [arm, dismiss, update],
  )

  // Nothing fires after the provider is gone
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  const success = useCallback((msg: string, icon?: ToastIconName) => showToast(msg, 'success', icon), [showToast])
  // "You are going too fast" (the server's rate limit, whichever action it came from) has its own icon: a clock with a speed trace, in red
  const error = useCallback((msg: string, icon?: ToastIconName) => showToast(msg, 'error', icon ?? (/too fast/i.test(msg) ? 'too-fast' : undefined)), [showToast])
  const info = useCallback((msg: string, icon?: ToastIconName) => showToast(msg, 'info', icon), [showToast])

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, setAnchor }}>
      {children}
      <div
        className={`pointer-events-none fixed z-[200] flex flex-col items-center px-4 ${
          box ? '' : 'inset-x-0'
        } lg:items-end lg:px-6`}
        style={{ top: 'max(1rem, env(safe-area-inset-top))', ...(box ? { left: box.left, width: box.width } : {}) }}
      >
        {toasts.map((t) => (
          // Each toast sits in a row that closes when it leaves (a grid track easing from its full height to nothing, a beat after the toast
          // starts to go), so the ones below glide up instead of jumping. The spacing is inside the row, so it closes with it.
          <div
            key={t.id}
            className={`grid w-full max-w-[22rem] transition-[grid-template-rows] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              t.leaving ? 'grid-rows-[0fr] delay-100' : 'grid-rows-[1fr]'
            }`}
          >
            <div className="min-h-0 pb-2">
              <ToastView toast={t} onDismiss={dismiss} onHold={clearTimer} onRelease={(id) => arm(id, RESUME_MS)} />
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

/** Centres this page's toasts over the element in `ref` for as long as the page is mounted */
export function useToastAnchor(ref: RefObject<HTMLElement | null>) {
  const { setAnchor } = useToast()
  useEffect(() => {
    setAnchor(ref.current)
    return () => setAnchor(null)
  }, [ref, setAnchor])
}
