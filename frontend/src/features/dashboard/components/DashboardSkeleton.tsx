import { panel } from '../styles'
import { ACTIVITY_ROWS } from '../utils'

/** The page's own shape in grey, card for card, so nothing jumps when it arrives */
export default function DashboardSkeleton() {
  const head = (
    <div className="flex items-center gap-3">
      <div className="sk size-8 !rounded-[0.55rem]" />
      <div className="sk h-3.5 w-28" />
    </div>
  )
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading your dashboard">
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className={`${panel} flex flex-col p-4 sm:p-5`}>
          {head}
          <div className="sk mt-4 h-10 w-52 max-w-full sm:h-12" />
          <div className="sk mt-3 h-3.5 w-64 max-w-full" />
          <div className="sk mt-4 h-32 !rounded-xl" />
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-ink/[0.06] pt-4">
            <div className="flex gap-6">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="sk h-2.5 w-20" />
                  <div className="sk h-5 w-20" />
                </div>
              ))}
            </div>
            <div className="hidden gap-2 sm:flex">
              <div className="sk h-11 w-28" />
              <div className="sk h-11 w-28" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center rounded-3xl bg-deep px-4 py-5 ring-1 ring-inset ring-ink/10">
            <div className="sk h-3 w-32" />
            <div className="mt-3 flex gap-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="sk h-12 w-16 !rounded-xl" />
                  <div className="sk h-2.5 w-10" />
                </div>
              ))}
            </div>
          </div>
          <div className={`${panel} flex-1 p-4 sm:p-5`}>
            {head}
            <div className="sk mt-4 h-16 !rounded-2xl" />
            <div className="sk mt-4 h-11" />
          </div>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className={`${panel} p-4 sm:p-5`}>
          {head}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="sk h-[4.5rem] !rounded-2xl" />
            <div className="sk h-[4.5rem] !rounded-2xl" />
          </div>
          <div className="sk mt-5 h-32 !rounded-xl" />
        </div>
        <div className={`${panel} overflow-hidden`}>
          <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">{head}</div>
          <ul className="h-80 divide-y divide-ink/5 border-t border-ink/5">
            {Array.from({ length: ACTIVITY_ROWS }, (_, i) => (
              <li key={i} className="flex h-16 items-center gap-3 px-4 sm:px-5" style={{ opacity: 1 - i * 0.14 }}>
                <div className="sk size-9 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="sk h-3 w-24" />
                  <div className="sk h-2.5 w-32" />
                </div>
                <div className="sk h-3 w-14" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
