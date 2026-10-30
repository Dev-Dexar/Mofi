/** A page of ruled lines with a corner turned down, for the admin log */
export default function LogIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 3H8a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 8 21h8a2.5 2.5 0 0 0 2.5-2.5V7z" />
      <path d="M14.5 3v3a1 1 0 0 0 1 1h3" />
      <path d="M9 12.5h6M9 16h4" />
    </svg>
  )
}
