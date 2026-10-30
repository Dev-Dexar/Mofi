import React from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-3xl border border-ink/10 bg-surface/40">
      <div className="w-12 h-12 rounded-2xl bg-ink/5 flex items-center justify-center text-muted mb-4 border border-ink/10">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h3 className="text-base font-semibold text-text mb-1">{title}</h3>
      <p className="text-sm text-muted max-w-sm mb-6">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-base transition duration-200 hover:opacity-90"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
