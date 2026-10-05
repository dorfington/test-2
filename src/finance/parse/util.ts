/**
 * Shared helpers for statement parsers: dates and money as banks print them.
 */

/** "$1,234.56", "(12.34)", "-12.34", "12.34-", "−12.34", "12.34 CR" -> signed number, or null. */
export function parseMoney(raw: string): number | null {
  let s = raw.trim().replace(/−/g, '-')
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  if (/\s*CR$/i.test(s)) {
    neg = !neg // "CR" marks a credit on card statements; callers decide the final sign
    s = s.replace(/\s*CR$/i, '')
  }
  if (s.endsWith('-')) {
    neg = !neg
    s = s.slice(0, -1)
  }
  if (s.startsWith('-')) {
    neg = !neg
    s = s.slice(1)
  }
  if (s.startsWith('+')) s = s.slice(1)
  s = s.replace(/^\$/, '').replace(/,/g, '').trim()
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null
  const n = Number(s)
  return neg ? -n : n
}

const pad = (n: number) => String(n).padStart(2, '0')

/** MM/DD/YYYY, M/D/YY, YYYY-MM-DD, YYYYMMDD, "Sep 14, 2026" -> ISO yyyy-mm-dd, or null. */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return valid(y, Number(m[1]), Number(m[2]))
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{4})(\d{2})(\d{2})/)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const mo = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].toLowerCase()) + 1
    return mo ? valid(Number(m[3]), mo, Number(m[2])) : null
  }
  return null
}

function valid(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** Normalizes a description for duplicate detection (case, spacing, punctuation). */
export const normDesc = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
