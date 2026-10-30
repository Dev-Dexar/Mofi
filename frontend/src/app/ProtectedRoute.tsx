import { startTransition, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { getCurrentUser, mfaRequirement, onAuthChange } from '@/lib/auth'
import { api, onAccountSuspended } from '@/lib/api'

type Verdict = { user: User | null; needsMfa: boolean; suspended: boolean }

/**
 * One shared sign-in check, kept until the auth state changes. Every protected page reads the same settled
 * promise, so moving between them (or coming back) renders at once instead of flashing blank while it re-checks.
 * A signed-in user is also asked about once whether their account is suspended (if the API can't be reached, the pages
 * will say so themselves; they are not locked out for it).
 */
let gate: Promise<Verdict> | null = null
const authGate = () =>
  (gate ??= getCurrentUser().catch(() => null).then(async (user) => {
    const needsMfa = user ? !!(await mfaRequirement().catch(() => null)) : false
    const suspended = user && !needsMfa ? await api.mySuspension().then((s) => s.suspended).catch(() => false) : false
    return { user, needsMfa, suspended }
  }))

let settled: Verdict | null = null // the last verdict, so moving between pages never starts from "unknown"
const listeners = new Set<() => void>()

let knownSuspended = false

/** Checks again now: once a suspension has been lifted, or after sign-in */
export function recheckAccess() {
  knownSuspended = false
  gate = null
  settled = null
  listeners.forEach((l) => l())
}

/**
 * The API itself said this account is suspended, which settles it without asking again (asking is a request that can fail or
 * be rate limited, and a page that fails to find out must not carry on showing the app). Safe to call as often as requests fail.
 */
function markSuspended() {
  if (knownSuspended) return
  knownSuspended = true
  gate = getCurrentUser()
    .catch(() => null)
    .then((user) => ({ user, needsMfa: false, suspended: !!user }))
  settled = null
  listeners.forEach((l) => l())
}
onAccountSuspended(markSuspended)

onAuthChange((_user, event) => {
  // Supabase announces the session it just loaded (and every token refresh) without anything having changed.
  // Re-checking for those would only repeat work.
  if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
  // checked again, lazily, by whoever renders next; no Supabase calls in here, they can deadlock. The remembered verdict
  // goes too: kept, a "signed out" from before signing in would bounce the first protected page back to login.
  recheckAccess()
})

/**
 * The shared verdict, or null while it is first being checked. Never suspends: until the check settles a page renders as it
 * is (showing its own skeleton), so a refresh does not blank the content.
 */
export function useAccess() {
  // Only a remembered "signed in" is trusted at once; a remembered "signed out" is checked again before anyone is sent away
  const [verdict, setVerdict] = useState<Verdict | null>(settled?.user && !settled.needsMfa ? settled : null)

  useEffect(() => {
    let live = true
    const check = () =>
      authGate().then((v) => {
        settled = v
        if (live) setVerdict(v)
      })
    check()
    const onChange = () => startTransition(() => void check()) // the previous verdict stays up while re-checking
    listeners.add(onChange)
    return () => {
      live = false
      listeners.delete(onChange)
    }
  }, [])

  return verdict
}

/**
 * A page for signed-in, active accounts. Someone who turns out to be signed out is sent to login a moment later (the pages
 * only read data through the API, which refuses them without a session); a suspended account is sent to /suspended,
 * the one page it can use.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const verdict = useAccess()
  if (verdict && (!verdict.user || verdict.needsMfa)) return <Navigate to="/login" replace /> // a password-only session is sent to finish the second step
  if (verdict?.suspended) return <Navigate to="/suspended" replace />
  return <>{children}</>
}
