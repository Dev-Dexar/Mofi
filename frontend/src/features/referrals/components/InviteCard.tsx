import { Check } from 'lucide-react'
import { useState } from 'react'
import { CopyIcon, GiftIcon, ShareIcon } from '@/icons'
import type { ReferralOverview } from '@/lib/api'
import { Tile } from '@/components/ui/SettingsUI'
import { voltSay } from '../mascot/events'
import { bone, useCopy } from './shared'

/** The link to share, and what a friend's deposit earns the user. */
export default function InviteCard({ data }: { data: ReferralOverview | null }) {
  const copy = useCopy()
  const [copied, setCopied] = useState(false)
  const direct = data?.levels[0]?.percentage
  const link = data?.share_link

  const doCopy = async () => {
    if (!link) return
    await copy(link, 'Link')
    voltSay({ text: 'Link copied! Paste it wherever your friends hang out.', mood: 'excited', burst: 'confetti', ms: 4200 })
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  const share = async () => {
    if (!link) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'MoFi Life', text: 'Join me on MoFi Life', url: link })
        voltSay({ text: 'Shared! Fingers crossed for a new friend.', mood: 'love', burst: 'hearts', ms: 4200 })
      } catch {
        // closed the share sheet
      }
      return
    }
    void doCopy()
  }

  const pct = direct ? `${+(parseFloat(direct) * 100).toFixed(2)}%` : null

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <Tile icon={GiftIcon} tone="green" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Invite friends</p>
          {pct ? (
            <p className="truncate text-xs text-muted">
              Earn <span className="font-bold text-primary">{pct}</span> of every deposit they make
            </p>
          ) : (
            <span className={`mt-1 block h-3 w-40 ${bone}`} />
          )}
        </div>
      </div>

      {/* The link, drawn like a ticket you tear off: a dashed edge, and the copy button at the end of it. A zero-width space before the "?" is
          where a narrow phone may break the line, so the code itself is never split in two. */}
      <div className="flex min-h-10 items-center gap-2 rounded-xl border border-dashed border-ink/20 bg-base py-1 pl-3.5 pr-1">
        {link ? <span className="min-w-0 flex-1 break-words text-xs leading-snug text-text/90 sm:text-[0.8125rem]">{link.replace("?", "\u200B?")}</span> : <span className={`h-3.5 flex-1 ${bone}`} />}
        <button
          type="button"
          onClick={doCopy}
          disabled={!link}
          aria-label="Copy link"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink/10 text-text transition-[background-color,scale] hover:bg-ink/15 active:scale-90 disabled:opacity-40"
        >
          {copied ? <Check className="size-4 text-primary" /> : <CopyIcon className="size-4" />}
        </button>
      </div>

      <button
        type="button"
        onClick={share}
        disabled={!link}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-[color:var(--color-base)] transition-[opacity,scale] active:scale-95 disabled:opacity-40"
      >
        <ShareIcon className="size-4" />
        Share link
      </button>
    </div>
  )
}
