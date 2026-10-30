/** A filled funnel, in currentColor (filter a list) */
export default function FilterIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="3 3 18 18" fill="currentColor" aria-hidden="true">
      <path d="M4.6 4h14.8c1 0 1.5 1.2.8 1.9L14.5 12v5.6c0 .6-.3 1.1-.8 1.4l-2.2 1.3c-.9.5-2-.1-2-1.1V12L3.8 5.9C3.1 5.2 3.6 4 4.6 4z" />
    </svg>
  )
}
