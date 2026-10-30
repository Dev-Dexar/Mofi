import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
  title?: string
  inline?: boolean
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo)
  }

  public reset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  public render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error || new Error('Unknown error'), this.reset)
      }
      if (this.props.fallback) {
        return this.props.fallback
      }

      if (this.props.inline) {
        return (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{this.state.error?.message || 'Failed to render component'}</span>
            </div>
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-500/30"
            >
              <RotateCcw className="size-3" />
              Retry
            </button>
          </div>
        )
      }

      return (
        <div className="flex min-h-[280px] flex-col items-center justify-center p-6 text-center select-none sm:p-10">
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-muted/50">Notice</span>
          <h3 className="mt-2 text-sm font-medium text-text">
            {this.props.title || 'Could not display this section'}
          </h3>
          <p className="mt-1.5 max-w-xs text-xs text-muted leading-relaxed">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <div className="mt-5 flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                this.reset()
                if (window.history.state && window.history.state.idx > 0) {
                  window.history.back()
                } else {
                  window.location.href = '/'
                }
              }}
              className="inline-flex h-8 items-center rounded-full border border-ink/10 bg-ink/[0.04] px-4 text-xs font-medium text-text transition hover:bg-ink/10"
            >
              Back
            </button>
          </div>

        </div>
      )

    }

    return this.props.children
  }
}

export default ErrorBoundary
