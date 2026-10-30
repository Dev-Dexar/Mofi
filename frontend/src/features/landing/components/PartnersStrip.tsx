import { PARTNERS } from '../config/partners'

export default function PartnersStrip() {
  if (PARTNERS.length === 0) return null

  // 4x duplication guarantees seamless, gap-free infinite scrolling across all screen widths
  const marqueeItems = [...PARTNERS, ...PARTNERS, ...PARTNERS, ...PARTNERS]

  return (
    <section aria-label="Where we invest" className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-5">
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 lg:gap-8 overflow-hidden">
        {/* Left side label */}
        <div className="shrink-0 flex items-center gap-3 sm:gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted/70 whitespace-nowrap">
            Where we invest
          </span>
          <span className="hidden sm:block h-4 w-px bg-ink/10" aria-hidden="true" />
        </div>

        {/* Right side infinite rolling track */}
        <div className="relative flex-1 min-w-0 w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]">
          <ul className="animate-marquee flex items-center whitespace-nowrap py-1">
            {marqueeItems.map((p, idx) => (
              <li
                key={`${p.name}-${idx}`}
                className="inline-flex items-center gap-2 pr-8 text-sm font-semibold text-muted grayscale opacity-70 transition duration-300 hover:grayscale-0 hover:opacity-100 shrink-0"
              >
                {p.logo ? (
                  <img src={p.logo} alt="" className="size-6 object-contain" draggable={false} />
                ) : null}
                <span>{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
