/** An arrow leaving a tray, in currentColor (share, send out) */
export default function ShareIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="3 3 18 18" fill="currentColor" aria-hidden="true">
      <path d="M12 3l4.7 4.7-1.5 1.5-2.2-2.2V15h-2V7l-2.2 2.2-1.5-1.5L12 3z" />
      <path d="M7 10.5H6a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-1v2h1a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-4.5a1 1 0 0 1 1-1h1z" />
    </svg>
  )
}
