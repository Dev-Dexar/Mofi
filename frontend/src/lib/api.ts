import { API_BASE_URL } from '@/config/env'
import { supabase } from './supabase'
import { forgetReferral, storedReferral } from './auth'
import type { AppSettings } from '@/hooks/useAppSettings'

let suspendedHandler: (() => void) | null = null
/** Called whenever any request is refused because the account is suspended (the one source of truth for "this account is suspended") */
export function onAccountSuspended(handler: () => void) {
  suspendedHandler = handler
}

export class ApiError extends Error {
  status: number
  /** a machine-readable reason, when the API gives one (e.g. "mfa_required", "account_suspended") */
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export * from './api.types'
import type {
  UserProfile,
  MeResponse,
  MySuspension,
  TransactionsResponse,
  DepositCurrency,
  DepositCreateRequest,
  DepositCreateResponse,
  PaymentDetails,
  WithdrawNetwork,
  WithdrawRequest,
  WithdrawQuote,
  WithdrawResponse,
  ReinvestEarningsResponse,
  DailyPayout,
  PayoutRunResult,
  ReconcileMismatch,
  ReferralOverview,
  ReferralEarning,
  ReferralMember,
  ReferralPage,
  AdminSettingsUpdate,
  SettingsAuditEntry,
  AdminStatsResponse,
  Paged,
  AdminUserRow,
  AdminUserSort,
  AdminUserDetail,
  AppealFilter,
  AdminAppealList,
  AdminAppeal,
  AdminTeam,
  AdminActivityKind,
  AdminDeposit,
  AdminWithdrawal,
  AdminMoneyList,
  AdminDepositList,
  AdminWithdrawalList,
  AdminAnalytics,
  AdminLogEntry,
} from './api.types'

interface CacheEntry<T = any> {
  data: T
  timestamp: number
  ttl: number
}

const apiCache = new Map<string, CacheEntry>()
const inFlightRequests = new Map<string, Promise<any>>()

// Flush cache on auth state change (sign-in, sign-out, token refresh)
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'SIGNED_IN') {
    apiCache.clear()
    inFlightRequests.clear()
  }
})

export function buildApiUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  let url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, String(val))
      }
    }
    const qs = searchParams.toString()
    if (qs) url += `?${qs}`
  }
  return url
}

export function invalidateApiCache(pattern?: string | RegExp): void {
  if (!pattern) {
    apiCache.clear()
    return
  }
  for (const key of apiCache.keys()) {
    if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
      apiCache.delete(key)
    }
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  // the sponsor's code, kept from the invite link: the API attaches it when the profile is first created (Google sign-in has no other way to carry it)
  try {
    const ref = storedReferral()
    if (token && ref) headers['X-Referral-Code'] = ref
  } catch {}
  return headers
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeader()
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${API_BASE_URL}${cleanEndpoint}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...(options.headers as Record<string, string> | undefined),
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers,
    })
  } catch (err: any) {
    if (err instanceof ApiError) throw err
    const message = typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'You appear to be offline. Please check your internet connection.'
      : 'Unable to reach the server. Please check your connection and try again.'
    throw new ApiError(message, 0, 'network_error')
  }

  let payload: any
  const contentType = response.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    payload = await response.json()
  } else {
    payload = await response.text()
  }

  if (!response.ok) {
    let message = 'An unexpected error occurred'
    let code: string | undefined
    if (typeof payload === 'object' && payload !== null) {
      if (payload.detail && typeof payload.detail === 'object' && !Array.isArray(payload.detail)) {
        code = typeof payload.detail.code === 'string' ? payload.detail.code : undefined
        if (typeof payload.detail.message === 'string') message = payload.detail.message
      } else if (typeof payload.detail === 'string') {
        message = payload.detail
      } else if (Array.isArray(payload.detail) && payload.detail[0]?.msg) {
        message = String(payload.detail[0].msg).replace(/^Value error,\s*/i, '')
      } else if (payload.message) {
        message = payload.message
      }
    } else if (typeof payload === 'string' && payload) {
      message = payload
    }
    if (response.status === 403 && code === 'account_suspended') suspendedHandler?.()
    throw new ApiError(message, response.status, code)
  }

  return payload as T
}

export const api = {
  getCached<T>(endpoint: string, params?: Record<string, string | number | boolean | undefined | null>): T | null {
    const url = buildApiUrl(endpoint, params)
    const entry = apiCache.get(url)
    if (!entry) return null
    if (Date.now() - entry.timestamp > entry.ttl) {
      apiCache.delete(url)
      return null
    }
    return entry.data as T
  },

  get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined | null>,
    options?: { ttl?: number; force?: boolean }
  ): Promise<T> {
    const url = buildApiUrl(endpoint, params)
    const ttl = options?.ttl ?? 15_000 // default 15s cache TTL

    if (!options?.force) {
      const entry = apiCache.get(url)
      if (entry && Date.now() - entry.timestamp < entry.ttl) {
        return Promise.resolve(entry.data as T)
      }
    }

    if (inFlightRequests.has(url)) {
      return inFlightRequests.get(url)! as Promise<T>
    }

    const fetchPromise = request<T>(url, { method: 'GET' })
      .then((data) => {
        apiCache.set(url, { data, timestamp: Date.now(), ttl })
        return data
      })
      .finally(() => {
        inFlightRequests.delete(url)
      })

    inFlightRequests.set(url, fetchPromise)
    return fetchPromise
  },

  async post<T>(endpoint: string, body?: any): Promise<T> {
    const res = await request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    invalidateApiCache()
    return res
  },

  async put<T>(endpoint: string, body?: any): Promise<T> {
    const res = await request<T>(endpoint, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    invalidateApiCache()
    return res
  },

  async patch<T>(endpoint: string, body?: any): Promise<T> {
    const res = await request<T>(endpoint, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    invalidateApiCache()
    return res
  },

  async delete<T>(endpoint: string): Promise<T> {
    const res = await request<T>(endpoint, { method: 'DELETE' })
    invalidateApiCache()
    return res
  },

  invalidate: invalidateApiCache,
  clearCache: () => {
    apiCache.clear()
    inFlightRequests.clear()
  },

  // Typed service methods
  getMe: () =>
    api.get<MeResponse>('/me').then((me) => {
      forgetReferral() // the profile exists now, so the sponsor was attached (or never will be)
      return me
    }),
  updateProfile: (full_name: string) =>
    api.patch<{ profile: UserProfile }>('/me/profile', { full_name }),
  setAvatar: (file: string) => api.put<{ profile: UserProfile }>('/me/avatar', { file }),
  removeAvatar: () => api.delete<{ profile: UserProfile }>('/me/avatar'),
  getReferralOverview: () => api.get<ReferralOverview>('/referrals/overview'),
  getReferralEarnings: (params?: { page?: number; limit?: number; level?: number }) =>
    api.get<ReferralPage<ReferralEarning>>('/referrals/earnings', params),
  getReferralTeam: (params?: { page?: number; limit?: number; level?: number }) =>
    api.get<ReferralPage<ReferralMember> & { level: number }>('/referrals/team', params),
  getTransactions: (params?: { page?: number; limit?: number; type?: string; status?: string }) =>
    api.get<TransactionsResponse>('/transactions', params),
  getDepositCurrencies: () =>
    api.get<{ currencies: DepositCurrency[]; credited_as: 'USDT' }>('/deposit/currencies'),
  createDeposit: (body: DepositCreateRequest) =>
    api.post<DepositCreateResponse>('/deposit/create', body),
  getPayment: (reference: string) =>
    api.get<PaymentDetails>(`/deposit/pay/${encodeURIComponent(reference)}`),
  getWithdrawQuote: (amount: number, network: WithdrawNetwork) =>
    api.get<WithdrawQuote>('/withdraw/quote', { amount, network }),
  withdraw: (body: WithdrawRequest) =>
    api.post<WithdrawResponse>('/withdraw', body),
  reinvestEarnings: (body: { amount?: number }) =>
    api.post<ReinvestEarningsResponse>('/reinvest/earnings', body),
  setAutoReinvest: (enabled: boolean) =>
    api.put<{ status: string; auto_reinvest: boolean }>('/reinvest/auto', { enabled }),
  getMonthlyEarnings: () => api.get<{ monthly: { month: string; amount: string }[] }>('/earnings/monthly'),
  getPayouts: (params?: { page?: number; limit?: number }) =>
    api.get<{ items: DailyPayout[]; total: number; page: number; limit: number; total_pages: number }>('/payouts', params),
  getAdminSettings: () =>
    api.get<{ settings: AppSettings; updated_at: string; updated_by: string | null }>('/admin/settings'),
  updateAdminSettings: (changes: AdminSettingsUpdate) =>
    api.put<{ result: { status: string }; settings: AppSettings; updated_at: string }>('/admin/settings', changes),
  getSettingsAudit: () =>
    api.get<{ entries: SettingsAuditEntry[] }>('/admin/settings/audit'),
  getAdminStats: () =>
    api.get<AdminStatsResponse>('/admin/stats'),
  runAdminPayouts: () =>
    api.post<{ status: string; executed_by: string; result: PayoutRunResult }>('/admin/run-payouts'),
  reconcile: () =>
    api.get<{ ok: boolean; mismatches: ReconcileMismatch[] }>('/admin/reconcile'),

  // admin panel
  adminUsers: (params: { search?: string; status?: string; role?: string; sort?: AdminUserSort; page?: number; limit?: number }) =>
    api.get<Paged<AdminUserRow>>('/admin/users', params),
  adminUser: (id: string) => api.get<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`),
  adminUserTeam: (id: string, params: { level?: number; beyond?: boolean; page?: number; limit?: number }) =>
    api.get<AdminTeam>(`/admin/users/${encodeURIComponent(id)}/team`, { ...params, beyond: params.beyond ? 'true' : undefined }),
  adminUserActivity: <T = any>(id: string, kind: AdminActivityKind, page = 1, limit = 20) =>
    api.get<Paged<T>>(`/admin/users/${encodeURIComponent(id)}/activity`, { kind, page, limit }),
  adminSetUserStatus: (id: string, status: 'active' | 'suspended', reason?: string, publicReason?: string) =>
    api.put<{ status: string; reference?: string }>(`/admin/users/${encodeURIComponent(id)}/status`, {
      status,
      reason: reason || undefined,
      public_reason: publicReason || undefined,
    }),
  adminAppeals: (params: { status?: AppealFilter; search?: string; page?: number; limit?: number }) =>
    api.get<AdminAppealList>('/admin/appeals', { ...params, search: params.search || undefined }),
  adminAppeal: (id: string) => api.get<AdminAppeal>(`/admin/appeals/${encodeURIComponent(id)}`),
  adminReviewAppeal: (id: string, decision: 'accept' | 'reject', response?: string) =>
    api.post<{ status: string }>(`/admin/appeals/${encodeURIComponent(id)}/review`, { decision, response: response || undefined }),
  // the suspended user's own two calls
  mySuspension: () => api.get<MySuspension>('/me/suspension'),
  submitAppeal: (message: string) => api.post<{ status: string }>('/me/appeal', { message }),
  adminSetUserRole: (id: string, role: 'user' | 'admin') =>
    api.put<{ status: string }>(`/admin/users/${encodeURIComponent(id)}/role`, { role }),
  adminMoney: (params: { kind?: string; status?: string; search?: string; page?: number; limit?: number }) => api.get<AdminMoneyList>('/admin/money', params),
  adminDeposits: (params: { status?: string; search?: string; page?: number; limit?: number }) =>
    api.get<AdminDepositList>('/admin/deposits', { ...params, search: params.search || undefined }),
  adminWithdrawals: (params: { status?: string; search?: string; page?: number; limit?: number }) =>
    api.get<AdminWithdrawalList>('/admin/withdrawals', { ...params, search: params.search || undefined }),
  adminDeposit: (id: string) => api.get<AdminDeposit>(`/admin/deposits/${encodeURIComponent(id)}`),
  adminWithdrawal: (id: string) => api.get<AdminWithdrawal>(`/admin/withdrawals/${encodeURIComponent(id)}`),
  adminResolveDeposit: (id: string, body: { action: 'credit' | 'reject'; amount?: number; note: string }) =>
    api.post<{ status: string }>(`/admin/deposits/${encodeURIComponent(id)}/resolve`, body),
  adminResolveWithdrawal: (id: string, body: { action: 'complete' | 'refund'; tx_hash?: string; note: string }) =>
    api.post<{ status: string }>(`/admin/withdrawals/${encodeURIComponent(id)}/resolve`, body),
  adminAnalytics: (days: number) => api.get<AdminAnalytics>('/admin/analytics', { days }),
  adminLog: (page = 1, limit = 30) => api.get<Paged<AdminLogEntry>>('/admin/actions', { page, limit }),
}
