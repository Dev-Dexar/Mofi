import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { onAuthChange } from '@/lib/auth'

// Remembered for the session, so moving between admin pages doesn't ask again; forgotten whenever who is signed in changes
let known: boolean | null = null
onAuthChange((_user, event) => {
  if (event !== 'INITIAL_SESSION' && event !== 'TOKEN_REFRESHED') known = null
})

/**
 * Keeps the admin panel to admins. The page renders straight away (its skeleton shows) while the check runs; anyone who
 * turns out not to be an admin is sent to their dashboard. This is for the screen only: every admin endpoint checks the
 * role itself, so nothing is shown to anyone else either way.
 */
export default function AdminGuard({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<boolean | null>(known)

  useEffect(() => {
    let live = true
    api
      .getMe()
      .then((me) => {
        known = me.is_admin
        if (live) setAdmin(me.is_admin)
      })
      .catch(() => live && setAdmin(false))
    return () => {
      live = false
    }
  }, [])

  if (admin === false) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
