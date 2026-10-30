export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase()
  if (s === 'completed' || s === 'success') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Completed
      </span>
    )
  }
  if (['pending', 'waiting', 'confirming', 'confirmed', 'sending', 'processing'].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Pending
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
      Failed
    </span>
  )
}

// Solid chips, one colour per kind of movement: an opaque dark tint of the colour with its light shade as text (no outline, no see-through)
const TYPE_CHIP: Record<string, { label: string; cls: string }> = {
  deposit: { label: 'Deposit', cls: 'bg-[#163a2f] text-emerald-300' },
  withdraw: { label: 'Withdrawal', cls: 'bg-[#3d1c25] text-rose-300' },
  withdraw_refund: { label: 'Withdrawal Refund', cls: 'bg-[#3b3217] text-amber-300' },
  daily_yield: { label: 'Daily Return', cls: 'bg-[#3a3114] text-[#e6c65c]' },
  referral_bonus: { label: 'Direct Referral', cls: 'bg-[#2c2250] text-violet-300' },
  reinvest: { label: 'Reinvest', cls: 'bg-[#12352f] text-teal-300' },
}

export function TypeBadge({ type }: { type: string }) {
  const chip = TYPE_CHIP[type.toLowerCase()] ?? { label: type, cls: 'bg-raised text-muted' }
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold leading-none ${chip.cls}`}>{chip.label}</span>
}
