import { CoinIcon } from '@/icons'
import PillSelect from '@/components/ui/PillSelect'
import type { Coin, CoinCode } from '@/lib/coins'

/** A small coin dropdown (same look as the History filters) on the right, with its label on the left */
export default function CoinPicker({
  coins,
  value,
  onChange,
  lead = 'Pay with',
}: {
  coins: Coin[]
  value: CoinCode | string
  onChange: (code: CoinCode) => void
  lead?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted">{lead}</p>
      <PillSelect
        label={lead}
        className="w-48 shrink-0"
        hideSelected
        placeholder="Select"
        value={value as string}
        onChange={(v) => onChange(v as CoinCode)}
        options={coins.map((c) => ({
          value: c.code as string,
          label: c.symbol,
          hint: c.network,
          icon: <CoinIcon symbol={c.symbol} className="size-5 shrink-0" />,
        }))}
      />
    </div>
  )
}
