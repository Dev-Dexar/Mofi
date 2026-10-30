import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { currentTheme } from '@/lib/theme'

/** Cloudflare Turnstile site key (public). With none set the widget is skipped, which is only right while Supabase's CAPTCHA protection is off. */
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

export interface TurnstileHandle {
  /** A fresh single-use token, waiting for the check to finish if it has not. Undefined when Turnstile is not configured. Rejects with Error('captcha_failed'). */
  getToken: () => Promise<string | undefined>
  /** Tokens work once: call after every request that used one */
  reset: () => void
}

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptLoading: Promise<TurnstileApi> | null = null
function loadScript() {
  scriptLoading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const el = document.createElement('script')
    el.src = SCRIPT_SRC
    el.async = true
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('captcha_failed')))
    el.onerror = () => {
      scriptLoading = null // let a later attempt try again
      reject(new Error('captcha_failed'))
    }
    document.head.appendChild(el)
  })
  return scriptLoading
}

const WAIT_MS = 15000

/**
 * Cloudflare's bot check, shown as the visible "Verify you are human" checkbox. It starts checking as soon as it
 * mounts; ask it for a token before each request. Only one is on screen at a time, so they share a ref.
 */
const Turnstile = forwardRef<TurnstileHandle, { className?: string; onVerified?: (ok: boolean) => void }>(function Turnstile(
  { className = '', onVerified },
  ref,
) {
  // Always the latest callback, without re-creating the widget when it changes
  const notify = useRef(onVerified)
  notify.current = onVerified
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const token = useRef<string | null>(null)
  const waiting = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void }[]>([])

  const settle = (t: string | null) => {
    const queue = waiting.current.splice(0)
    queue.forEach((w) => (t ? w.resolve(t) : w.reject(new Error('captcha_failed'))))
  }

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return
    let cancelled = false
    loadScript()
      .then((api) => {
        if (cancelled || !box.current) return
        widget.current = api.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: currentTheme(), // the widget is drawn in the page's own light or dark
          size: 'flexible',
          callback: (t: string) => {
            token.current = t
            notify.current?.(true)
            settle(t)
          },
          'expired-callback': () => {
            token.current = null // the widget refreshes itself
            notify.current?.(false)
          },
          'error-callback': () => {
            token.current = null
            notify.current?.(false)
            settle(null)
          },
        })
      })
      .catch(() => settle(null))
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
      token.current = null
      notify.current?.(false)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    getToken: () => {
      if (!TURNSTILE_SITE_KEY) return Promise.resolve(undefined)
      if (token.current) return Promise.resolve(token.current)
      return new Promise<string>((resolve, reject) => {
        const entry = { resolve, reject }
        waiting.current.push(entry)
        window.setTimeout(() => {
          const i = waiting.current.indexOf(entry)
          if (i >= 0) {
            waiting.current.splice(i, 1)
            reject(new Error('captcha_failed'))
          }
        }, WAIT_MS)
      })
    },
    reset: () => {
      token.current = null
      notify.current?.(false)
      if (widget.current) window.turnstile?.reset(widget.current)
    },
  }))

  return TURNSTILE_SITE_KEY ? <div ref={box} className={`flex justify-center empty:hidden ${className}`} /> : null
})

export default Turnstile
