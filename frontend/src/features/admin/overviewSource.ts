import { api } from '@/lib/api'
import type { AdminAnalytics, AdminStatsResponse, PayoutRunResult, ReconcileMismatch } from '@/lib/api'

type Stats = AdminStatsResponse['stats']

/** Where the Overview gets its figures and sends its two jobs: the API */
export interface OverviewSource {
  stats: () => Promise<Stats>
  trend: (days: number) => Promise<AdminAnalytics>
  runPayouts: () => Promise<PayoutRunResult>
  reconcile: () => Promise<{ ok: boolean; mismatches: ReconcileMismatch[] }>
}

const real: OverviewSource = {
  stats: () => api.getAdminStats().then((r) => r.stats),
  trend: (days) => api.adminAnalytics(days),
  runPayouts: () => api.runAdminPayouts().then((r) => r.result),
  reconcile: () => api.reconcile(),
}

export const overviewSource: OverviewSource = real
