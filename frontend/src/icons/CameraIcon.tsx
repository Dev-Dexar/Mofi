/** A filled camera, in currentColor */
export default function CameraIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M9.2 3.5a2 2 0 0 0-1.7 1L7 5.5H5.5A2.5 2.5 0 0 0 3 8v9.5A2.5 2.5 0 0 0 5.5 20h13a2.5 2.5 0 0 0 2.5-2.5V8a2.5 2.5 0 0 0-2.5-2.5H17l-.5-1a2 2 0 0 0-1.7-1zM12 9a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
      />
    </svg>
  )
}
