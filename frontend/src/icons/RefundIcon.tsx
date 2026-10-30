/** Two filled arrows chasing each other, in currentColor (refund, funds returned). Cropped to its own bounds so it sits like the stroke icons beside it. */
export default function RefundIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="62 62 132 132" fill="currentColor" aria-hidden="true">
      <path d="M82.5 81.6c-6.6 5.3-12.4 10.2-12.8 11-.9 1.5.3 2.7 14.3 13.8 12.2 9.8 17 10.2 17 1.4V104h25.5c28.2 0 30.1.3 34.8 5.9 2.7 3.2 3 4.2 4.2 11.2 1.1 7.3 8.4 11.4 14.9 8.4 5.3-2.5 7.1-7.1 5.7-14.8-2.2-12.4-10.1-23.1-21.1-28.5l-5.5-2.7-29-.5-29-.5-.3-3.5c-.4-3.9-2.7-7-5.1-7-.9 0-7 4.3-13.6 9.6m-7.2 45c-5 2.5-6.7 7.2-5.4 14.7 2.2 12.4 10.1 23.1 21.1 28.5l5.5 2.7 29 .5 29 .5.3 3.5c.4 3.9 2.7 7 5.1 7 1.7 0 25.1-18.2 26.4-20.5.9-1.6-.3-2.7-14.3-13.9-12.3-9.8-17-10.2-17-1.4v3.9l-26.9-.3c-25.5-.3-27.1-.4-29.8-2.4-4-3-7.3-8.2-7.3-11.6 0-4.6-2.8-9.5-6.5-11.2-4.1-2-5.2-2-9.2 0" />
    </svg>
  )
}
