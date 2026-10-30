// The logo files live in public/crypto. A coin without one gets its first three letters on a grey disc.
const LOGOS: Record<string, string> = {
  USDT: '/crypto/usdt.svg',
  BTC: '/crypto/btc.svg',
  ETH: '/crypto/eth.svg',
  SOL: '/crypto/sol.svg',
  GRAM: '/crypto/gram.svg',
}

/** A crypto coin's logo by its symbol (USDT, BTC, ...) */
export default function CoinIcon({ symbol, className = 'size-8' }: { symbol: string; className?: string }) {
  const src = LOGOS[symbol]
  if (src) return <img src={src} alt="" className={`${className} rounded-full`} draggable={false} />
  return <span className={`${className} grid place-items-center rounded-full bg-ink/10 text-[11px] font-black text-text`}>{symbol.slice(0, 3)}</span>
}
