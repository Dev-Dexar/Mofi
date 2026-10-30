import { useEffect, useState } from 'react'

/** Eases a number from 0 up to `value`, once it is known. Stays put for people who asked for less motion. */
export function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (value <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(value)
    const start = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const k = Math.min((now - start) / ms, 1)
      setShown(value * (1 - Math.pow(1 - k, 4)))
      if (k < 1) raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return shown
}
