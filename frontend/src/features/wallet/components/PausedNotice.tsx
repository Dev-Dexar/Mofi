import { Pause } from 'lucide-react'

/** Shown at the top of a form whose feature an admin has switched off. The form below it is disabled until it is switched back on. */
export default function PausedNotice({ message }: { message: string }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-[1.25rem] bg-amber-400/[0.08] px-4 py-3 ring-1 ring-inset ring-amber-400/25">
      <Pause className="mt-0.5 size-4 shrink-0 text-amber-300" strokeWidth={2.5} />
      <p className="text-[13px] leading-snug text-amber-100/90">{message}</p>
    </div>
  )
}
