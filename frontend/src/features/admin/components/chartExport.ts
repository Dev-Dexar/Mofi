/** Saving numbers from the admin panel: a file made in the browser, nothing leaves it. */

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Rows to delimited text. A field with the delimiter, a quote or a line break is quoted; a leading =, +, - or @ is defused so a spreadsheet will not run it. */
export function toDelimited(rows: (string | number)[][], sep: ',' | '\t'): string {
  const cell = (v: string | number) => {
    let s = String(v)
    if (typeof v === 'string' && /^[=+@]|^-(?!\d)/.test(s)) s = `'${s}`
    return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(cell).join(sep)).join('\r\n')
}
