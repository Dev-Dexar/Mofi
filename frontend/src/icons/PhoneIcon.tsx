/** A filled phone with a small screen notch, in currentColor */
export default function PhoneIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M8 2h8a2.5 2.5 0 0 1 2.5 2.5v15A2.5 2.5 0 0 1 16 22H8a2.5 2.5 0 0 1-2.5-2.5v-15A2.5 2.5 0 0 1 8 2zm1.5 1.8a.7.7 0 0 0 0 1.4h5a.7.7 0 0 0 0-1.4zM12 20a1.1 1.1 0 1 0 0-2.2A1.1 1.1 0 0 0 12 20z" />
    </svg>
  )
}
