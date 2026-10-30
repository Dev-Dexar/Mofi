/** Three filled bars climbing, in currentColor (earnings, growth) */
export default function ChartIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="1.29 1.29 21.43 21.43" fill="currentColor" aria-hidden="true">
      <rect x="3" y="13" width="4.6" height="8" rx="1.4" />
      <rect x="9.7" y="8" width="4.6" height="13" rx="1.4" />
      <rect x="16.4" y="3" width="4.6" height="18" rx="1.4" />
    </svg>
  )
}
