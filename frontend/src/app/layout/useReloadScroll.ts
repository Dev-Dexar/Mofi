import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// True once the first page of this document load has had its chance to restore: later navigations inside the app start at the top, as usual
let consumed = false

const keyFor = (path: string) => `mofi_scroll:${path}`

/**
 * Keeps your place when the page is reloaded (or you come back to it with the browser's back button).
 * The browser tries this itself but gives up: this app draws its pages after the data arrives, so on reload the page is
 * still short and the saved position is out of range. So the position is kept here, and restored once the page is tall enough.
 */
export function useReloadScroll() {
  const { pathname } = useLocation()
  const armed = useRef(false) // saving starts only after the restore, or the browser's own jump to the top would overwrite what we saved

  useEffect(() => {
    let timer = 0
    const save = () => {
      if (!armed.current) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        try {
          sessionStorage.setItem(keyFor(pathname), String(Math.round(window.scrollY)))
        } catch {
          // storage unavailable: nothing is remembered, the page just opens at the top
        }
      }, 120)
    }
    window.addEventListener('scroll', save, { passive: true })
    return () => {
      window.removeEventListener('scroll', save)
      window.clearTimeout(timer)
    }
  }, [pathname])

  useEffect(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    let saved = 0
    try {
      saved = Number(sessionStorage.getItem(keyFor(pathname))) || 0
    } catch {
      saved = 0
    }
    if (consumed || !nav || (nav.type !== 'reload' && nav.type !== 'back_forward') || !saved) {
      consumed = true
      armed.current = true
      return
    }
    consumed = true

    let raf = 0
    let tries = 0
    const attempt = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight
      if (room >= saved - 1 || tries++ > 120) {
        window.scrollTo({ top: saved, behavior: 'instant' as ScrollBehavior }) // not the smooth scrolling the page has set for itself
        armed.current = true
        return
      }
      raf = requestAnimationFrame(attempt)
    }
    raf = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
