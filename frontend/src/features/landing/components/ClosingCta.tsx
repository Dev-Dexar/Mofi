import CoinButton from './CoinButton'
import { useCountdown } from '@/hooks/useCountdown'

export default function ClosingCta({ loginUrl, ratePct }: { loginUrl: string; ratePct: string }) {
  const { h, m, s } = useCountdown()
  const parts = [
    [h, 'hours'],
    [m, 'minutes'],
    [s, 'seconds'],
  ]

  return (
    <section className="relative overflow-hidden px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      {/* soft glow behind the clock */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[820px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,0.14), transparent)' }} />

      <div className="mx-auto max-w-4xl text-center">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-muted">Next payout in</p>

        <div className="mt-6 flex items-start justify-center gap-3 sm:gap-6" role="timer" aria-label="Time until next payout">
          {parts.map(([value, unit], i) => (
            <div key={unit} className="flex items-start gap-3 sm:gap-6">
              <div>
                <div className="font-mono text-6xl font-black tabular-nums tracking-tighter text-text sm:text-8xl lg:text-9xl">
                  {value}
                </div>
                <div className="mt-2 text-xs text-muted sm:text-sm">{unit}</div>
              </div>
              {i < 2 && (
                <span className="animate-pulse font-mono text-6xl font-black text-primary/50 motion-reduce:animate-none sm:text-8xl lg:text-9xl">
                  :
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Two rows, always: each is one unbreakable line, and the size is capped so the longer one fits the screen */}
        <h2 className="mx-auto mt-14 max-w-4xl text-[min(1.875rem,calc((100vw-2rem)/14.5))] font-black tracking-tight sm:text-[min(3rem,calc((100vw-3rem)/14.5))]">
          <span className="block whitespace-nowrap">Every midnight, {ratePct} lands</span>
          <span className="block whitespace-nowrap">
            in a wallet. <span className="text-text/50">Make it yours.</span>
          </span>
        </h2>

        <CoinButton to={loginUrl} className="mt-10">
          Start earning
        </CoinButton>
      </div>
    </section>
  )
}
