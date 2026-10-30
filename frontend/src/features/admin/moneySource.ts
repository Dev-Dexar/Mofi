import { api } from '@/lib/api'
import type { AdminDeposit, AdminMoneyList, AdminWithdrawal } from '@/lib/api'

export interface MoneyListParams {
  kind?: string
  status?: string
  search?: string
  page?: number
  limit?: number
}

/** Where the Money pages get their deposits and withdrawals, and send their fixes: the API */
export interface MoneySource {
  list: (p: MoneyListParams) => Promise<AdminMoneyList>
  deposit: (id: string) => Promise<AdminDeposit>
  withdrawal: (id: string) => Promise<AdminWithdrawal>
  resolveDeposit: (id: string, body: { action: 'credit' | 'reject'; amount?: number; note: string }) => Promise<unknown>
  resolveWithdrawal: (id: string, body: { action: 'complete' | 'refund'; tx_hash?: string; note: string }) => Promise<unknown>
}

const real: MoneySource = {
  list: (p) => api.adminMoney(p),
  deposit: (id) => api.adminDeposit(id),
  withdrawal: (id) => api.adminWithdrawal(id),
  resolveDeposit: (id, body) => api.adminResolveDeposit(id, body),
  resolveWithdrawal: (id, body) => api.adminResolveWithdrawal(id, body),
}

export const moneySource: MoneySource = real
