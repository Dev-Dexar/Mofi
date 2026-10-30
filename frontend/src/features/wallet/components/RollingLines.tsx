export type Stage = 0 | 1 | 2 | 'failed'
export type Lines = Record<string, { head: string; sub: string }>

const ORDER = ['0', '1', '2', 'failed'] as const
const POSITION: Record<string, number> = { '0': 0, '1': 1, '2': 2, failed: 2 } // 'done' and 'failed' take the same place in the roll

/**
 * The words under the clock: the old line goes up and out, the next one rolls up into its place, a little blurred while it moves.
 * They sit in a box of their own, so nothing around them moves, and the box's edges are soft.
 */
export default function RollingLines({ stage, lines, align = 'center' }: { stage: Stage; lines: Lines; align?: 'center' | 'start' }) {
  const mask = 'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)'
  return (
    <div className="relative mt-1 h-[3.1rem] w-full overflow-hidden" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      {ORDER.map((k) => {
        const here = POSITION[k]
        const now = POSITION[String(stage)]
        const active = String(stage) === k
        // already shown: rolled up out of sight. Still to come (or the result that did not happen): waiting below.
        const y = active ? '0%' : here < now ? '-115%' : '115%'
        return (
          <div
            key={k}
            aria-hidden={!active}
            className={`absolute inset-0 flex flex-col justify-center will-change-transform ${align === 'start' ? 'items-start text-left' : 'items-center'}`}
            style={{
              transform: `translate3d(0, ${y}, 0)`,
              filter: active ? 'blur(0px)' : 'blur(3px)',
              transition: 'transform 650ms cubic-bezier(0.22, 1, 0.36, 1), filter 650ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <p className="text-base font-semibold leading-tight text-text">{lines[k].head}</p>
            <p className="mt-1 text-xs leading-tight text-muted">{lines[k].sub}</p>
          </div>
        )
      })}
    </div>
  )
}
