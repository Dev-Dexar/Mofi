import { useEffect, useState } from 'react'

const secondsToMidnightUtc = () => {
  const now = new Date()
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(0, Math.floor((next - now.getTime()) / 1000))
}

/** Live countdown to the next 00:00 UTC payout, as zero-padded parts. */
export function useCountdown() {
  const [secs, setSecs] = useState(secondsToMidnightUtc)
  useEffect(() => {
    const id = setInterval(() => setSecs(secondsToMidnightUtc()), 1000)
    return () => clearInterval(id)
  }, [])
  const pad = (n: number) => String(n).padStart(2, '0')
  return { h: pad(Math.floor(secs / 3600)), m: pad(Math.floor((secs % 3600) / 60)), s: pad(secs % 60) }
}
