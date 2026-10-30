interface Partner {
  name: string
  logo?: string // Optional path to SVG in frontend/public/partners/
  href?: string
}

export const PARTNERS: Partner[] = [
  { name: 'BlackRock' },
  { name: 'Fidelity', logo: '/partners/fidelity.svg' },
  { name: 'Grayscale', logo: '/partners/grayscale.svg' },
  { name: 'Coinbase', logo: '/partners/coinbase.svg' },
  { name: 'Binance', logo: '/partners/binance.svg' },
  { name: 'MicroStrategy', logo: '/partners/microstrategy.svg' },
  { name: 'Circle', logo: '/partners/circle.svg' },
  { name: 'Robinhood', logo: '/partners/robinhood.svg' },
  { name: 'VanEck', logo: '/partners/vaneck.svg' },
  { name: 'ARK Invest', logo: '/partners/ark.svg' },
]
