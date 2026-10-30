/** A filled padlock, in currentColor */
export default function LockIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M7 10V7.5a5 5 0 0 1 10 0V10h.5c1.1 0 2 .9 2 2v6.5c0 1.1-.9 2-2 2h-11c-1.1 0-2-.9-2-2V12c0-1.1.9-2 2-2zm2 0h6V7.5a3 3 0 0 0-6 0z"
      />
    </svg>
  )
}
