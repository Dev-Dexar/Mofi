/** The brand pointer: a soft rounded arrowhead in the primary green with a white edge, tip at the top-left corner */
export default function CursorIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="15" viewBox="0 0 14 15" className={className} aria-hidden="true">
      <path
        d="M1.6 1.2c-.5-.2-.9.2-.7.7l4.3 11.6c.2.5.9.5 1.1 0l1.6-4.2c.1-.2.3-.4.5-.5l4.2-1.6c.5-.2.5-.9 0-1.1L1.6 1.2Z"
        fill="var(--color-primary)"
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}
