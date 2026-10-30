import type { AppSettings } from '@/hooks/useAppSettings'

// The shapes the API sends and receives. (Split out of api.ts, which re-exports them, so every `import { X } from '@/lib/api'` still works.)

export interface UserProfile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  referral_code: string
  referred_by: string | null
  signup_method: 'google' | 'email'
  auto_reinvest: boolean // earnings move into principal right after each daily payout
  role?: 'user' | 'admin'
  status?: 'active' | 'suspended'
  created_at: string
}

// Everything is USDT. Balances are split by where the money came from.
export interface WalletData {
  user_id: string
  deposit_balance: string // locked principal, can never be withdrawn
  returns_balance: string // daily returns earned (withdrawable)
  referral_balance: string // referral + tier bonuses (withdrawable)
  usdt_balance: string // withdrawable = returns + referral
  total_balance: string // principal + withdrawable
  total_deposited: string
  total_reinvested: string // earnings moved into principal, in all time
  total_returns: string
  total_referral: string
  total_earned: string
  total_withdrawn: string
}

/** A principal part: one per credited deposit or reinvest. It earns the daily rate for every day after it started, for good. */
export interface Investment {
  id: string
  principal: string
  source: 'deposit' | 'reinvest'
  deposit_id: string | null
  earned_total: string // what this part has paid so far
  last_payout_date: string | null
  started_at: string
}

export interface MeResponse {
  profile: UserProfile
  wallet: WalletData
  investments: Investment[]
  pending_withdrawals: string
  is_admin: boolean
  pending_appeals?: number // admins only: appeals waiting for review
}

/** What a suspended user may see about their suspension (never the admin-only reason) */
export interface MySuspension {
  suspended: boolean
  profile?: { full_name: string | null; avatar_url: string | null }
  suspension?: { reference: string; message: string | null; since: string }
  appeal?: {
    status: 'pending' | 'accepted' | 'rejected'
    message: string
    response: string | null
    submitted_at: string
    reviewed_at: string | null
  } | null
}

export type BalanceSource = 'deposit' | 'returns' | 'referral' | 'reinvest' | 'system' | 'admin'

export interface TransactionItem {
  id: string
  user_id: string
  type: 'deposit' | 'withdraw' | 'withdraw_refund' | 'daily_yield' | 'referral_bonus' | 'reinvest'
  currency: 'USDT'
  amount: string
  status: 'pending' | 'completed' | 'failed'
  source: BalanceSource | null
  description: string | null
  tx_hash: string | null // on-chain hash, once there is one
  reference: string // our own public id for this row (MF-XXXXXXXXXXXXXXXX), never empty
  network: string | null
  address: string | null // pay-in address for deposits, destination for withdrawals
  fee: string
  expires_at: string | null // a pending deposit's payment window
  deposit_id: string | null
  withdrawal_id: string | null
  meta: Record<string, any>
  created_at: string
}

export interface TransactionsResponse {
  items: TransactionItem[]
  total: number
  page: number
  limit: number
  total_pages: number
}

export interface DepositCurrency {
  code: string // gateway code: usdtbsc, btc, eth, ton or sol
  symbol: string
  name: string
  network: string
}

export interface DepositCreateRequest {
  amount: string | number // USD, credited 1:1 as USDT
  pay_currency: string
}

export interface DepositCreateResponse {
  reference: string // the transaction's public id, used in the /pay/:reference link
  deposit_id: string
  payment_id: string
  order_id: string
  status: string
  pay_address: string
  pay_amount: string
  pay_currency: string
  network: string | null
  price_amount: string
  credited_usdt: string
  fee_paid_by_user: boolean
  expires_at: string | null
}

/** What the pay page shows for one deposit, looked up by transaction reference */
export interface PaymentDetails {
  reference: string
  deposit_id: string
  payment_id: string | null
  status: string
  pay_address: string | null
  pay_amount: string | null
  pay_currency: string
  network: string | null
  price_amount: string
  credited_usdt: string
  expires_at: string | null
}

export type WithdrawNetwork = 'usdtbsc' | 'btc' | 'eth' | 'ton' | 'sol' // the coin the user receives

export interface WithdrawRequest {
  amount: string | number
  network: WithdrawNetwork
  address: string
  /** what the user was shown they would receive: if the price has moved against them since, the API refuses (409) and they look again */
  expected_receive?: string
}

/** What `amount` USDT comes to in the chosen coin: the network fee (paid by the user, out of the amount), and what arrives after it */
export interface WithdrawQuote {
  amount: string
  network: WithdrawNetwork
  fee: string // USDT, all fees together
  network_fee: string // USDT, the cost of sending the coin
  conversion_fee: string // USDT, the cost of converting USDT into the coin (0 for USDT)
  net: string // USDT, amount - fee: what the user gets, in USDT terms
  receive: string // in the chosen coin, rounded down
}

export interface WithdrawResponse {
  status: 'processing' | 'sending' | 'completed'
  message: string
  withdrawal_id: string
  transaction_id: string
  amount: string
  currency: 'USDT'
  fee: string // USDT
  payout_amount: string // what is sent, in the chosen coin
  network: string
  address: string
}

export interface ReinvestEarningsResponse {
  status: string
  message: string
  data: { investment_id: string; transaction_id: string; amount: string; from_returns: string; from_referral: string }
}

/** One day's payout: the principal that earned that day, the rate, and what was paid */
export interface DailyPayout {
  payout_date: string
  eligible_principal: string
  rate: string
  amount: string
  created_at: string
}

/** What one press of "run payouts" (or the scheduler) did */
export interface PayoutRunResult {
  status: 'success' | 'error' | 'up_to_date' | 'busy'
  run_id?: string
  date?: string
  days_paid?: number
  payouts?: number // user-days paid
  total_paid?: string
  auto_reinvested?: number
  rate?: string
  errors?: { date?: string; user_id?: string; step?: string; error: string }[]
}

export interface ReconcileMismatch {
  user_id: string
  check_name: string
  expected: string
  actual: string
}

export interface ReferralOverview {
  referral_code: string | null
  share_link: string | null
  available: string // referral earnings that can be withdrawn
  total_earned: string
  this_month: string
  members: { total: number; direct: number; active_direct: number }
  levels: { level: number; percentage: string; members: number; earned: string }[]
  monthly: { month: string; amount: string }[] // the last six months, oldest first
}

export interface ReferralEarning {
  id: string
  level: number
  amount: string
  percentage: string
  deposit_amount: string | null
  from: string // the member's name, shortened
  created_at: string
}

export interface ReferralMember {
  name: string
  joined_at: string
  status: 'active' | 'joined' // active once they have made a deposit
  earned: string // what they have earned for you
}

export interface ReferralPage<T> {
  items: T[]
  total: number
  page: number
  total_pages: number
}

export type AdminSettingsUpdate = Partial<Omit<AppSettings, 'referral_levels' | 'direct_bonus_pct'>> & {
  referral_levels?: Record<number, number> // tier -> fraction of deposit
}

export interface SettingsAuditEntry {
  id: string
  changed_at: string
  changes: Record<string, { old: number | boolean; new: number | boolean }>
  profiles: { email: string | null } | null
}

export interface AdminStatsResponse {
  status: string
  admin_email: string
  stats: {
    total_users: number
    investors: number
    principal_locked: string
    withdrawable_liability: string
    total_deposited: string
    total_reinvested: string
    total_returns: string
    total_referral: string
    total_earned: string
    total_withdrawn: string
    daily_rate: string
    next_payout_estimate: string // principal x rate: what the next midnight pays
    monthly_payout_estimate: string
    principal_parts: number
    auto_reinvest_users: number
    pending_withdrawals_count: number
    pending_withdrawals_sum: string
    deposits_needing_review: number
    last_run: {
      run_date: string
      status: 'running' | 'completed' | 'partial' | 'failed'
      triggered_by: string
      days_paid: number
      payouts: number
      total_paid: string
      auto_reinvested: number
      finished_at: string | null
    } | null
    recent_transactions: (TransactionItem & { user_email?: string; user_name?: string })[]
    withdrawals_stuck: number // still in flight after half an hour
    pending_appeals: number
  }
}

// ----- admin panel

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  limit: number
  total_pages: number
}

export interface AdminUserRow {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: 'user' | 'admin'
  status: 'active' | 'suspended'
  referral_code: string
  signup_method: 'google' | 'email'
  auto_reinvest: boolean
  created_at: string
  principal: string
  withdrawable: string
  deposited: string
  withdrawn: string
  earned: string
}

export type AdminUserSort = 'newest' | 'oldest' | 'principal' | 'withdrawable' | 'deposited' | 'withdrawn'

export interface AdminActionEntry {
  action:
    | 'user_status'
    | 'user_role'
    | 'deposit_credit'
    | 'deposit_reject'
    | 'withdrawal_complete'
    | 'withdrawal_refund'
    | 'appeal_accept'
    | 'appeal_reject'
  note: string | null
  details: Record<string, any>
  created_at: string
  admin_email?: string | null
}

export interface AdminUserDetail {
  profile: UserProfile & { role: 'user' | 'admin'; status: 'active' | 'suspended'; status_reason: string | null; status_changed_at: string | null }
  wallet: WalletData | null
  sponsor: { id: string; email: string | null; full_name: string | null } | null
  referrals: { level_counts: Record<string, number>; earnings_by_level: Record<string, string> }
  parts: Investment[]
  counts: { transactions: number; deposits: number; withdrawals: number; payout_days: number }
  admin_actions: AdminActionEntry[]
  suspensions: AdminSuspension[]
  auth: { email_confirmed: boolean; last_sign_in_at: string | null; providers: string[]; two_factor: boolean } | null
}

export interface AdminSuspension {
  id: string
  reference: string
  reason: string
  public_reason: string | null
  created_at: string
  lifted_at: string | null
  lift_note: string | null
  by: { email: string | null } | null
  appeal: { id: string; status: 'pending' | 'accepted' | 'rejected'; message: string; response: string | null; created_at: string; reviewed_at: string | null } | null
}

export type AppealFilter = 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'all'

/** A page of appeals, with how many there are in each state overall */
export interface AdminAppealList extends Paged<AdminAppeal> {
  counts: { pending: number; accepted: number; rejected: number }
}

export interface AdminAppeal {
  id: string
  status: 'pending' | 'accepted' | 'rejected'
  message: string
  response: string | null
  created_at: string
  reviewed_at: string | null
  user: { id: string; email: string | null; full_name: string | null; avatar_url: string | null; status: 'active' | 'suspended' } | null
  reviewer: { email: string | null } | null
  suspension: { reference: string; reason: string; public_reason: string | null; created_at: string; lifted_at: string | null } | null
}

/** One person in a user's team, as an admin sees them */
export interface AdminTeamMember {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  status: 'active' | 'suspended'
  joined_at: string
  level: number // how many steps below the user they are
  deposited: string // what they have put in
  earned: string // what the user has earned from them
}

/** A page of a team: one tier, or everyone past the last tier that pays commission. `counts` is the head-count at every tier. */
export interface AdminTeam extends Paged<AdminTeamMember> {
  max_level: number // the last tier that pays commission
  counts: Record<string, number>
}

export type AdminActivityKind = 'transactions' | 'deposits' | 'withdrawals' | 'payouts'

export type MoneyUser = { user: { id: string; email: string | null; full_name: string | null; avatar_url?: string | null } | null }

export interface AdminDeposit extends MoneyUser {
  id: string
  /** the MF- id the member sees in their history and quotes to support */
  reference: string | null
  order_id: string
  payment_id: string | null
  status: string
  price_amount: string
  pay_currency: string
  pay_amount: string | null
  actually_paid: string | null
  credited_usdt: string | null
  payin_hash: string | null
  created_at: string
  credited_at: string | null
}

export interface AdminWithdrawal extends MoneyUser {
  id: string
  /** the MF- id the member sees in their history and quotes to support */
  reference: string | null
  amount: string
  network: string
  address: string
  status: 'processing' | 'sending' | 'completed' | 'failed'
  payout_id: string | null
  payout_amount: string | null
  tx_hash: string | null
  error: string | null
  created_at: string
  completed_at: string | null
  refunded_at: string | null
}

/** One row of the merged list: a deposit or a withdrawal, tagged with which */
export type AdminMoneyItem = (AdminDeposit & { kind: 'deposit' }) | (AdminWithdrawal & { kind: 'withdrawal' })

/** Deposits and withdrawals together (or either alone), with how many there are in each of four states, added up across what is listed */
export interface AdminMoneyList extends Paged<AdminMoneyItem> {
  counts: { attention: number; progress: number; done: number; closed: number }
}

/** A page of deposits, with how many there are in each state overall */
export interface AdminDepositList extends Paged<AdminDeposit> {
  counts: { attention: number; progress: number; credited: number; closed: number }
}

/** A page of withdrawals, with how many there are in each state overall */
export interface AdminWithdrawalList extends Paged<AdminWithdrawal> {
  counts: { attention: number; progress: number; delivered: number; refunded: number }
}

export interface AnalyticsDay {
  date: string
  signups: number
  deposits_count: number
  deposits: string
  withdrawals_count: number
  withdrawals: string
  payouts: string
  reinvested: string
  commissions: string
  principal: string
}

export interface AdminAnalytics {
  days: number
  from: string
  to: string
  series: AnalyticsDay[]
  totals: {
    signups: number
    deposits: string
    deposits_count: number
    withdrawals: string
    withdrawals_count: number
    payouts: string
    reinvested: string
    commissions: string
    net_inflow: string
    principal_start: string
    principal_end: string
  }
}

export interface AdminLogEntry {
  id: string
  action: AdminActionEntry['action']
  note: string | null
  details: Record<string, any>
  target_id: string | null
  created_at: string
  admin: { email: string | null } | null
  target: { id: string; email: string | null; full_name: string | null } | null
}
