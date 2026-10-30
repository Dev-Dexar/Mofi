/** Two overlapping sheets, in currentColor (copy) */
export default function CopyIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="3 3 18 18" fill="currentColor" aria-hidden="true">
      <rect x="3" y="7.5" width="13" height="13.5" rx="3.2" />
      <path d="M8 5.6C8 4.2 9.2 3 10.6 3H17.8A3.2 3.2 0 0 1 21 6.2v7.6c0 1.4-1.2 2.6-2.6 2.6H18V9.7A3.7 3.7 0 0 0 14.3 6H8z" opacity=".55" />
    </svg>
  )
}
