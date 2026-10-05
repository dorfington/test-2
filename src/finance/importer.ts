/**
 * Import pipeline: file text -> parsed statement -> new, categorized,
 * de-duplicated transactions ready to store.
 */
import { categorize, cleanPayee } from './categorize'
import { looksLikeOfx, parseOfxStatement } from './parse/ofx'
import { parseCsvStatement } from './parse/csv'
import { normDesc } from './parse/util'
import type { Account, AccountKind, Balance, FinanceData, ImportRecord, ParsedStatement, RawTxn, Transaction } from './types'

/** Parses CSV or OFX/QFX text. (PDFs go through readPdfStatement in pdfImport.ts.) */
export function parseStatementText(text: string, fileName: string, accountKind: AccountKind): ParsedStatement {
  if (looksLikeOfx(text) || /\.(ofx|qfx|qbo)$/i.test(fileName)) return parseOfxStatement(text)
  return parseCsvStatement(text, accountKind)
}

/**
 * Stable transaction ids. With an OFX FITID the id is exact. Otherwise it is
 * account + date + amount + description + how many identical rows came
 * before it in the same file, so two identical $5 coffees on one day are
 * both kept, and re-importing an overlapping file adds nothing twice.
 */
export function transactionIds(accountId: string, raw: RawTxn[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((t) => {
    if (t.fitid) return `${accountId}|fitid|${t.fitid}`
    const base = `${accountId}|${t.date}|${t.amount.toFixed(2)}|${normDesc(t.description)}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}|${n}`
  })
}

export interface PreparedImport {
  record: ImportRecord
  transactions: Transaction[]
  balance: Balance | null
  /** Rows already imported earlier (same id). */
  skipped: number
}

export function prepareImport(
  parsed: ParsedStatement,
  account: Account,
  data: FinanceData,
  opts: { fileName: string; flipSigns?: boolean; importId: string; now?: Date },
): PreparedImport {
  const raw = parsed.transactions.map((t) => (opts.flipSigns ? { ...t, amount: -t.amount } : t))
  const ids = transactionIds(account.id, raw)
  const existing = new Set(data.transactions.filter((t) => t.accountId === account.id).map((t) => t.id))
  const fresh: Transaction[] = []
  let skipped = 0
  raw.forEach((t, i) => {
    if (existing.has(ids[i])) {
      skipped++
      return
    }
    existing.add(ids[i])
    const payee = cleanPayee(t.description)
    const c = categorize(t.description, payee, t.amount, account.kind, data.rules)
    fresh.push({ id: ids[i], accountId: account.id, date: t.date, description: t.description, payee, amount: Math.round(t.amount * 100) / 100, ...c, importId: opts.importId })
  })
  const dates = raw.map((t) => t.date).sort()
  return {
    record: {
      id: opts.importId,
      accountId: account.id,
      fileName: opts.fileName,
      format: parsed.format,
      importedAt: (opts.now ?? new Date()).toISOString(),
      added: fresh.length,
      skipped,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
    },
    transactions: fresh,
    balance: parsed.balance ? { accountId: account.id, date: parsed.balance.date, balance: parsed.balance.amount } : null,
    skipped,
  }
}

/** Adds a prepared import to the data set (pure). Newer balances for the same date replace older ones. */
export function applyImport(data: FinanceData, p: PreparedImport): FinanceData {
  const balances = p.balance
    ? [...data.balances.filter((b) => !(b.accountId === p.balance!.accountId && b.date === p.balance!.date)), p.balance]
    : data.balances
  return {
    ...data,
    transactions: [...data.transactions, ...p.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    balances,
    imports: [...data.imports, p.record],
  }
}

/** Removes an import and the transactions it added. */
export function undoImport(data: FinanceData, importId: string): FinanceData {
  return {
    ...data,
    transactions: data.transactions.filter((t) => t.importId !== importId),
    imports: data.imports.filter((i) => i.id !== importId),
  }
}
