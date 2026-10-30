/**
 * A round green badge with a small white rocket that flies, shedding speed lines, on a loop.
 * The rocket is a plain animated SVG, so it needs no player library. Sized in em so it matches the
 * type around it.
 */
export default function RocketBadge() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-full bg-primary"
      style={{ width: '0.8em', height: '0.8em', margin: '0 0.14em 0 0.04em', verticalAlign: '-0.08em' }}
    >
      <img src="/animations/rocket.svg" alt="" draggable={false} style={{ width: '0.66em', height: '0.66em' }} />
    </span>
  )
}
