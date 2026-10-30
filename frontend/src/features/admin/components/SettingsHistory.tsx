import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { SettingsAuditEntry } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { when } from './ui'
import { auditValue, keyLabel } from './settingsFields'

/** Every change to the rules (shown in a window): who made it, when, and each value from what to what, newest first */
export default function SettingsHistory() {
  const toast = useToast()
  const [entries, setEntries] = useState<SettingsAuditEntry[] | null>(null)

  useEffect(() => {
    let live = true
    api
      .getSettingsAudit()
      .then((r) => live && setEntries(r.entries))
      .catch((e) => toast.error(e.message || 'Could not load the history'))
    return () => {
      live = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ul className="divide-y divide-ink/[0.06]">
      {!entries &&
        Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="px-5 py-4">
            <div className="sk h-3 w-44" />
            <div className="sk mt-3 h-4 w-full max-w-xs" />
            <div className="sk mt-2 h-4 w-full max-w-[14rem]" />
          </li>
        ))}
      {entries?.map((a) => (
        <li key={a.id} className="sk-fade px-5 py-4">
          <p className="text-xs text-muted">
            {a.profiles?.email ?? 'Removed admin'} · {when(a.changed_at)}
          </p>
          <ul className="mt-2.5 space-y-1.5 text-sm tabular-nums">
            {Object.entries(a.changes).map(([k, v]) => (
              <li key={k} className="flex items-baseline justify-between gap-4">
                <span className="text-text">{keyLabel(k)}</span>
                <span className="shrink-0">
                  <span className="text-muted/70 line-through">{auditValue(k, v.old)}</span>
                  <span className="text-muted"> → </span>
                  <span className="font-semibold text-text">{auditValue(k, v.new)}</span>
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
      {entries?.length === 0 && <li className="px-5 py-12 text-center text-sm text-muted">The rules have not been changed yet.</li>}
    </ul>
  )
}
