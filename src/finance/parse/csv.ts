/**
 * CSV transaction exports. Banks disagree on almost everything, so columns
 * are found by header name, and signs are normalized so money out is negative:
 *
 * | Issuer        | Columns                                   | Purchases |
 * | Chase card    | Transaction Date, Description, Type, Amount | negative |
 * | Chase bank    | Details, Posting Date, Description, Amount, Balance | negative |
 * | Amex          | Date, Description, Amount                  | positive  |
 * | Capital One   | Transaction Date, Card No., Description, Debit, Credit | Debit column |
 * | Discover      | Trans. Date, Description, Amount           | positive  |
 * | Bank of America | (summary lines) Date, Description, Amount, Running Bal. | negative |
 * | Citi          | Status, Date, Description, Debit, Credit   | Debit column |
 * | Wells Fargo   | no header: date, amount, *, , description  | negative  |
 * | Apple Card    | Transaction Date, Description, Type, Amount (USD) | positive |
 */
import type { AccountKind, ParsedStatement, RawTxn } from '../types'
import { parseDate, parseMoney } from './util'

/** RFC 4180-ish CSV: quotes, escaped quotes, commas and newlines inside quotes, BOM, CRLF. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const find = (header: string[], names: RegExp) => header.findIndex((h) => names.test(h.trim().toLowerCase()))

interface Columns {
  date: number
  description: number
  amount: number
  debit: number
  credit: number
  balance: number
  type: number
  card: number
}

function columnsFor(header: string[]): Columns | null {
  const h = header.map((x) => x.trim().toLowerCase())
  const date = [/^transaction date$|^trans\.? date$/, /^date$/, /^posting date$|^post(ed)? date$/].map((re) => find(h, re)).find((i) => i >= 0) ?? -1
  const description = [/^description$|^original description$/, /^payee$|^merchant$|^name$/, /^memo$/].map((re) => find(h, re)).find((i) => i >= 0) ?? -1
  const cols: Columns = {
    date,
    description,
    amount: find(h, /^(transaction )?amount( \(usd\))?$/),
    debit: find(h, /^(debit|withdrawals?|debit amount|withdrawal amount)$/),
    credit: find(h, /^(credit|deposits?|credit amount|deposit amount)$/),
    balance: find(h, /^(balance|running bal\.?|running balance)$/),
    type: find(h, /^(type|transaction type|details)$/),
    card: find(h, /^card no\.?$|^card number$|^account number$/),
  }
  if (cols.date < 0 || cols.description < 0 || (cols.amount < 0 && cols.debit < 0 && cols.credit < 0)) return null
  return cols
}

export function parseCsvStatement(text: string, accountKind: AccountKind): ParsedStatement {
  const rows = parseCsvRows(text)
  const warnings: string[] = []

  // Header may follow summary lines (Bank of America); Wells Fargo has none.
  let headerIdx = rows.findIndex((r) => columnsFor(r) !== null)
  let cols: Columns | null = headerIdx >= 0 ? columnsFor(rows[headerIdx]) : null
  if (!cols && rows.length && parseDate(rows[0][0] ?? '') && parseMoney(rows[0][1] ?? '') !== null) {
    headerIdx = -1
    cols = { date: 0, amount: 1, description: rows[0].length - 1, debit: -1, credit: -1, balance: -1, type: -1, card: -1 }
  }
  if (!cols) {
    return { format: 'csv', transactions: [], signsInferred: false, warnings: ["Couldn't find date, description and amount columns in this CSV."] }
  }

  const txns: RawTxn[] = []
  const types: string[] = []
  let last4: string | undefined
  let latest: { date: string; amount: number } | undefined
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDate(r[cols.date] ?? '')
    if (!date) continue
    let amount: number | null
    if (cols.amount >= 0) amount = parseMoney(r[cols.amount] ?? '')
    else {
      const debit = Math.abs(parseMoney(r[cols.debit] ?? '') ?? 0)
      const credit = Math.abs(parseMoney(r[cols.credit] ?? '') ?? 0)
      amount = credit - debit
    }
    if (amount === null || amount === 0) continue
    const description = (r[cols.description] ?? '').replace(/\s+/g, ' ').trim()
    txns.push({ date, description, amount })
    types.push(cols.type >= 0 ? (r[cols.type] ?? '').toLowerCase() : '')
    if (cols.card >= 0 && !last4) last4 = (r[cols.card] ?? '').match(/(\d{4})\s*$/)?.[1]
    if (cols.balance >= 0) {
      const bal = parseMoney(r[cols.balance] ?? '')
      if (bal !== null && (!latest || date >= latest.date)) latest = { date, amount: bal }
    }
  }

  // Credit cards: purchases must be negative. Some issuers export them as positive numbers.
  let signsInferred = false
  if (accountKind === 'credit' && cols.amount >= 0 && txns.length) {
    const isPayment = (t: RawTxn, i: number) => /payment|autopay|thank you/i.test(t.description) || /payment/.test(types[i])
    const purchases = txns.filter((t, i) => !isPayment(t, i))
    const positive = purchases.filter((t) => t.amount > 0).length
    if (positive > purchases.length / 2) {
      for (const t of txns) t.amount = -t.amount
      signsInferred = true
    }
  }
  if (accountKind !== 'credit' && txns.length > 3 && txns.every((t) => t.amount > 0)) {
    warnings.push("Every amount in this file is positive, so money in and out can't be told apart. Check the signs in the preview.")
    signsInferred = true
  }

  return { format: 'csv', transactions: txns, balance: latest, last4, signsInferred, warnings }
}
