import { useRef } from 'react'
import { Moon, Sun } from 'lucide-react'
import { setThemePref, useTheme } from '@/lib/theme'

/**
 * One button that flips between light and dark (the landing page's navbar). It shows the look that is on now: the sun turns away and
 * the moon turns in as the new theme spreads out from the button, and back.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useTheme()
  const button = useRef<HTMLButtonElement>(null)
  const next = theme === 'light' ? 'dark' : 'light'

  const flip = () => {
    const r = button.current?.getBoundingClientRect()
    setThemePref(next, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined)
  }

  const turn = 'absolute size-[1.15rem] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none'
  return (
    <button
      ref={button}
      type="button"
      onClick={flip}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`relative grid size-11 shrink-0 place-items-center rounded-full text-text outline-none transition-[background-color,scale] hover:bg-ink/10 focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-90 ${className}`}
    >
      <Sun className={`${turn} ${theme === 'light' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`} aria-hidden="true" />
      <Moon className={`${turn} ${theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0'}`} aria-hidden="true" />
    </button>
  )
}
