import { API_BASE_URL } from '@/config/env'
import type { AuthChangeEvent, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getFingerprint } from './fingerprint'

export async function signInWithGoogle(referralCode?: string) {
  const code = referralFor(referralCode)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: code ? { referral_code: code } : undefined,
    },
  })
  if (error) throw error
}


export class EmailNotAllowedError extends Error {}

/**
 * A referral code from a link or the browser's memory, or null if it is not one. Codes are short letters and digits; anything else
 * (a crafted link) is dropped, because the code also travels as an HTTP header, and a header with odd characters makes every request fail.
 */
export function cleanReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase()
  return /^[A-Z0-9]{1,32}$/.test(code) ? code : null
}

const REF_KEY = 'mofi_ref'
const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000 // a sponsor's link still counts for 30 days after it was opened

/**
 * Keeps the sponsor's code from an invite link in this browser (not just this tab), so a visitor who looks around, closes the tab, or comes
 * back another day still signs up under that sponsor. The newest link opened wins. The tab's own copy is kept as a fallback for when the
 * browser refuses long-term storage.
 */
export function rememberReferral(raw: string | null | undefined) {
  const code = cleanReferralCode(raw)
  if (!code) return
  try {
    localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() }))
  } catch {}
  try {
    sessionStorage.setItem('mofi_ref_code', code)
  } catch {}
}

/** The remembered sponsor code, if one was kept less than 30 days ago */
export function storedReferral(): string | null {
  try {
    const raw = localStorage.getItem(REF_KEY)
    if (raw) {
      const { code, at } = JSON.parse(raw) as { code?: string; at?: number }
      if (typeof at === 'number' && Date.now() - at < REF_TTL_MS) return cleanReferralCode(code)
      localStorage.removeItem(REF_KEY)
    }
  } catch {}
  try {
    return cleanReferralCode(sessionStorage.getItem('mofi_ref_code'))
  } catch {
    return null
  }
}

/** Once the account exists the code has done its job (a sponsor is only ever attached when the profile is first created) */
export function forgetReferral() {
  try {
    localStorage.removeItem(REF_KEY)
  } catch {}
  try {
    sessionStorage.removeItem('mofi_ref_code')
  } catch {}
}

function referralFor(referralCode?: string) {
  return (
    cleanReferralCode(referralCode) ||
    cleanReferralCode(new URLSearchParams(window.location.search).get('ref')) ||
    storedReferral() ||
    undefined
  )
}

/**
 * Asks the API whether this address may sign up, so the form can explain a refusal. The real block is a
 * trigger on auth.users (backend/migrations/002), so if the API cannot be reached we let the attempt
 * through and the database still refuses it.
 */
async function assertEmailAllowed(email: string) {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/auth/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    return
  }
  if (res.status === 422) throw new Error('invalid_email')
  if (!res.ok) return
  const { allowed } = (await res.json()) as { allowed: boolean }
  if (!allowed) throw new EmailNotAllowedError()
}

const NAME_MIN = 2
export const NAME_MAX = 80

/** Same rules as the API and the database: control characters become spaces, < > are dropped, single spaces. */
export function cleanFullName(raw: string) {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
}

/** null when the name is fine, otherwise what to tell the user */
export function fullNameProblem(raw: string): string | null {
  const name = cleanFullName(raw)
  if (name.length < NAME_MIN) return 'Enter your full name.'
  if (name.length > NAME_MAX) return `Name can be at most ${NAME_MAX} characters.`
  if (!/\p{L}/u.test(name)) return 'Name must contain letters.'
  return null
}

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72 // bcrypt, which Supabase uses, ignores anything past 72 bytes

/** null when the password is acceptable, otherwise what to tell the user */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return 'Password cannot be your email.'
  return null
}

/** True when Cloudflare's check failed here or Supabase refused the token */
export const isCaptchaError = (err: unknown) =>
  (err as { code?: string })?.code === 'captcha_failed' || (err as Error)?.message === 'captcha_failed'
export const CAPTCHA_MESSAGE = 'Security check failed. Please try again.'

/**
 * Supabase sends one email per address per minute. Asking again sooner (a sign-up repeated after leaving the code screen, or a quick
 * Resend) is refused, but the code from the first email is still good, so the caller sends the person to the code screen and
 * counts down the seconds left instead of calling it a failure.
 */
export class EmailRateLimitedError extends Error {
  retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super('email_rate_limited')
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function asRateLimit(error: { code?: string; status?: number; message?: string }) {
  if (error.code !== 'over_email_send_rate_limit' && error.status !== 429) return error
  const seconds = Number(/(\d+)\s*second/i.exec(error.message ?? '')?.[1])
  return new EmailRateLimitedError(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 120) : 60)
}

export class InvalidCredentialsError extends Error {}
export class EmailNotConfirmedError extends Error {}

/**
 * Creates an account with email and password. Returns 'signed-in' when Supabase starts a session straight
 * away, or 'confirm' when the address must be confirmed first (the setting we want: "Confirm email" on).
 * Asking again for an address that already has an account looks exactly the same to the caller, so the form
 * cannot be used to find out who is registered.
 */
export async function signUpWithEmail(opts: {
  email: string
  password: string
  fullName: string
  referralCode?: string
  captchaToken?: string
}): Promise<'signed-in' | 'confirm'> {
  const address = opts.email.trim().toLowerCase()
  await assertEmailAllowed(address)
  const code = referralFor(opts.referralCode)
  const { data, error } = await supabase.auth.signUp({
    email: address,
    password: opts.password,
    options: {
      emailRedirectTo: window.location.origin,
      captchaToken: opts.captchaToken,
      data: {
        full_name: cleanFullName(opts.fullName),
        ...(code ? { referral_code: code.toUpperCase() } : {}),
      },
    },
  })
  if (error) throw asRateLimit(error)
  return data.session ? 'signed-in' : 'confirm'
}

export async function signInWithPassword(email: string, password: string, captchaToken?: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
    options: { captchaToken },
  })
  if (!error) return
  if (error.code === 'email_not_confirmed') throw new EmailNotConfirmedError()
  if (error.code === 'invalid_credentials' || error.status === 400) throw new InvalidCredentialsError()
  throw error
}

export async function resendConfirmation(email: string, captchaToken?: string) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: window.location.origin, captchaToken },
  })
  if (error) throw asRateLimit(error)
}

/** Sends the reset email. Never says whether the address has an account. */
export async function sendPasswordReset(email: string, captchaToken?: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { captchaToken })
  if (error) throw error
}

export const OTP_LENGTH = 6

export class InvalidCodeError extends Error {
  attemptsLeft: number
  constructor(attemptsLeft: number) {
    super('invalid_code')
    this.attemptsLeft = attemptsLeft
  }
}
export class TooManyAttemptsError extends Error {
  retryAfterSeconds: number
  constructor(retryAfterSeconds: number) {
    super('too_many_attempts')
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/**
 * Checks a 6-digit email code through the API, which counts wrong guesses per email address and per caller
 * (IP + fingerprint). On success the API hands back a session and the browser signs in with it.
 */
async function verifyCode(type: 'recovery' | 'signup', email: string, code: string) {
  const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), code, type, fingerprint: await getFingerprint() }),
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 429 && body?.detail?.code === 'too_many_attempts') throw new TooManyAttemptsError(body.detail.retry_after ?? 0)
  if (res.status === 400 && body?.detail?.code === 'invalid_code') throw new InvalidCodeError(body.detail.attempts_left ?? 0)
  if (!res.ok) throw new Error('verify_failed')
  const { error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
  if (error) throw error
}

/** The code from the reset email. On success the visitor holds a recovery session, enough to set a new password. */
export const verifyResetCode = (email: string, code: string) => verifyCode('recovery', email, code)

/** The code from the sign-up email. On success the new account is signed in. */
export const verifyEmailCode = (email: string, code: string) => verifyCode('signup', email, code)

/**
 * Two-step sign-in. After the password (or Google) the session is only "aal1"; when the account has an
 * authenticator app switched on it must be upgraded to "aal2" with a code. Returns the factor to ask for,
 * or null when nothing more is needed. The API refuses an aal1 session for such accounts regardless.
 */
export async function mfaRequirement(): Promise<{ factorId: string } | null> {
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!level || level.nextLevel !== 'aal2' || level.currentLevel === 'aal2') return null
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factor = factors?.totp.find((f) => f.status === 'verified')
  return factor ? { factorId: factor.id } : null
}

/** The 6-digit code from the authenticator app. Wrong guesses are counted by the API, the same way as emailed codes. */
export async function verifyMfaCode(factorId: string, code: string) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`${API_BASE_URL}/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({ factor_id: factorId, code, fingerprint: await getFingerprint() }),
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 429 && body?.detail?.code === 'too_many_attempts') throw new TooManyAttemptsError(body.detail.retry_after ?? 0)
  if (res.status === 400 && body?.detail?.code === 'invalid_code') throw new InvalidCodeError(body.detail.attempts_left ?? 0)
  if (!res.ok) throw new Error('verify_failed')
  const { error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
  if (error) throw error
}

/** The account's verified authenticator, if 2FA is on */
export async function getTotpFactor() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data.totp.find((f) => f.status === 'verified') ?? null
}

/** Starts setup: a QR code and secret to add to the authenticator app. Unfinished earlier attempts are cleared first. */
export async function beginTotpSetup() {
  const { data: all } = await supabase.auth.mfa.listFactors()
  for (const f of all?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `MoFi ${Date.now()}` })
  if (error) throw error
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
}

/** Finishes setup with the first code from the app; 2FA is on from then. */
export async function finishTotpSetup(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  if (error) throw error
}

export async function cancelTotpSetup(factorId: string) {
  await supabase.auth.mfa.unenroll({ factorId })
}

/** Switching 2FA off needs a current code, so a borrowed, unlocked browser cannot do it. */
export async function disableTotp(factorId: string, code: string) {
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
  if (verified.error) throw verified.error
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}

/**
 * Sets the account's password. For an account created with Google this ADDS a password, so the same address
 * can then sign in either way; no password is invented at sign-up. `has_password` records that it exists,
 * since Supabase lists no email identity for an account that only gained its password later.
 */
export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } })
  if (error) throw error
}

/** How this account can sign in: with Google, with an email and password, or both */
export async function getSignInMethods() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw error ?? new Error('no_user')
  const providers = (data.user.identities ?? []).map((i) => i.provider)
  const google = providers.includes('google')
  return {
    google,
    password: providers.includes('email') || data.user.user_metadata?.has_password === true || !google,
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * Whether a session is saved in this browser, answered synchronously from the same localStorage entry Supabase
 * keeps it in, so a page can render the signed-in state on its first paint instead of after getSession resolves.
 * Only a hint for what to show; the real check (getCurrentUser, ProtectedRoute) still decides access.
 */
export function hasStoredSession(): boolean {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0]
    const saved = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) ?? 'null')
    return !!saved?.refresh_token // an expired access token is refreshed on load, so this alone is enough
  } catch {
    return false
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

export function onAuthChange(callback: (user: User | null, event: AuthChangeEvent) => void) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null, event)
  })
  return () => data.subscription.unsubscribe()
}
