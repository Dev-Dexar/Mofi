import type { TransactionItem } from '@/lib/api'

// What a transaction is called and how its numbers read; shared by History and the Wallet page

export type TxType = TransactionItem['type']

const CREDIT_TYPES: TxType[] = ['deposit', 'daily_yield', 'referral_bonus', 'withdraw_refund']

export const LABEL: Record<TxType, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  withdraw_refund: 'Withdrawal refund',
  daily_yield: 'Daily return',
  referral_bonus: 'Referral bonus',
  reinvest: 'Reinvestment',
}


/** Money coming in to the account (as opposed to going out) */
export const isCredit = (type: string) => CREDIT_TYPES.includes(type as TxType)

export const signed = (tx: TransactionItem) => (CREDIT_TYPES.includes(tx.type) ? 1 : -1) * parseFloat(tx.amount)
export const refOf = (tx: TransactionItem) => tx.reference
export const isPayable = (tx: TransactionItem) =>
  tx.type === 'deposit' && tx.status === 'pending' && (!tx.expires_at || new Date(tx.expires_at) > new Date())

export const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
