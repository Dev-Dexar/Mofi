import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CenterWindow from '@/components/ui/CenterWindow'
import type { ReconcileMismatch } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'

export type AuditResult = { ok: boolean; mismatches: ReconcileMismatch[]; at: Date; took: number }

/** The checks the database runs (reconcile_wallets), in its own words, and in ours */
const CHECKS = [
  { name: 'deposit_balance matches principal parts', label: 'Principal matches its parts' },
  { name: 'total_returns matches daily payouts', label: 'Total returns match the payouts' },
  { name: 'daily payouts match parts earned', label: 'Payouts match what the parts earned' },
  { name: 'total_referral matches commissions', label: 'Referral earnings match the commissions' },
]

const SHOWN = 25 // members listed under one check before "and N more"

const signed = (v: number) => `${v < 0 ? '−' : '+'}$${formatDecimal(Math.abs(v))}`

/**
 * The balance audit, as the list of what it checks. Before a run the checks wait; while it runs they pulse one after another; after it,
 * each shows a tick or how many members it found off, and tapping one opens those members (with what each balance should be, what it is
 * and the gap). Any check the database adds later still shows, under its own name. The button runs it again.
 */
export default function AuditWindow({ audit, checking, onRun, onClosed }: { audit: AuditResult | null; checking: boolean; onRun: () => void; onClosed: () => void }) {
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(() => {
    const by = new Map<string, ReconcileMismatch[]>()
    for (const m of audit?.mismatches ?? []) by.set(m.check_name, [...(by.get(m.check_name) ?? []), m])
    const known = CHECKS.map((c) => ({ ...c, found: by.get(c.name) ?? [] }))
    const extra = [...by.keys()].filter((k) => !CHECKS.some((c) => c.name === k)).map((k) => ({ name: k, label: k, found: by.get(k)! }))
    return [...known, ...extra]
  }, [audit])

  const members = new Set((audit?.mismatches ?? []).map((m) => m.user_id)).size
  const failed = rows.filter((r) => r.found.length > 0).length
  const state = checking ? 'checking' : !audit ? 'idle' : audit.ok ? 'ok' : 'off'

  return (
    <CenterWindow title="Audit" width="narrow" onClosed={onClosed}>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${state === 'off' ? 'text-rose-300' : 'text-text'}`}>
              {state === 'checking' && 'Checking every wallet…'}
              {state === 'idle' && 'Check every balance'}
              {state === 'ok' && 'Everything adds up'}
              {state === 'off' && `${members} ${members === 1 ? 'member is' : 'members are'} off`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {state === 'checking' && 'This can take a moment.'}
              {state === 'idle' && 'Each wallet against its principal and its payouts.'}
              {state === 'ok' && `All ${rows.length} checks passed.`}
              {state === 'off' && `${audit!.mismatches.length} ${audit!.mismatches.length === 1 ? 'mismatch' : 'mismatches'}, in ${failed} of ${rows.length} checks.`}
            </p>
          </div>
          {audit && !checking && (
            <p className="shrink-0 text-right text-[11px] leading-relaxed tabular-nums text-muted/70">
              {audit.at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              <br />
              {audit.took < 950 ? `${Math.round(audit.took)} ms` : `${(audit.took / 1000).toFixed(1)} s`}
            </p>
          )}
        </div>

        {/* what is checked, and how each came out */}
        <ul className="mt-4 divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
          {rows.map((r, i) => {
            const bad = !checking && !!audit && r.found.length > 0
            const good = !checking && !!audit && r.found.length === 0
            const expanded = open === r.name && bad
            return (
              <li key={r.name}>
                <button
                  type="button"
                  disabled={!bad}
                  onClick={() => setOpen(expanded ? null : r.name)}
                  aria-expanded={bad ? expanded : undefined}
                  className="flex w-full items-center gap-3 py-2.5 text-left outline-none enabled:cursor-pointer enabled:hover:bg-ink/[0.02] focus-visible:bg-ink/[0.04]"
                >
                  {/* waiting: a hollow ring; running: the ring pulses, row after row; done: a tick, or a red mark */}
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full ${good ? 'bg-[#163a2f] text-emerald-300' : bad ? 'bg-[#3d1c25] text-rose-300' : 'ring-1 ring-inset ring-ink/15'} ${checking ? 'animate-pulse' : ''}`}
                    style={checking ? { animationDelay: `${i * 140}ms` } : undefined}
                  >
                    {good && (
                      <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m5 12.5 4.5 4.5L19 7.5" />
                      </svg>
                    )}
                    {bad && <span className="text-[11px] font-bold leading-none">!</span>}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${bad ? 'font-semibold text-text' : 'text-muted'}`}>{r.label}</span>
                  {bad && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold tabular-nums text-rose-300">
                      {r.found.length} off
                      <svg className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  )}
                </button>

                {expanded && (
                  <ul className="sk-fade mb-2 max-h-48 divide-y divide-ink/[0.05] overflow-y-auto rounded-2xl bg-ink/[0.03] px-3.5">
                    {r.found.slice(0, SHOWN).map((m) => {
                      const gap = Number(m.actual) - Number(m.expected)
                      return (
                        <li key={m.user_id} className="flex items-center justify-between gap-3 py-2 text-xs">
                          <Link to={`/admin/users/${m.user_id}`} className="font-mono text-text underline decoration-ink/25 underline-offset-2 hover:decoration-ink/70">
                            {m.user_id.slice(0, 8)}
                          </Link>
                          <span className="tabular-nums text-muted">
                            should be <span className="text-text">{formatDecimal(m.expected)}</span> · is <span className="text-rose-300">{formatDecimal(m.actual)}</span>
                            <span className="ml-2 font-semibold text-rose-300">{signed(gap)}</span>
                          </span>
                        </li>
                      )
                    })}
                    {r.found.length > SHOWN && <li className="py-2 text-center text-xs text-muted">and {r.found.length - SHOWN} more</li>}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          onClick={onRun}
          disabled={checking}
          className={`mt-4 h-10 w-full rounded-full text-[13px] font-bold outline-none transition-[background-color,opacity,scale] focus-visible:ring-2 focus-visible:ring-ink/50 active:scale-95 disabled:opacity-50 ${
            audit ? 'bg-ink/[0.07] text-text hover:bg-ink/10' : 'bg-primary text-[color:var(--color-base)] hover:opacity-90'
          }`}
        >
          {checking ? 'Checking…' : audit ? 'Run again' : 'Run audit'}
        </button>
      </div>
    </CenterWindow>
  )
}
