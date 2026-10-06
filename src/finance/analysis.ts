/**
 * Analysis of imported transactions: monthly totals, actual vs. budget,
 * averages for filling in the budget, recurring charges and goal progress
 * from real balances. Pure functions over FinanceData.
 *
 * Conventions: transfers (including card payments) are ignored; refunds
 * reduce spending in their category; outflows categorized as savings
 * (to savings accounts, brokerages) count as saving, not spending.
 */
import { annualize } from '../model/derive'
import { CATEGORIES, EXPENSE_KINDS, type Category, type ExpenseKind, type Profile } from '../model/profile'
import { payeeKey } from './categorize'
import type { Balance, FinanceData, Transaction } from './types'

export type Bucket = Category | 'uncategorized'

export interface MonthSummary {
  month: string // yyyy-mm
  income: number
  /** Net spending (purchases minus refunds) per bucket, as positive numbers. */
  spending: Record<Bucket, number>
  /** Net spending per expense kind ('other' and uncategorized included under their keys). */
  byKind: Partial<Record<ExpenseKind | 'uncategorized', number>>
  /** needs + wants + uncategorized */
  totalSpending: number
  /** Money moved to savings/investing/extra debt payments. */
  saved: number
  /** income - totalSpending - saved */
  net: number
  /** saved / income */
  savingsRate: number | null
  /** True when the imported data covers the whole month. */
  complete: boolean
}

const emptyBuckets = (): Record<Bucket, number> => ({ needs: 0, wants: 0, savings: 0, uncategorized: 0 })
const r2 = (n: number) => Math.round(n * 100) / 100

const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Months fully covered by the data: from the first transaction's month (if it starts by the 5th) to the last (if it reaches the last 3 days). */
export function completeMonths(txns: Transaction[]): Set<string> {
  if (!txns.length) return new Set()
  const dates = txns.map((t) => t.date).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  const out = new Set<string>()
  let m = first.slice(0, 7)
  const end = last.slice(0, 7)
  while (m <= end) {
    const startsInside = m === first.slice(0, 7) ? Number(first.slice(8)) <= 5 : true
    const endsInside = m === end ? Number(last.slice(8)) >= lastDay(m) - 3 : true
    if (startsInside && endsInside) out.add(m)
    const [y, mo] = m.split('-').map(Number)
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  }
  return out
}

export function monthlySummaries(data: FinanceData): MonthSummary[] {
  const complete = completeMonths(data.transactions)
  const by = new Map<string, MonthSummary>()
  for (const t of data.transactions) {
    if (t.type === 'transfer') continue
    const month = t.date.slice(0, 7)
    let s = by.get(month)
    if (!s) {
      s = { month, income: 0, spending: emptyBuckets(), byKind: {}, totalSpending: 0, saved: 0, net: 0, savingsRate: null, complete: complete.has(month) }
      by.set(month, s)
    }
    if (t.type === 'income') {
      s.income += t.amount
      continue
    }
    // expense (negative) or refund (positive): spending goes up by -amount
    const bucket: Bucket = t.category ?? 'uncategorized'
    const kindKey = t.kind ?? 'uncategorized'
    s.spending[bucket] += -t.amount
    s.byKind[kindKey] = (s.byKind[kindKey] ?? 0) - t.amount
  }
  for (const s of by.values()) {
    for (const b of Object.keys(s.spending) as Bucket[]) s.spending[b] = r2(s.spending[b])
    for (const k of Object.keys(s.byKind) as (keyof MonthSummary['byKind'])[]) s.byKind[k] = r2(s.byKind[k]!)
    s.income = r2(s.income)
    s.saved = s.spending.savings
    s.totalSpending = r2(s.spending.needs + s.spending.wants + s.spending.uncategorized)
    s.net = r2(s.income - s.totalSpending - s.saved)
    s.savingsRate = s.income > 0 ? s.saved / s.income : null
  }
  return [...by.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
}

// ---------- actual vs budget ----------

export interface VsRow {
  key: ExpenseKind | 'uncategorized'
  label: string
  category: Bucket
  planned: number
  actual: number
  /** actual - planned (positive = overspent; for savings, positive = saved more). */
  diff: number
}

/** Planned monthly amounts per expense kind from the budget's expense lines. */
export function plannedByKind(profile: Profile): Partial<Record<ExpenseKind, number>> {
  const out: Partial<Record<ExpenseKind, number>> = {}
  for (const e of profile.expenses) out[e.kind] = (out[e.kind] ?? 0) + annualize(e.amount, e.frequency) / 12
  return out
}

export function actualVsBudget(profile: Profile, month: MonthSummary): { rows: VsRow[]; totals: Record<Bucket, { planned: number; actual: number }> } {
  const planned = plannedByKind(profile)
  const keys = new Set<ExpenseKind | 'uncategorized'>([...(Object.keys(planned) as ExpenseKind[]), ...(Object.keys(month.byKind) as (ExpenseKind | 'uncategorized')[])])
  const rows: VsRow[] = [...keys]
    .map((key) => {
      const p = key === 'uncategorized' ? 0 : (planned[key] ?? 0)
      const a = month.byKind[key] ?? 0
      return {
        key,
        label: key === 'uncategorized' ? 'Uncategorized' : EXPENSE_KINDS[key].label,
        category: key === 'uncategorized' ? ('uncategorized' as const) : EXPENSE_KINDS[key].category,
        planned: r2(p),
        actual: r2(a),
        diff: r2(a - p),
      }
    })
    .filter((r) => r.planned > 0.5 || Math.abs(r.actual) > 0.5)
    .sort((a, b) => [...CATEGORIES, 'uncategorized'].indexOf(a.category) - [...CATEGORIES, 'uncategorized'].indexOf(b.category) || b.actual - a.actual)
  const totals = { needs: { planned: 0, actual: 0 }, wants: { planned: 0, actual: 0 }, savings: { planned: 0, actual: 0 }, uncategorized: { planned: 0, actual: 0 } }
  for (const r of rows) {
    totals[r.category].planned = r2(totals[r.category].planned + r.planned)
    totals[r.category].actual = r2(totals[r.category].actual + r.actual)
  }
  return { rows, totals }
}

// ---------- averages for "fill in my budget" ----------

export interface Suggestion {
  kind: ExpenseKind
  /** Average monthly net spending over the complete months. */
  monthly: number
  /** Current planned monthly amount for this kind. */
  planned: number
}

export function suggestBudget(profile: Profile, data: FinanceData): { months: string[]; suggestions: Suggestion[] } {
  const summaries = monthlySummaries(data).filter((s) => s.complete)
  const recent = summaries.slice(-6)
  const planned = plannedByKind(profile)
  if (!recent.length) return { months: [], suggestions: [] }
  const totals: Partial<Record<ExpenseKind, number>> = {}
  for (const s of recent) for (const [k, v] of Object.entries(s.byKind)) if (k !== 'uncategorized') totals[k as ExpenseKind] = (totals[k as ExpenseKind] ?? 0) + v!
  const suggestions = (Object.entries(totals) as [ExpenseKind, number][])
    .map(([kind, total]) => ({ kind, monthly: Math.round(total / recent.length), planned: Math.round(planned[kind] ?? 0) }))
    .filter((s) => s.monthly >= 5)
    .sort((a, b) => b.monthly - a.monthly)
  return { months: recent.map((s) => s.month), suggestions }
}

/** Applies suggestions: one monthly line per kind, replacing existing lines of that kind. */
export function applySuggestions(profile: Profile, chosen: Suggestion[], makeId: () => string): Profile {
  const p = structuredClone(profile)
  for (const s of chosen) {
    const existing = p.expenses.filter((e) => e.kind === s.kind)
    const keep = existing[0]
    p.expenses = p.expenses.filter((e) => e.kind !== s.kind || e === keep)
    if (keep) Object.assign(keep, { amount: s.monthly, frequency: 'monthly' })
    else p.expenses.push({ id: makeId(), kind: s.kind, name: EXPENSE_KINDS[s.kind].label, amount: s.monthly, frequency: 'monthly', category: EXPENSE_KINDS[s.kind].category })
  }
  return p
}

// ---------- recurring charges ----------

export interface Recurring {
  payee: string
  key: string
  cadence: 'weekly' | 'monthly' | 'yearly'
  /** Typical charge (median). */
  amount: number
  /** Monthly equivalent cost. */
  monthly: number
  lastDate: string
  nextDate: string
  count: number
  kind: ExpenseKind | null
  /** Latest charge is higher than the typical one by more than 5% and $1. */
  priceIncrease: { from: number; to: number } | null
  /** Expected charge is more than 10 days overdue: maybe canceled. */
  stale: boolean
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const DAY = 86_400_000
const fixedPrice = (xs: number[]) => xs.length >= 2 && Math.max(...xs) - Math.min(...xs) <= Math.max(0.5, Math.min(...xs) * 0.02)
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * DAY).toISOString().slice(0, 10)

export function findRecurring(data: FinanceData, today = new Date()): Recurring[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of data.transactions) {
    // Charges only: money moved to savings or investments isn't a bill.
    if (t.type !== 'expense' || t.amount >= 0 || t.category === 'savings') continue
    const k = payeeKey(t.payee)
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const lastData = data.transactions.reduce((m, t) => (t.date > m ? t.date : m), '0000-00-00')
  const now = Math.min(today.getTime(), Date.parse(lastData) + 3 * DAY)
  const out: Recurring[] = []
  for (const [key, txns] of groups) {
    if (txns.length < 2) continue
    const sorted = [...txns].sort((a, b) => (a.date < b.date ? -1 : 1))
    const gaps = sorted.slice(1).map((t, i) => (Date.parse(t.date) - Date.parse(sorted[i].date)) / DAY)
    const g = median(gaps)
    const cadence = g >= 5 && g <= 9 ? 'weekly' : g >= 25 && g <= 35 ? 'monthly' : g >= 350 && g <= 380 ? 'yearly' : null
    if (!cadence) continue
    if (cadence !== 'yearly' && sorted.length < 3) continue
    // Regular: most gaps near the typical one, and amounts similar.
    const regular = gaps.filter((x) => Math.abs(x - g) <= Math.max(4, g * 0.2)).length >= gaps.length * 0.7
    const amounts = sorted.map((t) => -t.amount)
    const typical = median(amounts.slice(0, -1).length ? amounts.slice(0, -1) : amounts)
    const similar = amounts.filter((a) => Math.abs(a - typical) <= Math.max(2, typical * 0.25)).length >= amounts.length * 0.7
    if (!regular || !similar) continue
    const last = sorted[sorted.length - 1]
    const latest = -last.amount
    const period = cadence === 'weekly' ? 7 : cadence === 'monthly' ? 30.44 : 365
    const nextDate = addDays(last.date, Math.round(period))
    out.push({
      payee: last.payee,
      key,
      cadence,
      amount: r2(median(amounts)),
      monthly: r2(cadence === 'weekly' ? (median(amounts) * 52) / 12 : cadence === 'monthly' ? median(amounts) : median(amounts) / 12),
      lastDate: last.date,
      nextDate,
      count: sorted.length,
      kind: last.kind,
      // Only for fixed-price charges (subscriptions, plans): earlier charges were all the same amount.
      priceIncrease: fixedPrice(amounts.slice(0, -1)) && latest > typical * 1.05 && latest - typical >= 1 ? { from: r2(typical), to: r2(latest) } : null,
      stale: now - Date.parse(nextDate) > 10 * DAY,
    })
  }
  return out.sort((a, b) => b.monthly - a.monthly)
}

// ---------- balances & goals ----------

export function latestBalance(data: FinanceData, accountId: string): Balance | undefined {
  return data.balances.filter((b) => b.accountId === accountId).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
}

export interface GoalBalances {
  emergencyFund: number | null
  savings: number | null
  /** Amount owed on linked cards (positive). */
  debt: number | null
}

/** Current totals for goals from linked accounts' latest balances (null when no linked account has a balance). */
export function goalBalances(data: FinanceData): GoalBalances {
  const sum = (goal: 'emergencyFund' | 'savings' | 'debt') => {
    const bals = data.accounts.filter((a) => a.goal === goal).map((a) => latestBalance(data, a.id)).filter((b): b is Balance => !!b)
    if (!bals.length) return null
    const total = bals.reduce((s, b) => s + b.balance, 0)
    return r2(goal === 'debt' ? Math.max(0, -total) : total)
  }
  return { emergencyFund: sum('emergencyFund'), savings: sum('savings'), debt: sum('debt') }
}

/** Balance history per account, for the progress chart. */
export function balanceHistory(data: FinanceData): { accountId: string; points: { date: string; balance: number }[] }[] {
  return data.accounts.map((a) => ({
    accountId: a.id,
    points: data.balances.filter((b) => b.accountId === a.id).sort((x, y) => (x.date < y.date ? -1 : 1)).map((b) => ({ date: b.date, balance: b.balance })),
  }))
}

/** Card payments from a bank account with no card account imported: those purchases aren't being counted anywhere. */
export function missingCardAccounts(data: FinanceData): number {
  if (data.accounts.some((a) => a.kind === 'credit')) return 0
  return data.transactions.filter((t) => t.type === 'transfer' && t.amount < 0 && /card|crd|credit|amex|american express|capital one|discover|citi|visa|mastercard|autopay/i.test(t.description)).length
}
