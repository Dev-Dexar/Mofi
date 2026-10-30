/** The two housekeeping jobs on the overview: the daily payout run (a coin going round) and the balance audit (a ruled document).  currentColor. */
type P = { className?: string }
export function PayoutsIcon({ className = 'size-4' }: P) {
  // the drawing spans about 4 to 20.5 of its 24 units, so the view box is cropped to that (with a little air) and the stroke thinned to match:
  // it then fills its box as fully as the audit icon does
  return (
    <svg className={className} viewBox="2.6 2.6 18.8 18.8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20.5 3.5v4.2h-4.2" />
      <path d="M12 8.2v7.6M14.2 9.7c-.5-.7-1.3-1-2.2-1-1.2 0-2.1.6-2.1 1.5 0 2.1 4.4 1 4.4 3.1 0 .9-.9 1.5-2.3 1.5-.9 0-1.8-.3-2.3-1" />
    </svg>
  )
}

/** A document with a turned-down corner and ruled lines (the balance audit): a filled shape in currentColor, cropped to its own bounds so it sits like the others */
export function AuditIcon({ className = 'size-4' }: P) {
  return (
    <svg className={className} viewBox="54 59.5 140 140" fill="currentColor" aria-hidden="true">
      <path d="M87.7 75.9c-15.3 15.3-15.3 15.5.7 15.9 15.8.4 15.6.5 15.6-14.3 0-10.7-.7-13.5-3.4-13.5-.6 0-6.4 5.4-12.9 11.9" />
      <path d="M108 76c0 12.8-1.1 16.9-4.9 19-1.1.5-7.6 1-14.5 1H76v38.8c0 38.3 0 38.9 2.1 40.8 2 1.8 4.2 1.9 42.5 1.9h40.3l2.3-2.3 2.3-2.3.3-49.2c.2-27 0-50.7-.3-52.5s-1.5-4.2-2.6-5.3c-1.8-1.8-3.5-1.9-28.4-1.9H108zm41.5 39v2.5l-27.3.3c-23.6.2-27.3 0-27.8-1.3-.4-.8-.4-2.2 0-3 .5-1.3 4.2-1.5 27.8-1.3l27.3.3zm0 18v2.5l-27.3.3c-23.6.2-27.3 0-27.8-1.3-.4-.8-.4-2.2 0-3 .5-1.3 4.2-1.5 27.8-1.3l27.3.3zm-25 17v2.5l-14.8.3c-12.5.2-14.8 0-15.3-1.3-.4-.8-.4-2.2 0-3 .5-1.3 2.8-1.5 15.3-1.3l14.8.3z" />
      <path d="M169.9 124.2c0 49.9-.2 51.5-5.2 55.2-2.7 2-4.1 2.1-38.8 2.4-19.7.2-35.9.7-35.9 1.1 0 2.3 2.4 7.3 4 8.1 1.1.6 17.6 1 41.7 1 38.8 0 40-.1 42.1-2l2.2-2.1v-52.8c0-58.7.4-55-6.7-56.6l-3.3-.7z" />
    </svg>
  )
}
