/** A filled key, in currentColor */
export default function KeyIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M15.5 2.5a6 6 0 0 0-5.6 8.2l-6.6 6.6a1 1 0 0 0-.3.7V20c0 .6.4 1 1 1h2.2c.6 0 1-.4 1-1v-1h1c.6 0 1-.4 1-1v-1h1c.3 0 .5-.1.7-.3l.9-.9A6 6 0 1 0 15.5 2.5zm1.6 3.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z"
      />
    </svg>
  )
}
