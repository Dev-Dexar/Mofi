import { useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from '@/components/brand/Logo'
import LegalWindow from '@/components/legal/LegalWindow'
import { NAV_LINKS } from '../config/nav'
import { LEGAL_DOCS, type LegalDoc } from '@/components/legal/legal'

const link = 'transition-colors hover:text-text'
const YEAR = new Date().getFullYear()

export default function Footer() {
  // which legal document is open, and the link it was opened from
  const [open, setOpen] = useState<{ id: LegalDoc['id']; source: HTMLElement } | null>(null)

  return (
    <footer className="overflow-hidden">
      {/* hairline that fades out toward the edges */}
      <div className="h-px bg-gradient-to-r from-transparent via-ink/15 to-transparent" />

      <div className="mx-auto max-w-6xl px-4 pt-14 pb-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <Logo className="size-8" />
              <span className="text-lg font-bold tracking-tight text-text">
                MoFi <span className="font-black text-primary">Life</span>
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted">Daily USDT yield on your deposit, paid every midnight.</p>
          </div>

          <nav aria-label="Footer" className="flex gap-x-8 gap-y-3 text-sm text-muted md:pt-1">
            {NAV_LINKS.map(([href, label]) => (
              <a key={href} href={href} className={link}>
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ink/[0.06] pt-6 text-xs text-muted/80 sm:flex-row sm:items-center sm:justify-between">
          <p>© {YEAR} MoFi Life. All rights reserved.</p>
          <div className="flex gap-6">
            {Object.values(LEGAL_DOCS).map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={(e) => setOpen({ id: doc.id, source: e.currentTarget })}
                className={`cursor-pointer ${link}`}
              >
                {doc.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* oversized wordmark, fading into the page */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none overflow-hidden text-center font-black leading-[0.8] tracking-[-0.06em] text-transparent"
        style={{
          fontSize: 'clamp(4.5rem, 19vw, 17rem)',
          backgroundImage: 'linear-gradient(to bottom, color-mix(in srgb, var(--color-ink) 10%, transparent), transparent 85%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          paddingBottom: '0.06em',
        }}
      >
        MoFi Life
      </div>

      {open && (
        <LegalWindow
          doc={LEGAL_DOCS[open.id]}
          source={open.source}
          onClosed={() => {
            open.source.focus({ preventScroll: true })
            setOpen(null)
          }}
        />
      )}
    </footer>
  )
}
