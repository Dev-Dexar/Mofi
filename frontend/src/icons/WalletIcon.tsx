/** A filled wallet with its clasp, in currentColor. Sized and centred so every nav icon carries the same visual weight, whatever its shape. */
export default function WalletIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="69.47 71.61 112.56 112.56" fill="currentColor" aria-hidden="true">
      <path d="M94.6 85c-7.3 1.3-13.4 5.5-17 12l-3.1 5.5v50l3 5.4c3.2 5.8 8.3 10.2 14.3 12.3 2.7.9 11.3 1.3 31.7 1.3 24.6 0 28.6-.2 32.7-1.8 8.3-3.2 15.7-13.6 14.6-20.7-.3-2.3-.8-2.5-7.8-3.1-4.1-.3-8.9-1.3-10.7-2.2-9.8-5.2-12.4-19-5.1-27.3 4.4-4.9 6.3-5.7 15.3-6.4 7.6-.5 8-.6 8.3-3 1-6.8-5.6-16.6-13.8-20.4-4.1-1.9-6.6-2.1-31-2.3-14.6-.1-28.7.2-31.4.7m38.9 27.5v3l-18.2.3c-17.6.2-18.2.2-18.8-1.8-1.5-4.6.5-5.1 19.4-4.8l17.6.3z" />
      <path d="M153.6 120.9c-4.2 4.4-4 10.4.3 14.3 2.9 2.6 3.7 2.8 11.6 2.8 10.1 0 11.5-1.2 11.5-10 0-8.9-1.3-10-11.9-10-8.4 0-8.8.1-11.5 2.9" />
    </svg>
  )
}
