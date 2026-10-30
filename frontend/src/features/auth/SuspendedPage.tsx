import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2, Lock, LogOut, User } from 'lucide-react'
import Logo from '@/components/brand/Logo'
import { api } from '@/lib/api'
import type { MySuspension } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { CopyIcon } from '@/icons'
import { useCopy } from '@/features/referrals/components/shared'
import { recheckAccess, useAccess } from '@/app/ProtectedRoute'
import SignOutConfirm from './SignOutConfirm'
import SuspensionReason from './SuspensionReason'

const MAX_CHARS = 3000
const MIN_CHARS = 20
const POLL_MS = 30_000

// every character counts (letters, spaces, punctuation), the way the database counts them
const chars = (s: string) => [...s.trim()].length
const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

/**
 * /suspended: the one page a suspended account can use. Every protected route sends it here, and it sends anyone who is
 * not suspended (or not signed in) back out. One card: which suspension and where the appeal stands on the left, the single
 * appeal (or how it went) on the right. It checks every half minute and lets them back into the app by itself once the
 * suspension is lifted.
 */
export default function SuspendedPage() {
  const access = useAccess()
  const toast = useToast()
  const [data, setData] = useState<MySuspension | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [signOut, setSignOut] = useState(false)
  const [reason, setReason] = useState(false)

  const load = () =>
    api
      .mySuspension()
      .then((s) => (s.suspended ? setData(s) : recheckAccess())) // lifted: the fresh verdict sends them to the app
      .catch(() => {})

  useEffect(() => {
    load()
    const t = window.setInterval(load, POLL_MS)
    return () => window.clearInterval(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (access && (!access.user || access.needsMfa)) return <Navigate to="/login" replace />
  if (access && !access.suspended) return <Navigate to="/dashboard" replace />

  const send = async () => {
    if (sending) return
    setSending(true)
    try {
      await api.submitAppeal(text.trim())
      toast.success('Appeal sent')
      setText('')
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Your appeal could not be sent')
    } finally {
      setSending(false)
    }
  }

  const s = data?.suspension
  const appeal = data?.appeal

  return (
    <main className="flex min-h-dvh flex-col bg-base text-text">
      {/* one pill: the brand on the left, sign out on the right, lined up with the content below */}
      <header className="sticky top-0 z-10 mx-auto w-full max-w-5xl px-4 pt-4 sm:pt-5">
        <div className="flex h-14 items-center justify-between rounded-full border border-ink/10 bg-surface/90 pl-5 pr-2 backdrop-blur">
          <span className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="text-[17px] font-extrabold tracking-tight">
              MoFi <span className="text-primary">Life</span>
            </span>
          </span>
          <button
            type="button"
            onClick={() => setSignOut(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-rose-400 transition-[color,background-color,scale] hover:bg-rose-500/10 hover:text-rose-300 active:scale-95"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-start justify-center px-4 pb-10 pt-6 sm:pb-16 md:items-center">
        <div className="view-in grid w-full max-w-5xl gap-4 md:grid-cols-[2fr_3fr] md:gap-0 md:overflow-hidden md:rounded-[2rem] md:border md:border-ink/10 md:bg-surface">
        {/* What happened, and where the appeal stands */}
        <aside className="flex flex-col pt-1 md:border-r md:border-ink/[0.06] md:bg-ink/[0.02] md:p-10">
          <div className="flex items-center gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-rose-500/10 text-rose-400">
              <Lock className="size-5" strokeWidth={2.25} />
            </span>
            {/* the title itself opens "why": no separate button */}
            <h1 className="min-w-0 text-2xl font-black tracking-tight">
              <button
                type="button"
                onClick={() => setReason(true)}
                disabled={!s}
                aria-haspopup="dialog"
                className="rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:cursor-default"
              >
                Account suspended
              </button>
            </h1>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">Your balances are safe and keep earning.</p>

          <dl className="mt-4 divide-y divide-ink/[0.06] rounded-2xl border border-ink/10 bg-surface text-[15px] max-md:order-2 md:mt-6 md:border-ink/[0.06] md:bg-base/50">
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <dt className="text-muted">Reference</dt>
              <dd>{s ? <ReferenceCopy reference={s.reference} /> : <div className="sk h-4 w-28" />}</dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3.5">
              <dt className="text-muted">Since</dt>
              <dd className="font-semibold">{s ? day(s.since) : <div className="sk h-4 w-20" />}</dd>
            </div>
          </dl>

          {/* sits at the bottom of the panel, so it lines up with the appeal's actions on the right */}
          <div className="mt-7 max-md:order-1 md:mt-auto md:pt-9">
            <Steps data={data} />
          </div>
        </aside>

        {/* The one appeal */}
        <section className="min-w-0 rounded-3xl border border-ink/10 bg-surface p-5 sm:p-8 md:rounded-none md:border-0 md:bg-transparent md:p-10">
          {!data ? (
            <ComposerSkeleton />
          ) : !appeal ? (
            <Composer text={text} onText={setText} sending={sending} onSend={send} />
          ) : (
            <div className="flex h-full flex-col">
              <h2 className="text-xl font-bold tracking-tight">
                {appeal.status === 'pending' ? "We're reviewing your appeal" : 'Your appeal was declined'}
              </h2>
              <p className="mt-2 text-[15px] text-muted">
                {appeal.status === 'pending'
                  ? "We'll answer here. You can close this page."
                  : 'The suspension stays. Each suspension can be appealed once.'}
              </p>
              <Thread appeal={appeal} profile={data?.profile} />
            </div>
          )}
        </section>
      </div>

      </div>

      <SuspensionReason open={reason} onClose={() => setReason(false)} message={s?.message} />
      <SignOutConfirm open={signOut} onClose={() => setSignOut(false)} />
    </main>
  )
}

/** The suspension's reference; a click copies it (with a toast) so they can quote it */
function ReferenceCopy({ reference }: { reference: string }) {
  const copy = useCopy()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onCopy = async () => {
    if (!(await copy(reference, 'Reference'))) return
    setCopied(true) // the icon goes green for a moment
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy reference ${reference}`}
      className="group inline-flex items-center gap-2 font-mono text-sm font-semibold tracking-wide text-text"
    >
      {reference}
      <CopyIcon className={`size-4 transition-colors duration-200 ${copied ? 'text-primary' : 'text-muted group-hover:text-text'}`} />
    </button>
  )
}

type StepState = 'done' | 'current' | 'waiting' | 'upcoming' | 'stopped'

/** Suspended → Appeal → Decision, top to bottom, each dot joined to the next */
function Steps({ data }: { data: MySuspension | null }) {
  const appeal = data?.appeal
  const steps: { label: string; note: string; state: StepState }[] = [
    { label: 'Suspended', note: day(data?.suspension?.since), state: 'done' },
    appeal
      ? { label: 'Appeal sent', note: day(appeal.submitted_at), state: 'done' }
      : { label: 'Appeal', note: 'Not sent yet', state: 'current' },
    !appeal
      ? { label: 'Decision', note: 'After you appeal', state: 'upcoming' }
      : appeal.status === 'pending'
        ? { label: 'Decision', note: 'In review', state: 'waiting' }
        : { label: 'Declined', note: day(appeal.reviewed_at), state: 'stopped' },
  ]
  const dot: Record<StepState, string> = {
    done: 'bg-text',
    current: 'bg-primary ring-4 ring-primary/15',
    waiting: 'bg-amber-400 ring-4 ring-amber-400/15',
    upcoming: 'border border-ink/20 bg-surface',
    stopped: 'bg-rose-400 ring-4 ring-rose-400/15',
  }

  const bar: Record<StepState, string> = {
    done: 'bg-text/80',
    current: 'bg-primary',
    waiting: 'bg-amber-400',
    upcoming: 'bg-ink/10',
    stopped: 'bg-rose-400',
  }

  // phones: three bars across, so the progress takes a few lines instead of a list
  return (
    <>
      <ol className="grid grid-cols-3 gap-2 md:hidden" aria-label="Appeal progress">
        {steps.map((step, i) => {
          const wait = !data && i > 0
          return (
            <li key={i} aria-current={step.state === 'current' || step.state === 'waiting' ? 'step' : undefined}>
              <span className={`block h-1 rounded-full ${wait ? bar.upcoming : bar[step.state]}`} />
              <p className={`mt-2.5 text-[13px] font-semibold leading-snug ${step.state === 'upcoming' ? 'text-muted' : 'text-text'}`}>
                {wait ? <span className="sk inline-block h-3 w-14 align-middle" /> : step.label}
              </p>
              <p className="mt-0.5 min-h-4 text-xs text-muted">{data ? step.note : <span className="sk inline-block h-2.5 w-12 align-middle" />}</p>
            </li>
          )
        })}
      </ol>
    <ol className="hidden border-t border-ink/[0.06] pt-7 md:block" aria-label="Appeal progress">
      {steps.map((step, i) => {
        const last = i === steps.length - 1
        // unknown until it loads, apart from the first, which is always true: grey dots and bars of the same height as the text
        const wait = !data && i > 0
        return (
          <li key={i} className="flex gap-3.5" aria-current={step.state === 'current' || step.state === 'waiting' ? 'step' : undefined}>
            {/* the dot, and the line down to the next one */}
            <div className="flex w-5 shrink-0 flex-col items-center pt-[5px]">
              <span className={`size-3 shrink-0 rounded-full ${wait ? dot.upcoming : dot[step.state]}`} />
              {!last && <span aria-hidden="true" className={`my-1.5 w-px flex-1 ${step.state === 'done' ? 'bg-ink/30' : 'bg-ink/10'}`} />}
            </div>
            <div className={`min-w-0 ${last ? '' : 'pb-4'}`}>
              <p className={`text-[15px] font-semibold leading-snug ${step.state === 'upcoming' ? 'text-muted' : 'text-text'}`}>
                {wait ? <span className="sk inline-block h-3.5 w-24 align-middle" /> : step.label}
              </p>
              <p className="mt-0.5 min-h-4 text-xs text-muted">{data ? step.note : <span className="sk inline-block h-2.5 w-20 align-middle" />}</p>
            </div>
          </li>
        )
      })}
    </ol>
    </>
  )
}

/** The appeal box: one message per suspension, 20 to 3,000 characters */
function Composer({ text, onText, sending, onSend }: { text: string; onText: (t: string) => void; sending: boolean; onSend: () => void }) {
  const count = chars(text)
  const over = count > MAX_CHARS
  const ready = count >= MIN_CHARS && !over

  return (
    <div className="flex h-full flex-col">
      <h2 className="text-xl font-bold tracking-tight">Request a review</h2>
      <p className="mt-2 text-[15px] text-muted">Tell us what happened. You get one appeal.</p>

      <label htmlFor="appeal" className="sr-only">
        Your appeal
      </label>
      <textarea
        id="appeal"
        value={text}
        onChange={(e) => onText(e.target.value)}
        maxLength={10000}
        placeholder="Write your appeal…"
        className="mt-5 min-h-52 w-full flex-1 resize-none rounded-2xl border border-ink/10 bg-base px-4 py-3.5 sm:mt-6 sm:min-h-80 sm:px-5 sm:py-4 text-[15px] leading-relaxed text-text outline-none transition-colors placeholder:text-muted/50 focus:border-ink/25"
      />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span className={`text-[13px] tabular-nums ${over ? 'font-semibold text-rose-400' : 'text-muted'}`}>
          {count.toLocaleString('en-US')} / {MAX_CHARS.toLocaleString('en-US')} characters
        </span>
        <button
          type="button"
          onClick={onSend}
          disabled={!ready || sending}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm sm:h-11 font-bold text-[color:var(--color-base)] transition-[opacity,scale,background-color,color] hover:opacity-90 active:scale-95 disabled:bg-ink/[0.06] disabled:text-muted disabled:hover:opacity-100 disabled:active:scale-100"
        >
          {sending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

/** The appeal box while the suspension loads: the same lines, spacing and heights, so nothing moves when it arrives */
function ComposerSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-hidden="true">
      <h2 className="text-xl font-bold tracking-tight">
        <span className="sk inline-block h-5 w-44 align-middle" />
      </h2>
      <p className="mt-2 text-[15px]">
        <span className="sk inline-block h-3.5 w-64 max-w-full align-middle" />
      </p>
      <div className="sk mt-5 min-h-52 w-full flex-1 !rounded-2xl sm:mt-6 sm:min-h-80" />
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span className="sk h-3.5 w-28" />
        <span className="sk h-12 w-full sm:h-11 sm:w-[5.5rem]" />
      </div>
    </div>
  )
}

type Appeal = NonNullable<MySuspension['appeal']>

/** Their own photo (falling back to their initial, then a plain person) beside what they wrote */
function UserAvatar({ profile }: { profile: MySuspension['profile'] }) {
  const [broken, setBroken] = useState(false)
  const initial = (profile?.full_name ?? '').trim().charAt(0).toUpperCase()
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-ink/[0.06] text-sm font-bold text-primary">
      {profile?.avatar_url && !broken ? (
        <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-full object-cover" />
      ) : initial ? (
        initial
      ) : (
        <User className="size-4 text-muted" />
      )}
    </span>
  )
}

/** The appeal as a short conversation: what they sent, then our answer (or that one is on its way) */
function Thread({ appeal, profile }: { appeal: Appeal; profile: MySuspension['profile'] }) {
  const pending = appeal.status === 'pending'
  return (
    <ol className="mt-8 space-y-6 border-t border-ink/[0.06] pt-8">
      <li className="flex gap-3.5">
<UserAvatar profile={profile} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold">You</span>
            <span className="text-xs text-muted">
              {day(appeal.submitted_at)} · {chars(appeal.message).toLocaleString('en-US')} characters
            </span>
          </p>
          <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-line rounded-2xl rounded-tl-md bg-primary/15 px-4 py-3.5 text-[15px] leading-relaxed text-text">
            {appeal.message}
          </p>
        </div>
      </li>

      <li className="flex flex-row-reverse gap-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10">
          <Logo className="size-4" />
        </span>
        <div className="min-w-0 flex-1 text-right">
          <p className="flex flex-wrap items-baseline justify-end gap-x-2 text-sm">
            <span className="font-semibold">MoFi team</span>
            <span className="text-xs text-muted">{pending ? 'Reply on its way' : day(appeal.reviewed_at)}</span>
          </p>
          {pending ? (
            // the reply's shape while it is awaited: a solid bubble of two lines, the same as the answer will be (not w-fit: the lines' widths are relative)
            <div className="mt-2 ml-auto w-64 max-w-full space-y-2.5 rounded-2xl rounded-tr-md bg-raised px-4 py-4 text-left" aria-hidden="true">
              <div className="sk h-3 w-full" />
              <div className="sk h-3 w-3/5" />
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-line ml-auto w-fit max-w-full rounded-2xl rounded-tr-md bg-rose-500/15 text-left px-4 py-3.5 text-[15px] leading-relaxed text-text">
              {appeal.response || 'Your appeal was reviewed and the suspension stays in place.'}
            </p>
          )}
        </div>
      </li>
    </ol>
  )
}
