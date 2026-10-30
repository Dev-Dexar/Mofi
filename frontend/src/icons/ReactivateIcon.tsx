/** A circular arrow around a dot, in currentColor, cropped to its own bounds so it sits like the other icons (reactivate) */
export default function ReactivateIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="76.12 70.03 115.97 115.97" fill="currentColor" aria-hidden="true">
      <path d="M115.6 77.6c-8.6 2.1-17.3 7.1-24.1 13.9-20.5 20.5-20.5 52.7 0 73 16.5 16.4 40.6 20 60.8 9.3 7.2-3.9 15.7-11.3 15.7-13.8 0-2.9-6.4-6.9-14.7-9.2-6.6-1.8-10.6-2.1-25.3-2.1-17 0-24.8 1.1-34.2 4.8-3.5 1.4-9.8-15.5-9.8-26.3.1-27.3 28.2-48.9 54.5-41.8 17.3 4.6 29.5 17.7 32.8 35.3l.7 3.3h-12.1l7.7 9.5c4.2 5.2 8 9.5 8.4 9.5s4.2-4.3 8.4-9.5l7.7-9.5h-11.9l-1.6-7.1c-6.4-28.3-34.9-46.1-63-39.3" />
      <path d="M121.2 101.1c-4.8 1.4-10.9 8-12.3 13.1-2.3 8.9 1.2 18.2 8.8 22.9 5.7 3.6 15.4 3.4 21-.3 6.2-4.1 8.8-9 8.8-16.8 0-7.7-2.6-12.7-8.5-16.6-4.3-2.9-12.5-3.9-17.8-2.3" />
    </svg>
  )
}
