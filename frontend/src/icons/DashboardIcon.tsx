/** A filled house, in currentColor. Sized and centred so every nav icon carries the same visual weight, whatever its shape. */
export default function DashboardIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="64.94 65.11 125.99 125.99" fill="currentColor" aria-hidden="true">
      <path d="M123 76.2c-1.9.5-12.5 7.1-23.5 14.7C84 101.6 79 105.6 77.3 108.6c-2.2 3.8-2.3 4.8-2.3 31.1 0 16.8.4 28.2 1.1 30 1.4 3.8 5.7 8.3 9.6 9.9 2.6 1.1 11.4 1.4 42.5 1.4 44.1 0 43.3.1 49.2-7.3l3.1-3.9.3-28.6c.2-28.2.2-28.8-2-32.7-1.8-3-6.7-6.9-22.3-17.6-12.3-8.4-21.6-14.2-24.2-14.8-4.7-1.2-4.5-1.2-9.3.1m20 82.3c1 1.2 1 1.8 0 3s-4 1.5-15 1.5-14-.3-15-1.5-1-1.8 0-3 4-1.5 15-1.5 14 .3 15 1.5" />
    </svg>
  )
}
