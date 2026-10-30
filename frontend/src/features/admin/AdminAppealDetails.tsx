import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { NotFoundIllustration } from '@/features/misc/NotFoundIllustration'
import { api } from '@/lib/api'
import type { AdminAppeal } from '@/lib/api'
import { useToast } from '@/context/ToastContext'
import { CopyIcon } from '@/icons'
import { useCopy } from '@/features/referrals/components/shared'
import { NoteField } from './components/LogNote'
import { ActionDialog, Badge, dangerBtn, day, goodBtn, pillBtn, when } from './components/ui'

/**
 * One appeal, in the popup over the Appeals list (addressed as /admin/appeals/:id): who sent it and about which suspension, the
 * exchange as a short conversation (the reason, what the user was shown, what they wrote, and our answer once there is one), and,
 * while it is waiting, the two things to do: accept (which lifts the suspension) or reject (which needs a reply the user will see).
 */
export default function AdminAppealDetails({ id, preview, onChanged }: { id: string; preview?: AdminAppeal; onChanged: () => void }) {
  const toast = useToast()
  // opened from the list, the row it was opened from is already known: shown at once, then refreshed. Only a link or a reload waits.
  const [a, setA] = useState<AdminAppeal | null>(preview?.id === id ? preview : null)
  const [failed, setFailed] = useState(false)
  const [deciding, setDeciding] = useState<'accept' | 'reject' | null>(null)

  const load = () =>
    api
      .adminAppeal(id)
      .then((r) => {
        setA(r)
        setFailed(false)
      })
      .catch(() => setFailed(true))

  useEffect(() => {
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed && !a) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center select-none">
        <NotFoundIllustration
          title="APPEAL NOT FOUND"
          className="w-64 sm:w-72 h-auto select-none pointer-events-none drop-shadow-xl mb-4"
        />
        <Link
          to="/admin/appeals"
          className="inline-flex h-8 items-center rounded-full border border-ink/10 bg-ink/[0.04] px-5 text-xs font-medium text-text transition hover:bg-ink/10 hover:border-ink/20 active:scale-95"
        >
          Back
        </Link>
      </div>
    )
  }


  const u = a?.user
  const sus = a?.suspension
  const pending = a?.status === 'pending'
  const initial = (u?.full_name || u?.email || '?')[0].toUpperCase()
  const chars = a ? [...a.message].length : 0

  return (
    <div className="sk-fade space-y-6">
      {/* Who, and which suspension: one card. Compact and non-bulky on phone, spacious on desktop. */}
      <div className={`overflow-hidden rounded-2xl sm:rounded-3xl border bg-surface ${u?.status === 'suspended' ? 'border-rose-500/30' : 'border-ink/10'}`}>
        <div className="flex items-center justify-between gap-3 p-3.5 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative shrink-0">
              {u?.avatar_url ? (
                <img src={u.avatar_url} alt="" className={`size-10 sm:size-12 rounded-full object-cover ring-2 ${u.status === 'suspended' ? 'ring-rose-400/40' : 'ring-ink/15'}`} />
              ) : (
                <span className={`grid size-10 sm:size-12 place-items-center rounded-full bg-ink/10 text-base sm:text-lg font-bold text-primary ring-2 ${u?.status === 'suspended' ? 'ring-rose-400/40' : 'ring-transparent'}`}>
                  {a ? initial : ''}
                </span>
              )}
              {u?.status === 'suspended' && (
                <span className="absolute -bottom-0.5 -right-0.5 grid size-4 sm:size-5 place-items-center rounded-full bg-rose-500 text-white ring-2 ring-surface" title="Still suspended">
                  <Lock className="size-2 sm:size-2.5" strokeWidth={2.5} />
                </span>
              )}
            </span>
            <div className="min-w-0">
              {a ? (
                <>
                  <p className="truncate text-sm sm:text-base font-black tracking-tight text-text">{u?.full_name || 'No name'}</p>
                  <p className="truncate text-xs sm:text-sm text-muted">{u?.email}</p>
                </>
              ) : (
                <>
                  <div className="sk h-4 w-28 sm:w-36" />
                  <div className="sk mt-1.5 h-3.5 w-36 sm:w-48" />
                </>
              )}
            </div>
          </div>
          {u ? (
            <Link to={`/admin/users/${u.id}`} className={`${pillBtn} shrink-0 text-xs px-3 py-1.5 h-8 sm:h-9 sm:px-4 sm:py-2`}>
              Open account
            </Link>
          ) : (
            <div className="sk h-8 sm:h-9 w-24 sm:w-28 rounded-full shrink-0" />
          )}
        </div>

        {/* 3 meta stats in a single compact divided row */}
        <dl className="grid grid-cols-3 divide-x divide-ink/[0.06] border-t border-ink/[0.06] bg-ink/[0.015]">
          <div className="min-w-0 px-2.5 py-2.5 sm:px-5 sm:py-3.5">
            <dt className="text-[10px] sm:text-xs text-muted uppercase tracking-wider font-semibold">Suspension</dt>
            <dd className="mt-0.5 truncate">
              {a ? sus ? <ReferenceCopy reference={sus.reference} /> : '—' : <div className="sk h-4 w-20" />}
            </dd>
          </div>
          <div className="min-w-0 px-2.5 py-2.5 sm:px-5 sm:py-3.5">
            <dt className="text-[10px] sm:text-xs text-muted uppercase tracking-wider font-semibold">Suspended</dt>
            <dd className="mt-0.5 font-semibold text-text text-xs sm:text-sm truncate">{a ? (sus ? day(sus.created_at) : '—') : <div className="sk h-4 w-16" />}</dd>
          </div>
          <div className="min-w-0 px-2.5 py-2.5 sm:px-5 sm:py-3.5">
            <dt className="text-[10px] sm:text-xs text-muted uppercase tracking-wider font-semibold">Appeal</dt>
            <dd className="mt-0.5 truncate">
              {a ? pending ? <Badge tone="gold">Waiting</Badge> : <Badge tone={a.status === 'accepted' ? 'green' : 'red'}>{a.status === 'accepted' ? 'Accepted' : 'Rejected'}</Badge> : <div className="sk h-5 w-14 rounded-full" />}
            </dd>
          </div>
        </dl>
      </div>

      {/* The exchange */}
      {a ? (
        <div className="space-y-4">
          {sus && (
            <NoteField label="Reason (admins only)" internal>
              {sus.reason}
            </NoteField>
          )}
          {sus && <NoteField label="Shown to the user">{sus.public_reason || 'Violation of our Terms of Service'}</NoteField>}
          <NoteField label={`Their appeal · ${when(a.created_at)} · ${chars.toLocaleString('en-US')} characters`} from="user">
            {a.message}
          </NoteField>
          {!pending && (
            <NoteField label={`${a.status === 'accepted' ? 'Accepted' : 'Rejected'} by ${a.reviewer?.email ?? 'an admin'} · ${when(a.reviewed_at)}`}>
              {a.response || (a.status === 'accepted' ? 'Accepted, with no message.' : '')}
            </NoteField>
          )}
        </div>
      ) : (
        <div className="space-y-4" aria-hidden="true">
          {/* the reason and what the user was shown, on the right as ours; their appeal on the left: label over bubble, as they will be */}
          <div className="flex flex-col items-end">
            <div className="sk mb-1.5 mr-1 h-3 w-32" />
            <div className="h-12 w-3/5 rounded-2xl rounded-tr-md border border-dashed border-ink/15" />
          </div>
          <div className="flex flex-col items-end">
            <div className="sk mb-1.5 mr-1 h-3 w-28" />
            <div className="sk h-12 w-4/5 !rounded-2xl !rounded-tr-md" />
          </div>
          <div className="flex flex-col items-start">
            <div className="sk mb-1.5 ml-1 h-3 w-56" />
            <div className="sk h-[4.5rem] w-[92%] !rounded-2xl !rounded-tl-md" />
          </div>
        </div>
      )}

      {/* The two things to do, anchored to the bottom of the popup while it is waiting. A sticky element measures from the inside of the
          scroller's padding, so bottom-0 keeps them where the content ends (the window's own padding below them) whether the content is
          short or long, where it stays pinned while the rest scrolls under a soft fade. */}
      {pending && (
        <div className="sticky bottom-0 isolate z-20 before:pointer-events-none before:absolute before:-inset-x-6 before:-bottom-6 before:-top-8 before:-z-10 before:bg-gradient-to-t before:from-surface before:via-surface/90 before:to-transparent sm:before:-inset-x-8 sm:before:-bottom-8">
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setDeciding('reject')} className={`${dangerBtn} h-11 justify-center`}>
              Reject
            </button>
            <button type="button" onClick={() => setDeciding('accept')} className={`${goodBtn} h-11 justify-center`}>
              Accept &amp; lift
            </button>
          </div>
        </div>
      )}

      <ActionDialog
        open={deciding === 'accept'}
        title="Accept and lift the suspension?"
        body="The account is reactivated straight away and can use the app again."
        fields={[{ key: 'response', label: 'Reply to the user (optional)', placeholder: 'e.g. Thanks for clarifying, all sorted.' }]}
        confirmLabel="Accept & lift"
        onConfirm={async (v) => {
          await api.adminReviewAppeal(id, 'accept', v.response)
          toast.success('Appeal accepted, account reactivated', 'reactivated')
          onChanged()
          load()
        }}
        onClose={() => setDeciding(null)}
      />
      <ActionDialog
        open={deciding === 'reject'}
        title="Reject this appeal?"
        body="The suspension stays. They see your reply, and can't appeal this suspension again."
        fields={[{ key: 'response', label: 'Reply to the user', placeholder: 'Why the suspension stays', required: true }]}
        confirmLabel="Reject"
        tone="danger"
        onConfirm={async (v) => {
          await api.adminReviewAppeal(id, 'reject', v.response)
          toast.error('Appeal rejected', 'appeal-rejected')
          onChanged()
          load()
        }}
        onClose={() => setDeciding(null)}
      />
    </div>
  )
}

/** A suspension's reference; a click copies it, with the "copied" toast */
function ReferenceCopy({ reference }: { reference: string }) {
  const copy = useCopy()
  return (
    <button
      type="button"
      onClick={() => copy(reference, 'Reference')}
      aria-label={`Copy reference ${reference}`}
      className="group inline-flex max-w-full items-center gap-1.5 font-mono text-xs sm:text-[13px] font-semibold text-text"
    >
      <span className="truncate">{reference}</span>
      <CopyIcon className="size-3.5 sm:size-4 shrink-0 text-muted transition-colors group-hover:text-text" />
    </button>
  )
}
