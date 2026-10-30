export function formatDecimal(val: string | number | null | undefined, decimals: number = 2): string {
  if (val === null || val === undefined || val === '') return '0.00'
  const num = typeof val === 'number' ? val : parseFloat(val)
  if (isNaN(num)) return '0.00'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

export function formatPercent(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0.0%'
  const num = typeof val === 'number' ? val : parseFloat(val)
  if (isNaN(num)) return '0.0%'
  // If decimal fraction e.g. 0.002 -> 0.2%
  const percentage = num < 1 && num > 0 ? num * 100 : num
  return `${percentage.toFixed(2)}%`
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function truncateText(str: string | null | undefined, start: number = 6, end: number = 4): string {
  if (!str) return '—'
  if (str.length <= start + end) return str
  return `${str.slice(0, start)}...${str.slice(-end)}`
}
