import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { EyeIcon, GoogleMark } from '@/icons'
import { DemoPointer, loop as demoLoop, usePlaying, type DemoClick } from './DemoPointer'
import Logo from '@/components/brand/Logo'

/** The real sign-up page in miniature (features/auth/LoginPage.tsx): page on the left, the panel on the right with the
 *  logo in its corner and "Create account" selected. It plays an 11-second loop (DEMO_MS): a pointer clicks into each field of the email form, which types itself (name, email, password, each
 *  field lighting up while it is typed), and the pointer presses Create account. The keyframes (signup-*) live in index.css; with reduced motion it shows the
 *  filled-in form, standing still. Secondary bits (Back pill, Sign in tab, small print) are skeleton bars. */
const SIGNUP_FIELDS = [
  { id: 'name', label: 'Full name', value: 'Alex Morgan' },
  { id: 'email', label: 'Email address', value: 'alex@gmail.com' },
  { id: 'pass', label: 'Password', value: '••••••••••' },
] as const

// One loop for the whole demo; every CSS keyframe and the pointer use fractions of it, so changing this keeps them in sync
const DEMO_MS = 11000
const loop = (name: string) => demoLoop(name, DEMO_MS)

/*
 * Sign-up timeline (fraction of the loop): glide in and click Full name (12%), then Email (29.5%) and Password (47.5%),
 * each just before it is typed, then press Create account (70%, with the button), drift off and fade (80-88%).
 */
const SIGNUP_CLICKS: DemoClick[] = [
  { target: 'name', fx: 0.8, fy: 0.62, at: 0.12, leave: 0.27 },
  { target: 'email', fx: 0.8, fy: 0.62, at: 0.295, leave: 0.455 },
  { target: 'pass', fx: 0.62, fy: 0.62, at: 0.475, leave: 0.6 },
  { target: 'submit', fx: 0.64, fy: 0.62, at: 0.7, leave: 0.8, approach: 0.03 },
]

export default function SignUpDemo() {
  const outer = useRef<HTMLDivElement>(null)
  const form = useRef<HTMLDivElement>(null)
  const sync = useRef<HTMLSpanElement>(null)
  const playing = usePlaying(outer)
  return (
    <div
      ref={outer}
      className={`@container relative flex size-full justify-end bg-base p-2.5 text-[10px] leading-none ${playing ? '' : '[&_*]:[animation-play-state:paused]'}`}
    >
      {/* Back pill on the page (no room for it when the window is phone-sized) */}
      <span className="absolute left-2.5 top-2.5 hidden h-5 items-center gap-1 rounded-full border border-ink/10 px-2 @md:flex">
        <span className="h-px w-2 bg-ink/40" />
        <span className="h-1 w-5 rounded-full bg-ink/15" />
      </span>

      {/* the panel: half the window like the real page, or all of it when the window is phone-sized */}
      <div className="relative flex h-full w-full flex-col rounded-xl border border-ink/10 bg-ink/[0.02] px-4 @md:w-1/2">
        <Logo className="absolute left-2.5 top-2.5 size-4" />

        <div ref={form} className="relative m-auto w-full max-w-[12.5rem] space-y-1.5">
          {/* tabs, Create account selected */}
          <div className="relative mb-3 grid h-6 grid-cols-2 rounded-full border border-ink/10 p-0.5 text-[9px] font-semibold">
            <span className="absolute inset-y-0.5 right-0.5 w-[calc(50%-0.125rem)] rounded-full bg-ink/10" />
            <span className="relative m-auto h-1 w-7 rounded-full bg-ink/15" />
            <span className="relative m-auto whitespace-nowrap text-text">Create account</span>
          </div>

          {/* Google */}
          <div className="relative flex h-7 items-center justify-center gap-1.5 rounded-full bg-white font-semibold">
            <GoogleMark className="size-3" />
            <span className="text-slate-900">Continue with Google</span>
          </div>

          {/* or */}
          <div className="flex items-center gap-2 py-1 text-[9px] text-muted">
            <span className="h-px flex-1 bg-ink/10" />
            or
            <span className="h-px flex-1 bg-ink/10" />
          </div>

          {/* full name, email, password: each lights up while it is being typed */}
          {SIGNUP_FIELDS.map((f) => (
            <div
              key={f.id}
              data-demo={f.id}
              className="relative flex h-7 items-center justify-between rounded-full border border-ink/10 px-3"
              style={loop(`signup-focus-${f.id}`)}
            >
              <span className="absolute left-3 text-muted opacity-0" style={loop(`signup-hint-${f.id}`)}>
                {f.label}
              </span>
              <span className={`whitespace-nowrap text-text ${f.id === 'pass' ? 'tracking-[0.15em]' : ''}`} style={loop(`signup-type-${f.id}`)}>
                {f.value}
              </span>
              {f.id === 'pass' && <EyeIcon open={false} className="size-3 shrink-0 text-muted" />}
            </div>
          ))}

          {/* Create account */}
          <div
            data-demo="submit"
            className="relative flex h-7 items-center justify-center gap-1 rounded-full bg-primary font-bold text-[color:var(--color-base)]"
            style={loop('signup-submit')}
          >
            <span ref={sync} className="pointer-events-none absolute -inset-[4px] rounded-full border-2 border-primary/60 opacity-0" style={loop('signup-submit-ring')} />
            Create account
            <ArrowRight className="size-3" aria-hidden="true" />
          </div>

          {/* terms */}
          <span className="mx-auto !mt-3 block h-1 w-4/5 rounded-full bg-ink/[0.07]" />

          <DemoPointer root={form} sync={sync} playing={playing} clicks={SIGNUP_CLICKS} duration={DEMO_MS} />
        </div>
      </div>
    </div>
  )
}
