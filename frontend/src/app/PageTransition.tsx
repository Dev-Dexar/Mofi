import { ViewTransition, type ReactNode, type ViewTransitionClassPerType } from 'react'

/*
 * The slide plays only while a real navigation is under way. React also runs a page's enter animation when a
 * suspended page is revealed, and that is what a refresh does, so the CSS only applies under `html.navigating`.
 * Every client-side navigation goes through history.pushState/replaceState (or popstate for back/forward),
 * which is where the class is switched on; a refresh never does.
 */
if (typeof window !== 'undefined') {
  const root = document.documentElement
  let timer: number | undefined
  const start = () => {
    root.classList.add('navigating')
    window.clearTimeout(timer)
    timer = window.setTimeout(() => root.classList.remove('navigating'), 1500)
  }
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method]
    window.history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      // React Router stamps the current entry with replaceState on every page load, without a new address: not a navigation
      const url = args[2]
      if (url != null && new URL(String(url), window.location.href).href !== window.location.href) start()
      return original.apply(this, args)
    }
  }
  window.addEventListener('popstate', start)
}

/**
 * Page-to-page slide using React's <ViewTransition> (the browser's View Transitions API underneath).
 * React Router runs every navigation inside startTransition, so wrapping a route's page in this is all it
 * takes. Each page says which side it lives on: going landing → login, login slides in over the landing page
 * from the right; going back, it slides away to the right and the landing page comes back from the left.
 * The keyframes live in index.css. Browsers without View Transitions just switch pages instantly.
 *
 * Give every use its own `key`: all routes render this component in the same spot, so without a key React
 * sees one page updating rather than one page leaving and another arriving, and nothing animates.
 */
export default function PageTransition({
  children,
  side,
  exit,
}: {
  children: ReactNode
  side: 'left' | 'right'
  /** How the page leaves, when that depends on where it is going (keyed by transition type) */
  exit?: ViewTransitionClassPerType
}) {
  return (
    <ViewTransition enter={`slide-from-${side}`} exit={exit ?? `slide-to-${side}`} default="none">
      {children}
    </ViewTransition>
  )
}
