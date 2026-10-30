import { useSyncExternalStore } from 'react'

/**
 * Light or dark. The choice is the device's own (its light/dark setting) until the person picks one; a pick is remembered in this
 * browser only (localStorage), because it is a preference of the screen they are looking at, not of the account: it has to be known
 * before anything loads (so the first paint is right) and on the public pages, where nobody is signed in yet.
 *
 * What is on screen is `data-theme` on <html>; every colour in the app follows it (index.css). The same rule runs once more in a small
 * script in index.html, before the first paint. The admin panel is dark whatever is chosen.
 */
export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'mofi_theme'
const BROWSER_BAR: Record<Theme, string> = { dark: '#0A0A0A', light: '#F3F5F8' } // the phone's address bar takes the page's colour

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null
const listeners = new Set<() => void>()

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref: ThemePref = readPref()
let path = typeof window !== 'undefined' ? window.location.pathname : '/'

const alwaysDark = (p: string) => p === '/admin' || p.startsWith('/admin/')

/** The theme that should be showing right now: the admin panel is dark, otherwise the pick, otherwise the device's setting */
function wanted(): Theme {
  if (alwaysDark(path)) return 'dark'
  if (pref === 'light' || pref === 'dark') return pref
  return media?.matches ? 'light' : 'dark'
}

function showing(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

function paint(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BROWSER_BAR[theme])
  listeners.forEach((fn) => fn())
}

type Origin = { x: number; y: number }
type WithTransition = Document & { startViewTransition?: (update: () => void) => { finished: Promise<unknown> } }

/** Puts a theme on screen: the new look spreads out in a circle from `origin` (the button pressed) where the browser can do that */
function swap(theme: Theme, origin?: Origin) {
  const doc = document as WithTransition
  const root = document.documentElement
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return paint(theme)
  const x = origin?.x ?? window.innerWidth / 2
  const y = origin?.y ?? 0
  // the circle has to reach the farthest corner
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  root.style.setProperty('--theme-x', `${x}px`)
  root.style.setProperty('--theme-y', `${y}px`)
  root.style.setProperty('--theme-r', `${r}px`)
  root.classList.add('theme-switching')
  const done = () => {
    root.classList.remove('theme-switching')
    root.style.removeProperty('--theme-x')
    root.style.removeProperty('--theme-y')
    root.style.removeProperty('--theme-r')
  }
  try {
    doc.startViewTransition(() => paint(theme)).finished.then(done, done)
  } catch {
    done()
    paint(theme)
  }
}

/**
 * Puts a theme on screen by fading the colours into each other. Nothing is captured or lifted onto a layer of its own: the colour variables
 * themselves (registered in index.css) are what move, so every element simply passes through the in-between colours in place. This is
 * the gentle way, for a control inside a window; the circle (swap) is for the page's own button.
 */
function fade(theme: Theme) {
  const root = document.documentElement
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return paint(theme)
  root.classList.add('theme-fading')
  void root.offsetHeight // the transition has to be in place before the colours change
  paint(theme)
  window.setTimeout(() => root.classList.remove('theme-fading'), 520)
}

/**
 * Picks light, dark, or "the device's setting". `how` is how the change is shown: 'circle' spreads out from where on screen it was pressed
 * (`origin`); 'fade' blends the colours in place.
 */
export function setThemePref(next: ThemePref, origin?: Origin, how: 'circle' | 'fade' = 'circle') {
  if (next === pref) return
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    /* private mode: it just is not remembered */
  }
  const theme = wanted()
  if (theme === showing()) listeners.forEach((fn) => fn()) // the pick changed but not the look (system → the same one)
  else if (how === 'fade') fade(theme)
  else swap(theme, origin)
}

/** Called when the page changes: the admin panel is always dark, so going in or out of it changes the look (at once, as part of the page change) */
export function syncThemeToPath(pathname: string) {
  path = pathname
  const theme = wanted()
  if (theme !== showing()) paint(theme)
}

// The device's own setting changed (night mode came on): follow it, unless a pick was made
media?.addEventListener('change', () => {
  if (pref === 'system') {
    const theme = wanted()
    if (theme !== showing()) swap(theme)
  }
})

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** What is on screen: 'light' or 'dark' */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, showing, () => 'dark')
}

/** What the person picked: 'light', 'dark' or 'system' */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, () => pref, () => 'system')
}

/** Reads the theme now (for code that draws its own picture, like a canvas, and has to be redrawn when it changes) */
export const currentTheme = (): Theme => showing()

/** Runs `fn` whenever the theme on screen changes */
export const onThemeChange = (fn: () => void) => subscribe(fn)

/** The ink colour at a given opacity, as a plain rgba() string (for animations that cannot take a CSS variable) */
export const inkAlpha = (alpha: number) => (showing() === 'light' ? `rgba(15,23,42,${alpha})` : `rgba(255,255,255,${alpha})`)
