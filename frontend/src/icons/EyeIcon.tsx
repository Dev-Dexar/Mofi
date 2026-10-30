const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'
// Everything folds around the eye's centre line (y = 12) in viewBox units
const pivot = { transformBox: 'view-box', transformOrigin: '12px 12px' } as const

/**
 * Password visibility icon that blinks. Open eye while the password is visible; when it is hidden the upper
 * lid swings down onto the lower one (a real flip through the flat line, not a swap), the pupil shrinks away
 * and lashes drop in under the closed lid.
 */
export default function EyeIcon({ open, className = 'size-5' }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* lower lid: never moves */}
      <path d="M2.5 12c2.6 4.2 6 6 9.5 6s6.9-1.8 9.5-6" />
      {/* upper lid: mirrored onto the lower lid to close */}
      <path
        d="M2.5 12c2.6-4.2 6-6 9.5-6s6.9 1.8 9.5 6"
        style={{ ...pivot, transform: open ? 'scaleY(1)' : 'scaleY(-1)', transition: `transform 380ms ${ease}` }}
      />
      {/* pupil */}
      <circle
        cx="12"
        cy="12"
        r="2.75"
        style={{
          ...pivot,
          transform: open ? 'scale(1)' : 'scale(0)',
          opacity: open ? 1 : 0,
          transition: `transform 300ms ${ease} ${open ? '120ms' : '0ms'}, opacity 200ms ${open ? '120ms' : '0ms'}`,
        }}
      />
      {/* lashes, only on the closed eye */}
      <g
        style={{
          opacity: open ? 0 : 1,
          transform: open ? 'translateY(-1.5px)' : 'translateY(0)',
          transition: `opacity 220ms ${open ? '0ms' : '180ms'}, transform 320ms ${ease} ${open ? '0ms' : '180ms'}`,
        }}
      >
        <path d="M12 18v2.6" />
        <path d="M7.2 16.6l-1.2 2.2" />
        <path d="M16.8 16.6l1.2 2.2" />
      </g>
    </svg>
  )
}
