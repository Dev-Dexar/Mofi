import OtpInput from './components/OtpInput'
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { useToast, useToastAnchor } from '@/context/ToastContext'
import { Collapse } from '@/components/ui/Collapse'
import Turnstile, { TURNSTILE_SITE_KEY, type TurnstileHandle } from './components/Turnstile'
import LegalWindow from '@/components/legal/LegalWindow'
import LoginStage from './components/LoginStage'
import { EyeIcon, GoogleMark } from '@/icons'
import { LEGAL_DOCS, type LegalDoc } from '@/components/legal/legal'
import {
  EmailNotAllowedError,
  EmailNotConfirmedError,
  CAPTCHA_MESSAGE,
  InvalidCodeError,
  InvalidCredentialsError,
  TooManyAttemptsError,
  isCaptchaError,
  NAME_MAX,
  OTP_LENGTH,
  PASSWORD_MAX,
  PASSWORD_MIN,
  fullNameProblem,
  getCurrentUser,
  mfaRequirement,
  signOut,
  cleanReferralCode,
  rememberReferral,
  EmailRateLimitedError,
  verifyMfaCode,
  passwordProblem,
  resendConfirmation,
  sendPasswordReset,
  signInWithGoogle,
  signInWithPassword,
  signUpWithEmail,
  updatePassword,
  verifyEmailCode,
  verifyResetCode,
} from '@/lib/auth'

// Each block comes into focus just after the one above it, starting once the page has slid in (PageTransition)
const rise = (i: number): CSSProperties => ({ animationDelay: `${300 + i * 56}ms` })

// One height and one shape for every control, so the column reads as a single rhythm
const control = 'h-12 w-full rounded-full px-6 text-[0.9375rem]'
const inputClass = `${control} border border-ink/10 bg-transparent text-text placeholder:text-muted/70 transition-colors hover:border-ink/20 focus:border-primary focus:outline-none`
const linkClass =
  'text-text/80 underline underline-offset-2 decoration-ink/20 transition-colors hover:text-text hover:decoration-ink/60'

// The logo, cut clean through the panel's top-left corner: a mask that is solid everywhere except the logo's shape
const HOLE = { x: 28, y: 28, size: 44 }
const holeMask = `url(/logo.svg) no-repeat ${HOLE.x}px ${HOLE.y}px / ${HOLE.size}px ${HOLE.size}px, linear-gradient(#000 0 0)`
const panelMask: CSSProperties = {
  mask: holeMask,
  maskComposite: 'exclude',
  WebkitMask: holeMask,
  WebkitMaskComposite: 'xor',
}


type Mode = 'signin' | 'signup'
type Notice = { kind: 'confirm' | 'reset'; email: string } | { kind: 'mfa'; email: string; factorId: string }

export default function LoginPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const panel = useRef<HTMLDivElement>(null)
  useToastAnchor(panel) // toasts centre over the form panel, not the whole window
  const [searchParams, setSearchParams] = useSearchParams()
  const refCode = cleanReferralCode(searchParams.get('ref'))
  // /login?mode=signup or ?mode=signin (and &ref=CODE). With no mode, a referral link opens sign-up, anything else sign-in.
  const modeParam = searchParams.get('mode')
  const mode: Mode = modeParam === 'signup' || modeParam === 'signin' ? modeParam : refCode ? 'signup' : 'signin'

  const [forgot, setForgot] = useState(false) // the "reset your password" form, reached from sign-in
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false) // sign-in refused until the email is confirmed
  const [notice, setNotice] = useState<Notice | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [code, setCode] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [codeVerified, setCodeVerified] = useState(false) // reset: code accepted, now choosing the new password
  const [legal, setLegal] = useState<{ id: LegalDoc['id']; source: HTMLElement } | null>(null)

  useEffect(() => {
    rememberReferral(refCode)
  }, [refCode])

  // Already signed in: nothing to do here
  useEffect(() => {
    getCurrentUser().then(async (user) => {
      if (!user) return
      // A password-only session on an account with 2FA: finish the second step instead of going in
      const pending = await mfaRequirement().catch(() => null)
      if (pending) setNotice({ kind: 'mfa', email: user.email ?? '', factorId: pending.factorId })
      else navigate('/dashboard', { replace: true })
    })
  }, [navigate])

  // Coming back with the browser's back button after Google leaves the page frozen in "connecting"
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => e.persisted && setGoogleLoading(false)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  // Resending an email is locked for a minute
  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  // Submit by itself as soon as the last digit lands
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (notice && !codeVerified && code.length === OTP_LENGTH && !busy) formRef.current?.requestSubmit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  // Cloudflare check: every request that Supabase protects carries its own single-use token
  const captcha = useRef<TurnstileHandle>(null)
  const [human, setHuman] = useState(!TURNSTILE_SITE_KEY) // the check has passed; nothing to wait for when Turnstile is off
  const secured = async <T,>(run: (token?: string) => Promise<T>) => {
    try {
      return await run(await captcha.current?.getToken())
    } finally {
      captcha.current?.reset()
    }
  }

  // Back to the first screen, details kept, to ask for a fresh code
  const backToForm = () => {
    if (!notice) return
    if (notice.kind === 'mfa') {
      void signOut().catch(() => {}) // the password-only session is dropped; they start again
      setNotice(null)
      setCode('')
      setPassword('')
      setError(null)
      return
    }
    setNotice(null)
    setCode('')
    setError(null)
    if (notice.kind === 'reset') setForgot(true)
    else if (mode === 'signin') setUnconfirmed(true) // shows the Resend link under the form
  }

  const fail = (message: string) => {
    setError(message) // marks the fields red; the message itself goes up as a toast
    toast.error(message)
    return false
  }

  const handleGoogle = async () => {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle(refCode || undefined)
    } catch {
      setGoogleLoading(false)
      setError('Could not reach Google. Please try again.')
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setError(null)
    setUnconfirmed(false)

    if (notice) {
      setBusy(true)
      try {
        if (notice.kind === 'mfa') {
          await verifyMfaCode(notice.factorId, code)
          navigate('/dashboard', { replace: true })
        } else if (notice.kind === 'confirm') {
          await verifyEmailCode(notice.email, code)
          navigate('/dashboard', { replace: true })
        } else if (!codeVerified) {
          await verifyResetCode(notice.email, code)
          setCodeVerified(true)
        } else {
          const problem = passwordProblem(password, notice.email)
          if (problem) return void fail(problem)
          if (password !== confirmPassword) return void fail('Passwords do not match.')
          await updatePassword(password)
          toast.success('Password updated.', 'password-updated')
          navigate('/dashboard', { replace: true })
        }
      } catch (err) {
        const c = (err as { code?: string })?.code
        if (codeVerified) {
          if (c === 'same_password') {
            // They proved the inbox with the code and are signed in already; nothing needs to change
            toast.info('That is already your current password. You are signed in.')
            navigate('/dashboard', { replace: true })
          } else if (c === 'weak_password') fail('That password is too easy to guess. Try another.')
          else fail('Could not update your password. Please start again.')
        } else if (err instanceof TooManyAttemptsError) {
          // The API counts per email and per caller; either one reaching its limit lands here
          const mins = Math.max(1, Math.ceil(err.retryAfterSeconds / 60))
          toast.error(`Too many incorrect codes. Try again in ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`)
          backToForm()
        } else if (err instanceof InvalidCodeError) {
          setCode('')
          if (err.attemptsLeft <= 0) {
            toast.error('Too many incorrect codes. Try again in 30 minutes.')
            backToForm()
          } else {
            fail(`Incorrect or expired code. ${err.attemptsLeft} ${err.attemptsLeft === 1 ? 'try' : 'tries'} left.`)
          }
        } else {
          setCode('')
          fail('Could not check the code. Please try again.')
        }
      } finally {
        setBusy(false)
      }
      return
    }

    if (forgot) {
      setBusy(true)
      try {
        await secured((token) => sendPasswordReset(email, token))
        setNotice({ kind: 'reset', email: email.trim().toLowerCase() })
        setCooldown(60)
      } catch (err) {
        fail(isCaptchaError(err) ? CAPTCHA_MESSAGE : 'Could not send the code. Check the address and try again.')
      } finally {
        setBusy(false)
      }
      return
    }

    if (mode === 'signup') {
      const problem = fullNameProblem(fullName) || passwordProblem(password, email)
      if (problem) return void fail(problem)
      setBusy(true)
      try {
        const result = await secured((captchaToken) =>
          signUpWithEmail({ email, password, fullName, referralCode: refCode || undefined, captchaToken }),
        )
        if (result === 'signed-in') return void navigate('/dashboard', { replace: true })
        setNotice({ kind: 'confirm', email: email.trim().toLowerCase() })
        setCooldown(60)
      } catch (err) {
        if (isCaptchaError(err)) fail(CAPTCHA_MESSAGE)
        else if (err instanceof EmailRateLimitedError) {
          // They left the code screen and came back within the minute: the first code is still good, so go back to it
          setCode('')
          setNotice({ kind: 'confirm', email: email.trim().toLowerCase() })
          setCooldown(err.retryAfterSeconds)
          toast.info('We already sent you a code. Check your inbox (and spam), or ask for a new one when the timer ends.')
        } else if (err instanceof EmailNotAllowedError) fail('Temporary email addresses are not allowed. Use your own email.')
        else if (err instanceof Error && err.message === 'invalid_email') fail('Enter a valid email address.')
        else if ((err as { code?: string })?.code === 'weak_password') fail('That password is too easy to guess. Try another.')
        else fail('Could not create your account. Please try again.')
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      await secured((token) => signInWithPassword(email, password, token))
      const pending = await mfaRequirement()
      if (pending) {
        // Right password, but 2FA is on: ask for the authenticator code before going in
        setCode('')
        setNotice({ kind: 'mfa', email: email.trim().toLowerCase(), factorId: pending.factorId })
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (isCaptchaError(err)) {
        fail(CAPTCHA_MESSAGE)
      } else if (err instanceof EmailNotConfirmedError) {
        setUnconfirmed(true)
        fail('Confirm your email first. We can send the link again.')
      } else if (err instanceof InvalidCredentialsError) {
        fail('Incorrect email or password.')
      } else {
        fail('Could not sign you in. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  // Sign-in said the address is not confirmed yet: send a fresh code and ask for it
  const resend = async (address: string) => {
    setError(null)
    setBusy(true)
    try {
      await secured((token) => resendConfirmation(address, token))
      setCooldown(60)
      setCode('')
      setNotice({ kind: 'confirm', email: address.trim().toLowerCase() })
    } catch (err) {
      if (err instanceof EmailRateLimitedError) {
        setCooldown(err.retryAfterSeconds)
        setCode('')
        setNotice({ kind: 'confirm', email: address.trim().toLowerCase() })
        toast.info('We already sent you a code. Check your inbox (and spam), or ask for a new one when the timer ends.')
        return
      }
      fail(isCaptchaError(err) ? CAPTCHA_MESSAGE : 'Could not send the email. Please try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  const selectMode = (next: Mode) => {
    setForgot(false)
    setError(null)
    setUnconfirmed(false)
    if (next === mode) return
    const params = new URLSearchParams(searchParams)
    params.set('mode', next)
    setSearchParams(params, { replace: true })
  }

  const legalLink = (id: LegalDoc['id']) => (
    <button
      type="button"
      onClick={(e) => setLegal({ id, source: e.currentTarget })}
      className="text-text/70 underline underline-offset-2 decoration-ink/20 transition-colors hover:text-text hover:decoration-ink/60"
    >
      {LEGAL_DOCS[id].title}
    </button>
  )

  const heading = forgot ? 'Reset password' : mode === 'signup' ? 'Start earning daily' : 'Welcome back'

  const submitLabel = forgot ? 'Send code' : mode === 'signup' ? 'Create account' : 'Sign in'
  const canSubmit =
    !!email.trim() && (forgot || !!password) && (forgot || mode === 'signin' || !!fullName.trim())

  return (
    <main className="relative flex min-h-dvh flex-col bg-base p-5 text-text lg:flex-row lg:justify-end">
      <Link
        to="/"
        className="group relative z-10 mb-4 inline-flex shrink-0 self-start items-center lg:absolute lg:left-5 lg:top-5 lg:mb-0 gap-2 rounded-full border border-ink/10 py-2 pl-3.5 pr-5 text-sm font-medium text-text/80 transition-[transform,color] duration-200 hover:text-text active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ArrowLeft className="size-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-1" />
        Back
      </Link>

      {/* a faint grid behind the whole page, and on the open side a picture that changes in squares; the pointer over it brings up the logo (desktop width and up) */}
      <LoginStage />

      {/* 20px of page all round; from desktop width the panel is 40% of the screen, full height, on the right */}
      <div ref={panel} className="relative flex w-full flex-1 lg:h-[calc(100dvh-2.5rem)] lg:flex-none lg:w-[40vw]">
        {/* Fills the cut-out in white */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: HOLE.x,
            top: HOLE.y,
            width: HOLE.size,
            height: HOLE.size,
            background: 'var(--color-ink)',
            maskImage: 'url(/logo.svg)',
            maskRepeat: 'no-repeat',
            maskSize: 'contain',
            WebkitMaskImage: 'url(/logo.svg)',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
          }}
        />

        <section
          style={panelMask}
          className="flex w-full flex-col overflow-y-auto rounded-3xl border border-ink/10 bg-panel p-6 pt-24 sm:p-8 sm:pt-24 lg:pt-8"
        >
        {/* Centred in the panel; blocks that come and go slide, so the column re-centres smoothly instead of jumping */}
        <div className="my-auto w-full max-w-sm self-center py-8">
          {/* No visible title; screen readers still get one */}
          <h1 className="sr-only">{notice ? (notice.kind === 'mfa' ? 'Two-factor authentication' : 'Check your inbox') : heading}</h1>

          {notice ? (
            <form ref={formRef} onSubmit={onSubmit} noValidate className="focus-in text-center" style={rise(2)}>
              {codeVerified ? (
                <>
                  <h2 className="text-xl font-bold tracking-tight">Set a new password</h2>
                  <p className="mt-1.5 text-sm text-muted">Code verified. Choose a new password.</p>
                  <div className="relative mt-6 text-left">
                    <label htmlFor="new-password" className="sr-only">
                      New password
                    </label>
                    <input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      maxLength={PASSWORD_MAX}
                      placeholder={`New password (${PASSWORD_MIN}+ characters)`}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setError(null)
                      }}
                      aria-invalid={!!error}
                      aria-describedby="login-error"
                      className={`${inputClass} pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                  <div className="relative mt-3 text-left">
                    <label htmlFor="confirm-password" className="sr-only">
                      Confirm new password
                    </label>
                    <input
                      id="confirm-password"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      maxLength={PASSWORD_MAX}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        setError(null)
                      }}
                      aria-invalid={!!error}
                      aria-describedby="login-error"
                      className={`${inputClass} pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      aria-pressed={showConfirm}
                      className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <EyeIcon open={showConfirm} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold tracking-tight">
                    {notice.kind === 'mfa' ? 'Two-factor authentication' : notice.kind === 'confirm' ? 'Verify your email' : 'Enter reset code'}
                  </h2>
                  {notice.kind === 'mfa' ? (
                    <p className="mt-2 text-sm text-muted">Enter the {OTP_LENGTH}-digit code from your authenticator app.</p>
                  ) : (
                    <>
                      <p className="mt-2 text-sm text-muted">Enter the {OTP_LENGTH}-digit code sent to</p>
                      <p className="mt-1 break-all text-sm font-medium text-text">{notice.email}</p>
                    </>
                  )}
                  <div className="mt-6">
                    <OtpInput
                      value={code}
                      onChange={(v) => {
                        setCode(v)
                        setError(null)
                      }}
                      invalid={!!error}
                      locked={busy}
                    />
                  </div>
                  {notice.kind !== 'mfa' && (
                  <button
                    type="button"
                    disabled={cooldown > 0 || busy}
                    onClick={backToForm} // the Cloudflare check lives on the first screen
                    className="mt-4 text-sm text-muted transition-colors enabled:hover:text-text disabled:cursor-not-allowed"
                  >
                    {cooldown > 0 ? (
                      <>
                        Resend code in <span className="text-text/80">{cooldown}s</span>
                      </>
                    ) : (
                      <span className={linkClass}>Resend code</span>
                    )}
                  </button>
                  )}
                </>
              )}
              <button
                type="submit"
                disabled={busy || (codeVerified ? !password || !confirmPassword : code.length !== OTP_LENGTH)}
                className={`${control} mt-5 flex items-center justify-center gap-2 bg-primary font-bold text-[color:var(--color-base)] transition-[transform,opacity] duration-200 active:scale-95 disabled:opacity-40 disabled:active:scale-100`}
              >
                {busy && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
                {busy ? 'Please wait…' : codeVerified ? 'Update password' : 'Verify code'}
              </button>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (notice.kind === 'mfa') void signOut().catch(() => {})
                    setNotice(null)
                    setForgot(false)
                    setCodeVerified(false)
                    setCode('')
                    setPassword('')
                    setConfirmPassword('')
                    setError(null)
                    if (notice.kind === 'confirm') selectMode('signin')
                  }}
                  className="text-muted transition-colors hover:text-text"
                >
                  Back to sign in
                </button>
              </div>
              <p id="login-error" className="sr-only">
                {error}
              </p>
            </form>
          ) : (
            <>
              <Collapse open={!forgot}>
                <div className="pb-6">
                  <div
                    role="tablist"
                    aria-label="Sign in or create an account"
                    className="focus-in relative grid h-11 grid-cols-2 rounded-full border border-ink/10 p-1"
                    style={rise(2)}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-ink/10 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        mode === 'signup' ? 'translate-x-full' : ''
                      }`}
                    />
                    {(
                      [
                        ['signin', 'Sign in'],
                        ['signup', 'Create account'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={mode === id}
                        onClick={() => selectMode(id)}
                        className={`relative rounded-full text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-primary ${
                          mode === id ? 'text-text' : 'text-muted hover:text-text'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </Collapse>

              <div className="focus-in" style={rise(3)}>
                <Collapse open={!forgot}>
                  <div className="space-y-3 pb-3">
                    <button
                      type="button"
                      onClick={handleGoogle}
                      disabled={googleLoading}
                      aria-busy={googleLoading}
                      className={`${control} flex items-center justify-center gap-3 bg-white font-semibold text-slate-900 ring-1 ring-inset ring-ink/15 transition-transform duration-200 active:scale-95 disabled:cursor-wait disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
                    >
                      {googleLoading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <GoogleMark />}
                      {googleLoading ? 'Connecting…' : 'Continue with Google'}
                    </button>

                    <div className="flex items-center gap-4 py-2 text-xs text-muted" aria-hidden="true">
                      <span className="h-px flex-1 bg-ink/10" />
                      or
                      <span className="h-px flex-1 bg-ink/10" />
                    </div>
                  </div>
                </Collapse>

                <form onSubmit={onSubmit} noValidate>
                  <Collapse open={mode === 'signup' && !forgot}>
                    <div className="pb-3">
                      <label htmlFor="full-name" className="sr-only">
                        Full name
                      </label>
                      <input
                        id="full-name"
                        type="text"
                        autoComplete="name"
                        maxLength={NAME_MAX}
                        placeholder="Full name"
                        value={fullName}
                        onChange={(e) => {
                          setFullName(e.target.value)
                          setError(null)
                        }}
                        className={inputClass}
                      />
                    </div>
                  </Collapse>

                  <div className="pb-3">
                    <label htmlFor="email" className="sr-only">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      maxLength={254}
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setError(null)
                        setUnconfirmed(false)
                      }}
                      aria-invalid={!!error}
                      aria-describedby="login-error"
                      className={inputClass}
                    />
                  </div>

                  <Collapse open={!forgot}>
                    <div className="pb-3">
                      <label htmlFor="password" className="sr-only">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                          maxLength={PASSWORD_MAX}
                          placeholder={mode === 'signup' ? `Password (${PASSWORD_MIN}+ characters)` : 'Password'}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)
                            setError(null)
                          }}
                          aria-invalid={!!error}
                          aria-describedby="login-error"
                          className={`${inputClass} pr-14`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          aria-pressed={showPassword}
                          className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <EyeIcon open={showPassword} />
                        </button>
                      </div>
                    </div>
                  </Collapse>

                  <Collapse open={mode === 'signin' && !forgot}>
                    <div className="px-2 pb-3 text-right text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setForgot(true)
                          setError(null)
                          setUnconfirmed(false)
                        }}
                        className={linkClass}
                      >
                        Forgot password?
                      </button>
                    </div>
                  </Collapse>

                  <Turnstile ref={captcha} onVerified={setHuman} className="pb-3" />

                  <button
                    type="submit"
                    disabled={busy || !canSubmit || !human}
                    className={`${control} group flex items-center justify-center gap-2 bg-primary font-bold text-[color:var(--color-base)] transition-[transform,opacity] duration-200 active:scale-95 disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
                  >
                    {busy && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
                    {busy ? 'Please wait…' : submitLabel}
                    {!busy && (
                      <ArrowRight className="size-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-1" aria-hidden="true" />
                    )}
                  </button>
                </form>

                {/* Only accounts being created agree to the terms */}
                <Collapse open={mode === 'signup' && !forgot}>
                  <p className="pt-4 text-center text-xs leading-relaxed text-muted">
                    By creating an account you agree to our {legalLink('terms')} and {legalLink('privacy')}.
                  </p>
                </Collapse>

                <Collapse open={forgot}>
                  <p className="pt-4 text-center text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setForgot(false)
                        setError(null)
                      }}
                      className="text-muted transition-colors hover:text-text"
                    >
                      Back to sign in
                    </button>
                  </p>
                </Collapse>

                <p id="login-error" className={unconfirmed ? 'mt-3 text-center text-sm text-muted' : 'sr-only'}>
                  <span className="sr-only">{error}</span>
                  {unconfirmed && (
                    <>
                      {' '}
                      <button
                        type="button"
                        disabled={cooldown > 0 || busy}
                        onClick={() => resend(email)}
                        className={`${linkClass} disabled:no-underline disabled:text-muted`}
                      >
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
                      </button>
                    </>
                  )}
                </p>
              </div>
            </>
          )}

        </div>

        </section>
      </div>

      {legal && (
        <LegalWindow
          doc={LEGAL_DOCS[legal.id]}
          source={legal.source}
          onClosed={() => {
            legal.source.focus({ preventScroll: true })
            setLegal(null)
          }}
        />
      )}
    </main>
  )
}
