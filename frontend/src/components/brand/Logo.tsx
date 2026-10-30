/**
 * The MoFi Life mark. It is a shape (public/logo.svg) filled with the page's ink colour, so it is white on the dark theme and dark on the
 * light one without needing two files.
 */
export default function Logo({ className = 'w-6 h-6' }: { className?: string }) {
  const mask = 'url(/logo.svg) center / contain no-repeat'
  return <span role="img" aria-label="MoFi Life" className={`inline-block bg-ink ${className}`} style={{ WebkitMask: mask, mask }} />
}
