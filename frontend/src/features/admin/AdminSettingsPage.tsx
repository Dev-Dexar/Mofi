import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import type { AdminLogEntry } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import SettingsRules from './components/SettingsRules'
import SettingsHistory from './components/SettingsHistory'
import CenterWindow from '@/components/ui/CenterWindow'
import { ChangesIcon, LogIcon } from '@/icons'
import LogNote from './components/LogNote'
import { money, pillBtn, when } from './components/ui'

const ACTION_LABEL: Record<AdminLogEntry['action'], string> = {
  user_status: 'Changed account status',
  user_role: 'Changed role',
  deposit_credit: 'Credited a deposit',
  deposit_reject: 'Rejected a deposit',
  withdrawal_complete: 'Marked a withdrawal delivered',
  withdrawal_refund: 'Refunded a withdrawal',
  appeal_accept: 'Accepted an appeal',
  appeal_reject: 'Rejected an appeal',
}

const LOG_PAGE = 20

/** Everything admins have done to accounts and money, newest first (shown in a window). The next page loads by itself as the end comes into view. */
function AdminLog() {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<AdminLogEntry[]>([])
  const [more, setMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLLIElement>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    api
      .adminLog(page, LOG_PAGE)
      .then((r) => {
        if (!live) return
        // an entry added meanwhile pushes the rest down a page: skip any already shown
        setItems((prev) => [...prev, ...r.items.filter((a) => !prev.some((p) => p.id === a.id))])
        setMore(r.page < r.total_pages)
        setLoading(false)
      })
      .catch((e) => {
        if (!live) return
        toast.error(e.message || 'Could not load the admin log')
        setFailed(true)
        setLoading(false)
      })
    return () => {
      live = false
    }
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // the end of the list coming into view asks for the next page (watched again after each load, so a short list keeps filling)
  useEffect(() => {
    if (!more || loading || failed || !end.current) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setPage((p) => p + 1), { root: scroller.current, rootMargin: '160px' })
    io.observe(end.current)
    return () => io.disconnect()
  }, [more, loading, failed, items.length])

  const row = (i: number) => (
    <li key={`sk${i}`} className="px-5 py-3.5" aria-hidden="true">
      <div className="sk h-4 w-full max-w-sm" />
      <div className="sk mt-2 h-3 w-48" />
    </li>
  )

  return (
    <div ref={scroller} className="max-h-[70vh] overflow-y-auto">
      <ul className="divide-y divide-ink/[0.06] text-sm">
        {items.map((a) => (
          <li key={a.id} className="px-5 py-3.5">
            <p className="text-text">
              {ACTION_LABEL[a.action]}
              {a.target && (
                <>
                  <span className="text-muted"> · </span>
                  <Link to={`/admin/users/${a.target.id}`} className="hover:underline">
                    {a.target.full_name || a.target.email}
                  </Link>
                </>
              )}
              {a.details?.amount !== undefined && <span className="text-muted"> · {money(a.details.amount)}</span>}
              {a.details?.new && <span className="text-muted"> → {String(a.details.new)}</span>}
              {a.note && (
                <>
                  <span className="text-muted"> · </span>
                  <LogNote title={ACTION_LABEL[a.action]} note={a.note} who={a.admin?.email ?? 'Removed admin'} at={when(a.created_at)} />
                </>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {a.admin?.email ?? 'Removed admin'} · {when(a.created_at)}
            </p>
          </li>
        ))}
        {loading && Array.from({ length: items.length ? 2 : 5 }, (_, i) => row(i))}
        {!loading && items.length === 0 && <li className="px-5 py-12 text-center text-sm text-muted">No admin actions yet.</li>}
        <li ref={end} aria-hidden="true" className="h-px !border-t-0" />
      </ul>
    </div>
  )
}

/**
 * The rules every account runs on, as cards. The history of changes to them and the log of admin actions are one tap away, each in a window,
 * so the page itself is only the rules.
 */
export default function AdminSettingsPage() {
  const [saves, setSaves] = useState(0) // bumps on each save, so the history loads again
  const [open, setOpen] = useState<'changes' | 'log' | null>(null)

  return (
    <div className="sk-fade mx-auto max-w-4xl space-y-4">
      <div className="flex justify-end gap-2">
        <button type="button" className={pillBtn} onClick={() => setOpen('changes')}>
          <ChangesIcon />
          Changes
        </button>
        <button type="button" className={pillBtn} onClick={() => setOpen('log')}>
          <LogIcon />
          Admin log
        </button>
      </div>

      <SettingsRules onSaved={() => setSaves((n) => n + 1)} />

      {open && (
        <CenterWindow title={open === 'changes' ? 'Rule changes' : 'Admin log'} width={open === 'log' ? 'wide' : 'default'} snug onClosed={() => setOpen(null)}>
          {open === 'changes' ? (
            <div className="max-h-[70vh] overflow-y-auto">
              <SettingsHistory key={saves} />
            </div>
          ) : (
            <AdminLog />
          )}
        </CenterWindow>
      )}
    </div>
  )
}
