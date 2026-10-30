/** Two filled people, in currentColor. Cropped to its own bounds so it sits like the stroke icons beside it. */
export default function UsersIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="1.30 1.30 21.89 21.89" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M2 19.2C2 15.9 5 14 9 14s7 1.9 7 5.2c0 .9-.6 1.3-1.4 1.3H3.4C2.6 20.5 2 20.1 2 19.2z" />
      <circle cx="17.2" cy="8.4" r="2.8" opacity=".7" />
      <path d="M17.6 14.2c2.8.2 4.9 1.7 4.9 4.4 0 .8-.5 1.2-1.3 1.2h-3.2c.3-.5.4-1 .4-1.6 0-1.6-.6-3-1.6-4z" opacity=".7" />
    </svg>
  )
}
