// (Toncoin was renamed Gram in June 2026; the gateway and database still use the code 'ton'.)
// The only coins the app takes and pays out. Keep in step with SUPPORTED_COINS in backend/services/nowpayments.py.
export type CoinCode = 'usdtbsc' | 'btc' | 'eth' | 'ton' | 'sol'

export interface Coin {
  code: CoinCode
  symbol: string // also the logo key
  name: string
  network: string
  title: string
  note: string
  re: RegExp // what a valid receiving address looks like (the API also checks each coin's own checksum)
  addressHint: string // the whole error, said when the address is the wrong shape
  example: string
  tag?: string
}

export const COINS: Coin[] = [
  {
    code: 'usdtbsc',
    symbol: 'USDT',
    name: 'Tether',
    network: 'BEP-20',
    title: 'USDT · BEP-20',
    note: 'BNB Chain · low fee, about a minute',
    re: /^0x[a-fA-F0-9]{40}$/,
    addressHint: 'Not a BNB Chain (BEP-20) address. It should start with 0x and be 42 characters.',
    example: '0x…',
    tag: 'Recommended',
  },
  {
    code: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    network: 'Bitcoin',
    title: 'Bitcoin · BTC',
    note: 'Bitcoin network',
    re: /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
    addressHint: 'Not a Bitcoin address. It should start with bc1, 1 or 3.',
    example: 'bc1…',
  },
  {
    code: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    network: 'Ethereum',
    title: 'Ethereum · ETH',
    note: 'Ethereum network',
    re: /^0x[a-fA-F0-9]{40}$/,
    addressHint: 'Not an Ethereum address. It should start with 0x and be 42 characters.',
    example: '0x…',
  },
  {
    code: 'ton',
    symbol: 'GRAM',
    name: 'Gram',
    network: 'TON',
    title: 'Gram · GRAM',
    note: 'TON network, formerly Toncoin · fast and cheap',
    re: /^([EU]Q[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/,
    addressHint: 'Not a TON address. It should start with EQ or UQ and be 48 characters.',
    example: 'UQ…',
  },
  {
    code: 'sol',
    symbol: 'SOL',
    name: 'Solana',
    network: 'Solana',
    title: 'Solana · SOL',
    note: 'Solana network · fast and cheap',
    re: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    addressHint: 'Not a Solana address. It should be 32 to 44 characters.',
    example: 'Solana address',
  },
]


/** What is wrong with `address` as a `coin` address, in one short line for the user, or null if it looks right. (The API is the real check.) */
export function addressProblem(coin: Coin, address: string): string | null {
  const a = address.trim()
  if (!a) return null
  if (/\s/.test(a)) return 'Remove the spaces from the address.'
  return coin.re.test(a) ? null : coin.addressHint
}

/** The coin for a gateway code, if it is one the app takes */
export const coinOf = (code: string) => COINS.find((c) => c.code === code.toLowerCase())

/** The coin's symbol (USDT, BTC, GRAM ...), or the code in capitals for one the app does not know */
export const coinSymbol = (code: string) => coinOf(code)?.symbol ?? code.toUpperCase()
