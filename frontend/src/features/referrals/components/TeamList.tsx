import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ReferralMember, ReferralPage } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { UsersIcon } from '@/icons'
import { useToast } from '@/context/ToastContext'
import { EmptyBlock, Pager, bone, inner, shortDate } from './shared'

const LIMIT = 10

/** The people at each tier of the network, with whether they have started and what they have earned for the user */
export default function TeamList({ level, page, onPage }: { level: number; page: number; onPage: (page: number, replace?: boolean) => void }) {
  const toast = useToast()
  const [data, setData] = useState<ReferralPage<ReferralMember> | null>(null)
  const [loading, setLoading] = useState(true) // the list on screen stays put (dimmed) while the next page loads

  useEffect(() => {
    let live = true
    setLoading(true)
    api
      .getReferralTeam({ page, limit: LIMIT, level })
      .then((d) => {
        if (!live) return
        if (d.page > d.total_pages) return onPage(d.total_pages, true) // a page past the end: show the last one instead
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (!live) return
        setLoading(false)
        toast.error('Could not load your team')
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, level])

  return (
    <div className="space-y-4">
      {data && data.items.length === 0 ? (
        <EmptyBlock
          icon={<UsersIcon className="size-6" />}
          title={level === 1 ? 'No one has joined yet' : `No one in tier ${level} yet`}
          description={
            level === 1 ? 'Share your link. People who sign up with it appear here.' : 'Tier 2 and beyond fill up as the people you invite invite others.'
          }
        />
      ) : (
        <ul className={`${inner} divide-y divide-ink/[0.06] overflow-hidden transition-opacity duration-200 ${loading && data ? 'opacity-50' : ''}`}>
          {data
            ? data.items.map((m, i) => (
                <li key={`${m.joined_at}-${i}`} className="flex h-[4.25rem] items-center gap-3 px-4 sm:gap-4 sm:px-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink/10 text-sm font-bold text-text">
                    {m.name[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{m.name}</p>
                    <p className="truncate text-xs text-muted">Joined {shortDate(m.joined_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold ${m.status === 'active' ? 'bg-primary/15 text-primary' : 'bg-ink/[0.07] text-muted'}`}
                    >
                      {m.status === 'active' ? 'Active' : 'Joined'}
                    </span>
                    <span className={`text-xs tabular-nums ${parseFloat(m.earned) > 0 ? 'font-semibold text-primary' : 'text-muted'}`}>
                      {parseFloat(m.earned) > 0 ? `+$${formatDecimal(m.earned)}` : '$0.00'}
                    </span>
                  </div>
                </li>
              ))
            : Array.from({ length: LIMIT }, (_, i) => (
                <li key={i} className="flex h-[4.25rem] items-center gap-3 px-4 sm:gap-4 sm:px-5" aria-hidden="true">
                  <span className={`size-10 shrink-0 ${bone}`} />
                  <span className="flex-1 space-y-2">
                    <span className={`block h-3.5 w-28 ${bone}`} />
                    <span className={`block h-3 w-36 ${bone}`} />
                  </span>
                  <span className="flex flex-col items-end gap-1.5">
                    <span className={`h-5 w-14 ${bone}`} />
                    <span className={`h-3 w-10 ${bone}`} />
                  </span>
                </li>
              ))}
        </ul>
      )}
      {data ? <Pager page={data.page} pages={data.total_pages} onPage={onPage} /> : <div className="h-9" />}
    </div>
  )
}
