import type { ComponentType } from 'react'

/** The building blocks of the settings windows: inset groups of rows, colour-tiled icons, a switch. */

const TONES = {
  green: 'from-[#34d399] to-[#059669]',
  blue: 'from-[#60a5fa] to-[#2563eb]',
  amber: 'from-[#fbbf24] to-[#d97706]',
  violet: 'from-[#a78bfa] to-[#6d28d9]',
  slate: 'from-[#94a3b8] to-[#475569]',
  white: 'from-white to-[#e2e8f0]',
} as const

type Tone = keyof typeof TONES

/** An icon on a small coloured squircle, the way the system settings show them */
export function Tile({ icon: Icon, tone, size = 'md' }: { icon: ComponentType<{ className?: string }>; tone: Tone; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <span
      className={`grid shrink-0 place-items-center bg-gradient-to-b shadow-[inset_0_0.5px_0_rgba(255,255,255,0.35),0_1px_2px_color-mix(in_srgb,var(--color-shade)_35%,transparent)] ${TONES[tone]} ${
        size === 'xs' ? 'size-6 rounded-[0.4rem]' : size === 'sm' ? 'size-7 rounded-[0.5rem]' : 'size-8 rounded-[0.55rem]'
      } ${tone === 'white' ? 'text-slate-900' : 'text-white'}`}
    >
      <Icon className={size === 'xs' ? 'size-3.5' : size === 'sm' ? 'size-4' : 'size-[1.125rem]'} />
    </span>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[1.625rem] w-[2.625rem] shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-ink/15'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-[1.375rem] rounded-full bg-white shadow-[0_1px_3px_color-mix(in_srgb,var(--color-shade)_40%,transparent)] transition-transform duration-200 ease-[cubic-bezier(0.3,1.4,0.5,1)] ${
          checked ? 'translate-x-[1rem]' : ''
        }`}
      />
    </button>
  )
}

export const field =
  'h-10 w-full min-w-0 rounded-xl border border-ink/10 bg-base/70 px-3 text-sm text-text transition-colors placeholder:text-muted/50 hover:border-ink/20 focus:border-primary focus:outline-none disabled:opacity-60'
