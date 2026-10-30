/** A filled envelope, in currentColor */
export default function MailIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 7.4C3 6.1 4 5 5.3 5h13.4C20 5 21 6.1 21 7.4v.2l-9 5.5-9-5.5z" />
      <path d="M3 10.4v6.2C3 17.9 4 19 5.3 19h13.4c1.3 0 2.3-1.1 2.3-2.4v-6.2l-8.5 5.2a1 1 0 0 1-1 0z" />
    </svg>
  )
}
