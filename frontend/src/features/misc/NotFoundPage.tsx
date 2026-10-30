import { NotFoundIllustration } from './NotFoundIllustration'

export default function NotFoundPage({
  title = 'PAGE NOT FOUND',
  backTo,
}: {
  title?: string
  backTo?: string
}) {
  const handleBack = () => {
    if (backTo) {
      window.location.href = backTo
    } else if (window.history.state && window.history.state.idx > 0) {
      window.history.back()
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center select-none bg-base">
      <div className="flex flex-col items-center max-w-md sm:max-w-lg w-full">
        <NotFoundIllustration
          title={title}
          className="w-full max-w-[340px] sm:max-w-[440px] mb-4"
        />

        <div className="mt-4 flex items-center justify-center">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-9 items-center rounded-full border border-ink/10 bg-ink/[0.04] px-6 text-xs font-medium text-text transition hover:bg-ink/10 hover:border-ink/20 active:scale-95"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
