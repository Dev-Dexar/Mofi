import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { TransactionItem } from '@/lib/api'
import { formatDecimal } from '@/lib/formatters'
import { isPayable, signed } from './txConfig'
import type { TxType } from './txConfig'
import { DailyReturnIcon, ReinvestIcon, RefundIcon, UsersIcon, WalletMinusIcon, WalletPlusIcon } from '@/icons'

// Shared by History and the Wallet page: how a transaction looks (icon, label, status chip, signed amount)

const STATUS_STYLE: Record<string, { label: string; dot: string; chip: string }> = {
  completed: { label: 'Completed', dot: 'bg-emerald-400', chip: 'bg-ink/5 text-text ring-ink/10' },
  pending: { label: 'Pending', dot: 'bg-amber-400 animate-pulse', chip: 'bg-ink/5 text-text ring-ink/10' },
  failed: { label: 'Failed', dot: 'bg-rose-400', chip: 'bg-ink/5 text-text ring-ink/10' },
}


export function Status({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.failed
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

/** `tint`: the amount itself carries the status (amber pending, red failed), for the phone list that has no status label */
function Amount({ tx, tint = false }: { tx: TransactionItem; tint?: boolean }) {
  const v = signed(tx)
  const tone = tint
    ? tx.status === 'failed'
      ? 'text-rose-400'
      : tx.status === 'pending'
        ? 'text-amber-400'
        : v >= 0
          ? 'text-emerald-400'
          : 'text-text'
    : tx.status === 'failed'
      ? 'text-muted line-through'
      : v >= 0
        ? 'text-emerald-400'
        : 'text-text'
  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
      {v >= 0 ? '+' : '−'}
      {formatDecimal(Math.abs(v))}
    </span>
  )
}

/**
 * The amount, and for a deposit that is still waiting for its payment, the amount is the way to it: it opens the payment in the Wallet
 * card, with a small arrow after it. (There is no separate Pay button.)
 */
export function AmountLink({ tx, tint = false }: { tx: TransactionItem; tint?: boolean }) {
  if (!isPayable(tx)) return <Amount tx={tx} tint={tint} />
  return (
    <Link
      to={`/wallet?pay=${tx.reference}&focus=1`}
      aria-label={`Complete the payment of ${formatDecimal(Math.abs(signed(tx)))} USDT`}
      className="inline-flex items-center gap-1.5 rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <Amount tx={tx} />
      <ChevronRight className="size-3.5 shrink-0 text-muted" />
    </Link>
  )
}

type IconType = ComponentType<{ className?: string }>

const TYPE_ICON: Record<TxType, IconType> = {
  deposit: WalletPlusIcon,
  withdraw: WalletMinusIcon,
  withdraw_refund: RefundIcon,
  daily_yield: DailyReturnIcon,
  referral_bonus: UsersIcon,
  reinvest: ReinvestIcon,
}

// same palette as the type badges; size is tuned per icon because the svgs are cropped to different shapes
const TYPE_STYLE: Record<TxType, { tone: string; size: string }> = {
  deposit: { tone: 'text-emerald-400', size: 'size-[20px]' },
  withdraw: { tone: 'text-rose-400', size: 'size-[20px]' },
  withdraw_refund: { tone: 'text-rose-400', size: 'size-[18px]' },
  daily_yield: { tone: 'text-accent2', size: 'size-[21px]' },
  referral_bonus: { tone: 'text-purple-300', size: 'size-[18px]' },
  reinvest: { tone: 'text-teal-300', size: 'size-[17px]' },
}

export function Glyph({ tx, small = false }: { tx: TransactionItem; small?: boolean }) {
  const Icon = TYPE_ICON[tx.type]
  const { tone, size } = TYPE_STYLE[tx.type]
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full border border-ink/10 bg-ink/[0.03] ${small ? 'size-7' : 'h-9 w-9'} ${tone}`}>
      <Icon className={`${size} ${small ? 'scale-[0.78]' : ''}`} />
    </span>
  )
}

