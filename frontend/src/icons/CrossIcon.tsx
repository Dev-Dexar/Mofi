/** An X, drawn as a stroke in currentColor (close, remove, dismiss). `strokeWidth` is in the icon's own 12-unit grid. */
export default function CrossIcon({ className = 'size-3', strokeWidth = 1.8 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true">
      <path d="M2.5 2.5l7 7m0-7l-7 7" />
    </svg>
  )
}
