/**
 * PDF statements (best effort). Text comes from pdf.js (see paystub/lines.ts),
 * one printed row per line. Statements list rows like
 *   "09/14  NETFLIX.COM 866-579-7172 CA            15.49"
 *   "09/14 09/15  SHELL OIL 57444  AUSTIN TX     42.10"
 *   "09/15  Payroll ACME CORP DIR DEP  2,692.31  4,812.55"   (amount, running balance)
 * Signs come from the section a row is in ("Deposits and additions",
 * "Purchases", "Payments and other credits"...) or an explicit minus/CR.
 */
import type { AccountKind, ParsedStatement, RawTxn } from '../types'
import { parseMoney } from './util'

const MONEY = String.raw`\(?-?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?(?:\s?CR)?`
const ROW = new RegExp(String.raw`^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+)?(.+?)\s+(${MONEY})(?:\s+(${MONEY}))?\s*$`, 'i')

const INFLOW = /\b(deposits?|additions|credits?|payments?(,| and)?\s*(other\s*)?credits?|refunds?|returns?)\b/i
const OUTFLOW = /\b(withdrawals?|subtractions|debits?|purchases?|checks?\s*paid|fees?|interest\s*charge[ds]?|card\s*(transactions|purchases)|atm|electronic\s*payments?|other\s*charges)\b/i
const SKIP = /\b(total|subtotal|balance|minimum payment|payment due|previous|beginning|ending|closing|opening|new balance|available|credit limit|summary)\b/i

/** Year for an MM/DD row, using the statement period so Dec->Jan statements get the right years. */
function yearFor(month: number, period: { start: string; end: string } | null, fallbackYear: number): number {
  if (!period) return fallbackYear
  const startY = Number(period.start.slice(0, 4))
  const endY = Number(period.end.slice(0, 4))
  if (startY === endY) return endY
  return month >= Number(period.start.slice(5, 7)) ? startY : endY
}

function findPeriod(lines: string[]): { start: string; end: string } | null {
  const date = String.raw`(\d{1,2})\/(\d{1,2})\/(\d{2,4})`
  const words = String.raw`([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})`
  for (const l of lines) {
    let m = l.match(new RegExp(`${date}\\s*(?:-|–|to|through|thru)\\s*${date}`, 'i'))
    if (m) {
      const y = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s))
      const iso = (yy: number, mo: string, d: string) => `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
      return { start: iso(y(m[3]), m[1], m[2]), end: iso(y(m[6]), m[4], m[5]) }
    }
    m = l.match(new RegExp(`${words}\\s*(?:-|–|to|through|thru)\\s*${words}`, 'i'))
    if (m) {
      const mon = (s: string) => String(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase()) + 1)
      if (mon(m[1]) !== '0' && mon(m[4]) !== '0') {
        const iso = (yy: string, mo: string, d: string) => `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
        return { start: iso(m[3], mon(m[1]), m[2]), end: iso(m[6], mon(m[4]), m[5]) }
      }
    }
  }
  return null
}

export function parsePdfStatementText(lines: string[], accountKind: AccountKind, now = new Date()): ParsedStatement {
  const warnings: string[] = []
  const period = findPeriod(lines)
  const isCard = accountKind === 'credit' || lines.slice(0, 40).some((l) => /credit card|card ending|account ending in \d{4}.*(visa|mastercard|amex|discover)|minimum payment due/i.test(l))
  const kind: AccountKind = accountKind === 'other' && isCard ? 'credit' : accountKind
  let section: 'in' | 'out' | null = null
  const txns: RawTxn[] = []

  for (const line of lines) {
    const row = line.match(ROW)
    if (!row) {
      // A heading without amounts switches the section.
      if (line.length < 80 && !/\d\.\d{2}/.test(line)) {
        if (INFLOW.test(line) && !OUTFLOW.test(line)) section = 'in'
        else if (OUTFLOW.test(line)) section = 'out'
      }
      continue
    }
    const [, mo, d, yRaw, descRaw, amtRaw] = row
    const description = descRaw.replace(/\s+/g, ' ').trim()
    if (SKIP.test(description)) continue
    const month = Number(mo)
    const year = yRaw ? (yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw)) : yearFor(month, period, now.getFullYear())
    const date = `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    const value = parseMoney(amtRaw)
    if (value === null || value === 0) continue
    const explicitNeg = value < 0
    let amount: number
    if (kind === 'credit') {
      // On card statements, purchases are positive and payments/credits are negative or marked CR.
      const credit = explicitNeg || section === 'in' || /payment|thank you|credit/i.test(description)
      amount = credit ? Math.abs(value) : -Math.abs(value)
    } else if (explicitNeg) amount = value
    else if (section === 'in') amount = Math.abs(value)
    else if (section === 'out') amount = -Math.abs(value)
    else amount = /deposit|payroll|dir dep|transfer from|interest paid|refund/i.test(description) ? Math.abs(value) : -Math.abs(value)
    txns.push({ date, description, amount })
  }

  let balance: ParsedStatement['balance']
  for (const l of lines) {
    const m = l.match(new RegExp(String.raw`\b(ending|closing|new)\s+balance\b[^\d(-]*(${MONEY})`, 'i'))
    if (m) {
      const v = parseMoney(m[2])
      if (v !== null) balance = { date: period?.end ?? txns.map((t) => t.date).sort().pop() ?? now.toISOString().slice(0, 10), amount: kind === 'credit' ? -Math.abs(v) : v }
      break
    }
  }

  if (!period) warnings.push("The statement period wasn't found, so years were assumed. Check the dates.")
  if (!txns.length) warnings.push('No transactions were recognized. Download a CSV or OFX/QFX from your bank instead; those import exactly.')
  else warnings.push('PDF statements are read best-effort. Check the preview, especially money in vs. out.')
  const last4 = lines.slice(0, 40).join(' ').match(/(?:account|card)\s*(?:number|ending|ending in|#)?[^\d]{0,12}(?:x|\*|\.){2,}\s*(\d{4})|ending in\s*(\d{4})/i)
  return {
    format: 'pdf',
    transactions: txns,
    balance,
    suggestedKind: isCard ? 'credit' : undefined,
    last4: last4?.[1] ?? last4?.[2],
    signsInferred: true,
    warnings,
  }
}
