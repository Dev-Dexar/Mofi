import { Fragment, useEffect, useRef } from 'react'
import { OTP_LENGTH } from '@/lib/auth'

/** Six single-digit boxes that behave as one field: typing advances, backspace steps back, a pasted or autofilled code fills them all */
export default function OtpInput({
  value,
  onChange,
  invalid,
  locked,
  describedBy = 'login-error',
}: {
  value: string
  onChange: (v: string) => void
  invalid: boolean
  locked: boolean
  describedBy?: string
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const focus = (i: number) => refs.current[Math.min(Math.max(i, 0), OTP_LENGTH - 1)]?.focus()
  // After a wrong code the boxes empty themselves: go back to the first one
  useEffect(() => {
    const active = document.activeElement
    if (value === '' && (active === document.body || refs.current.includes(active as HTMLInputElement))) refs.current[0]?.focus()
  }, [value])
  const set = (next: string) => {
    if (locked) return
    const clean = next.replace(/\D/g, '').slice(0, OTP_LENGTH)
    onChange(clean)
    focus(clean.length)
  }

  return (
    <div role="group" aria-label="Verification code" className="flex items-center justify-center gap-2">
      {Array.from({ length: OTP_LENGTH }, (_, i) => (
        <Fragment key={i}>
          {i === OTP_LENGTH / 2 && <span aria-hidden="true" className="mx-0.5 h-px w-3 shrink-0 bg-ink/20" />}
          <input
            ref={(el) => {
              refs.current[i] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            readOnly={locked}
            value={value[i] ?? ''}
            onFocus={(e) => e.currentTarget.select()}
            onMouseDown={(e) => {
              // Clicking past the last digit lands on the next free box instead
              if (i > value.length) {
                e.preventDefault()
                focus(value.length)
              }
            }}
            onChange={(e) => set(value.slice(0, i) + e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !value[i] && i > 0 && !locked) {
                e.preventDefault()
                onChange(value.slice(0, i - 1))
                focus(i - 1)
              } else if (e.key === 'ArrowLeft') focus(i - 1)
              else if (e.key === 'ArrowRight') focus(i + 1)
            }}
            onPaste={(e) => {
              e.preventDefault()
              set(e.clipboardData.getData('text'))
            }}
            className={`h-14 min-w-0 flex-1 rounded-2xl border bg-transparent text-center font-mono text-xl font-semibold text-text caret-primary transition-colors focus:border-primary focus:bg-ink/[0.04] focus:outline-none ${
              invalid ? 'border-danger/60' : value[i] ? 'border-ink/25' : 'border-ink/10 hover:border-ink/20'
            }`}
          />
        </Fragment>
      ))}
    </div>
  )
}
