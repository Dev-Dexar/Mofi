import { useCountdown } from '@/hooks/useCountdown'

/** The time to the next payout (00:00 UTC), as a digital clock: the landing page's digits, on a dark display panel with a faint green
 *  glow at its edges (the same panel as the menu's name plate) */
export default function PayoutClock({ time }: { time?: { h: string; m: string; s: string } }) {
  const live = useCountdown()
  const { h, m, s } = time ?? live // `time` is for the landing page's demo, which plays the clock itself
  const parts = [
    [h, 'hours'],
    [m, 'minutes'],
    [s, 'seconds'],
  ]
  return (
    <div className="rounded-3xl bg-deep px-4 py-5 text-center shadow-[inset_0_0_32px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.07)] ring-1 ring-inset ring-ink/10">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">Next payout in</p>
      <div className="mt-3 flex items-start justify-center gap-2 sm:gap-3" role="timer" aria-label="Time until the next payout">
        {parts.map(([value, unit], i) => (
          <div key={unit} className="flex items-start gap-2 sm:gap-3">
            <div>
              <div className="font-mono text-5xl font-black leading-none tabular-nums tracking-tighter text-text [text-shadow:0_0_18px_rgba(16,185,129,0.35)]">{value}</div>
              <div className="mt-2 text-[11px] text-muted">{unit}</div>
            </div>
            {i < 2 && <span className="animate-pulse font-mono text-5xl font-black leading-none text-primary/50 motion-reduce:animate-none">:</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
