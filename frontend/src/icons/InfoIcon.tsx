/** An "i" in a circle, drawn as a stroke in currentColor (a hint or explanation is available) */
export default function InfoIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.2v3.6" strokeLinecap="round" />
      <circle cx="8" cy="4.9" r="0.4" fill="currentColor" />
    </svg>
  )
}
