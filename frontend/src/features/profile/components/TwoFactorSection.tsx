import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { InfoIcon, KeyIcon, PhoneIcon, QrIcon } from '@/icons'
import LockAnimation, { lockClickSeconds, preloadLockAnimation } from './LockAnimation'
import OtpInput from '@/features/auth/components/OtpInput'
import { Switch, Tile } from '@/components/ui/SettingsUI'
import { OTP_LENGTH, beginTotpSetup, cancelTotpSetup, disableTotp, finishTotpSetup } from '@/lib/auth'
import { useToast } from '@/context/ToastContext'

/** The two-factor line in the profile: a switch, with a note on what it does. Flipping it opens TwoFactorView. */
export default function TwoFactorSection({ factorId, onToggle }: { factorId: string | null | undefined; onToggle: (mode: 'enable' | 'disable') => void }) {
  const [tip, setTip] = useState(false)
  return (
    <div className="py-3">
      <div className="flex h-6 items-center justify-between gap-3">
        <span className="group relative flex items-center gap-1.5 text-muted">
          <span>Two-factor</span>
          <button
            type="button"
            aria-label="What is two-factor authentication?"
            aria-describedby="mfa-tip"
            aria-expanded={tip}
            onClick={() => setTip((v) => !v)}
            onBlur={() => setTip(false)}
            onKeyDown={(e) => e.key === 'Escape' && setTip(false)}
            className="grid size-4 place-items-center rounded-full text-muted/70 outline-none transition-colors hover:text-text focus-visible:text-text"
          >
            <InfoIcon className="size-4" />
          </button>
          <span
            id="mfa-tip"
            role="tooltip"
            className={`pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-56 rounded-xl border border-ink/10 bg-popover px-3 py-2.5 text-xs text-text/90 transition-[opacity,transform,scale,translate] duration-200 group-hover:translate-y-0 group-hover:opacity-100 ${
              tip ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
            }`}
          >
            <span className="block text-muted">Two steps to sign in</span>
            <span className="mt-2 flex items-center gap-2.5">
              <Tile icon={KeyIcon} tone="amber" size="xs" />
              Your password
            </span>
            <span className="mt-1.5 flex items-center gap-2.5">
              <Tile icon={PhoneIcon} tone="green" size="xs" />A 6-digit code from your app
            </span>
          </span>
        </span>
        {factorId === undefined ? (
          <span className="h-[1.625rem] w-[2.625rem] shrink-0 animate-pulse rounded-full bg-ink/[0.07]" aria-hidden="true" />
        ) : (
          <Switch label="Two-factor authentication" checked={!!factorId} onChange={() => onToggle(factorId ? 'disable' : 'enable')} />
        )}
      </div>
    </div>
  )
}

type Setup = { factorId: string; qr: string; secret: string }

const STEPS = [
  { icon: PhoneIcon, tone: 'blue', text: 'Open an authenticator app' },
  { icon: QrIcon, tone: 'amber', text: 'Scan this QR code' },
  { icon: KeyIcon, tone: 'green', text: 'Enter the 6-digit code it shows' },
] as const

const AUTO_RETURN_MS = 4200

const bone = 'animate-pulse bg-ink/[0.07]'

/** The whole profile gives way to this while two-factor is being switched on or off. */
export function TwoFactorView({
  mode,
  factorId,
  onCancel,
  onChanged,
  onDone,
}: {
  mode: 'enable' | 'disable'
  factorId: string | null
  onCancel: () => void
  /** the new state, as soon as it is true */
  onChanged: (on: boolean, factorId: string | null) => void
  /** the lock animation has played: time to go back */
  onDone: () => void
}) {
  const toast = useToast()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'on' | 'off' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Starts the setup once, and drops it again if the view is left before the code is accepted
  useEffect(() => preloadLockAnimation(), []) // so the lock is ready the moment the code is accepted
  const started = useRef(false)
  const pending = useRef<string | null>(null)
  useEffect(() => {
    if (mode === 'enable' && !started.current) {
      started.current = true
      beginTotpSetup()
        .then((s) => {
          pending.current = s.factorId
          setSetup(s)
        })
        .catch(() => {
          toast.error('Could not start two-factor setup. Please try again.')
          onCancel()
        })
    }
    return () => {
      if (pending.current) void cancelTotpSetup(pending.current).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== OTP_LENGTH || busy) return
    try {
      setBusy(true)
      setError(null)
      if (mode === 'enable' && setup) {
        await finishTotpSetup(setup.factorId, code)
        pending.current = null // it is a real factor now
        onChanged(true, setup.factorId)
        setResult('on')
      } else if (mode === 'disable' && factorId) {
        await disableTotp(factorId, code)
        onChanged(false, null)
        setResult('off')
      }
    } catch (err) {
      const status = (err as { status?: number })?.status
      setCode('')
      setError(status === 429 ? 'Too many tries. Wait a few minutes and try again.' : 'Incorrect or expired code. Use the current one from your app.')
    } finally {
      setBusy(false)
    }
  }

  // Once it has worked: the lock plays its animation, then the window returns to the profile
  useEffect(() => {
    if (!result) return
    const t = window.setTimeout(onDone, AUTO_RETURN_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const enabling = mode === 'enable'
  const ready = enabling ? !!setup : true

  if (result) {
    const on = result === 'on'
    const at = lockClickSeconds(result) + 0.15 // the Done button arrives just after the lock moves
    return (
      <div className="flex flex-1 flex-col text-center" role="status">
        <div className="flex flex-1 flex-col items-center justify-center">
          <LockAnimation mode={result} className="size-72" />
        </div>
        <div className="view-in" style={{ animationDelay: `${at + 0.3}s` }}>
          <button
            type="button"
            onClick={onDone}
            className={`flex h-11 w-full items-center justify-center rounded-full text-sm font-bold transition-transform active:scale-95 ${
              on ? 'bg-primary text-[color:var(--color-base)]' : 'bg-ink/10 text-text'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col items-center text-center">
      <div className={`flex w-full flex-col items-center ${enabling ? '' : 'my-auto'}`}>
        {enabling && (
          <div className="w-full rounded-2xl border border-ink/[0.06] bg-ink/[0.03] p-4 text-left">
            <div className="flex items-center gap-4">
              {setup ? (
                <img src={setup.qr} alt="QR code to add MoFi Life to your authenticator app" className="size-36 shrink-0 rounded-xl bg-white p-2" />
              ) : (
                <span className={`block size-36 shrink-0 rounded-xl ${bone}`} aria-hidden="true" />
              )}
              <ol className="min-w-0 flex-1 space-y-4 text-sm leading-snug text-text">
                {STEPS.map(({ icon, tone, text }) => (
                  <li key={text} className="flex items-center gap-3">
                    <Tile icon={icon} tone={tone} size="sm" />
                    {text}
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-4 border-t border-ink/[0.06] pt-3.5">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted/80">Or enter this key</p>
              {setup ? (
                <p className="mt-1.5 break-all select-all font-mono text-sm text-text">{setup.secret}</p>
              ) : (
                <span className={`mt-1.5 block h-3.5 w-full rounded-full ${bone}`} aria-hidden="true" />
              )}
            </div>
          </div>
        )}
        {!enabling && <p className="text-sm text-muted">Enter the current code from your app.</p>}

        <div className="mt-4 w-full">
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v)
              setError(null)
            }}
            invalid={!!error}
            locked={busy || !ready}
            describedBy="mfa-error"
          />
        </div>
      </div>

      <p id="mfa-error" role="alert" className="mb-2 mt-auto min-h-4 pt-3 text-center text-xs text-danger">
        {error}
      </p>
      <button
        type="submit"
        disabled={busy || !ready || code.length !== OTP_LENGTH}
        className={`flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition-[transform,background-color,color,scale,translate] active:scale-95 disabled:bg-ink/10 disabled:text-muted disabled:active:scale-100 ${
          enabling ? 'bg-primary text-[color:var(--color-base)]' : 'bg-danger text-white'
        }`}
      >
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {enabling ? 'Turn on' : 'Turn off'}
      </button>
    </form>
  )
}
