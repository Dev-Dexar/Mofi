import { Monitor, Moon, Sun } from 'lucide-react'
import { setThemePref, useThemePref, type ThemePref } from '@/lib/theme'

const OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'Auto', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
]

/**
 * The profile's Appearance line: Auto (the device's own light/dark setting), Light or Dark.
 *
 * Kept deliberately plain. Every size is in whole pixels, each icon is pinned a whole number of pixels from its option's left edge, and the
 * selection is each option's own background fading in and out: nothing here slides or sits on a layer of its own, so nothing under it can be
 * redrawn a hair differently when it is tapped. The theme itself blends in place ('fade'), not through a snapshot of the page.
 */
export default function ThemeSetting() {
  const pref = useThemePref()
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex w-[196px] shrink-0 rounded-full bg-ink/[0.06] p-[2px]">
      {OPTIONS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={pref === id}
          onClick={() => setThemePref(id, undefined, 'fade')}
          className={`flex h-[32px] w-[64px] items-center justify-start gap-[5px] rounded-full pl-[10px] text-[12px] font-semibold leading-none outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-primary/60 ${
            pref === id ? 'bg-ink/10 text-text' : 'text-muted hover:text-text'
          }`}
        >
          <Icon className="size-[14px] shrink-0" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}
