/** A left chevron, drawn as a stroke in currentColor (back, previous) */
export default function BackIcon({ className = 'size-3' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.5 2.5L4 6l3.5 3.5" />
    </svg>
  )
}
