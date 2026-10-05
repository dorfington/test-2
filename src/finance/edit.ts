/**
 * Edits to stored transactions: recategorizing (optionally remembered as a
 * rule for that merchant) and matching transfer pairs across accounts.
 */
import { EXPENSE_KINDS, type ExpenseKind } from '../model/profile'
import { payeeKey } from './categorize'
import type { FinanceData, Rule, Transaction, TxnType } from './types'

export interface CategoryChoice {
  type: TxnType
  kind: ExpenseKind | null
}

function fields(c: CategoryChoice) {
  const category = c.type === 'expense' || c.type === 'refund' ? (c.kind ? EXPENSE_KINDS[c.kind].category : null) : null
  return { type: c.type, kind: c.type === 'expense' || c.type === 'refund' ? c.kind : null, category }
}

/**
 * Changes one transaction's category. With `remember`, also saves a rule for
 * the merchant and applies it to every other transaction from that merchant,
 * except ones you set by hand.
 */
export function recategorize(data: FinanceData, txnId: string, choice: CategoryChoice, remember: boolean): FinanceData {
  const target = data.transactions.find((t) => t.id === txnId)
  if (!target) return data
  const f = fields(choice)
  const key = payeeKey(target.payee)
  const rules: Rule[] = remember ? [...data.rules.filter((r) => r.payeeKey !== key), { payeeKey: key, ...f }] : data.rules
  const transactions = data.transactions.map((t): Transaction => {
    if (t.id === txnId) return { ...t, ...f, categorizedBy: 'user' }
    if (remember && t.categorizedBy !== 'user' && payeeKey(t.payee) === key) {
      // Refunds stay refunds (in the same category) when a merchant's purchases are re-labeled.
      const type = f.type === 'expense' && t.amount > 0 ? 'refund' : f.type
      return { ...t, ...f, type, categorizedBy: 'rule' }
    }
    return t
  })
  return { ...data, rules, transactions }
}

/** Forgets a learned rule (transactions keep their current categories). */
export const forgetRule = (data: FinanceData, key: string): FinanceData => ({ ...data, rules: data.rules.filter((r) => r.payeeKey !== key) })

const DAY = 86_400_000
const PAYMENTISH = /payment|pymt|pmt|autopay|transfer|xfer|thank you|epay/i

/**
 * Marks matching money movements between your own accounts as transfers:
 * the same amount leaving one account and arriving in another within 4 days,
 * when at least one side already looks like a payment or transfer. This
 * catches card payments whose bank wording the rules didn't recognize.
 */
export function linkTransfers(data: FinanceData): FinanceData {
  const kindOf = new Map(data.accounts.map((a) => [a.id, a.kind]))
  const used = new Set<string>()
  const toTransfer = new Set<string>()
  const outflows = data.transactions.filter((t) => t.amount < 0 && t.categorizedBy !== 'user')
  const inflows = data.transactions.filter((t) => t.amount > 0 && t.categorizedBy !== 'user')
  for (const out of outflows) {
    const match = inflows.find(
      (inn) =>
        !used.has(inn.id) &&
        inn.accountId !== out.accountId &&
        Math.abs(inn.amount + out.amount) < 0.005 &&
        Math.abs(Date.parse(inn.date) - Date.parse(out.date)) <= 4 * DAY &&
        (PAYMENTISH.test(out.description) || PAYMENTISH.test(inn.description) || out.type === 'transfer' || inn.type === 'transfer') &&
        (kindOf.get(inn.accountId) === 'credit' || kindOf.get(out.accountId) !== 'credit'),
    )
    if (!match) continue
    used.add(match.id)
    // Moving money into savings or investing from checking is saving: keep the outflow as savings, ignore the inflow.
    if (out.type === 'expense' && out.category === 'savings') toTransfer.add(match.id)
    else {
      toTransfer.add(out.id)
      toTransfer.add(match.id)
    }
  }
  if (!toTransfer.size) return data
  return {
    ...data,
    transactions: data.transactions.map((t) => (toTransfer.has(t.id) && t.type !== 'transfer' ? { ...t, type: 'transfer', category: null, kind: null, categorizedBy: 'auto' } : t)),
  }
}
