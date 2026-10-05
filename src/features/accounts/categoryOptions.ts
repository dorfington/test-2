import { CATEGORIES, CATEGORY_LABELS, EXPENSE_KIND_KEYS, EXPENSE_KINDS, type ExpenseKind } from '../../model/profile'
import type { CategoryChoice } from '../../finance/edit'
import type { Transaction } from '../../finance/types'

/** Select value for a transaction's category: "kind:<kind>", "income", "transfer" or "uncategorized". */
export function choiceValue(t: Pick<Transaction, 'type' | 'kind'>): string {
  if (t.type === 'income') return 'income'
  if (t.type === 'transfer') return 'transfer'
  return t.kind ? `kind:${t.kind}` : 'uncategorized'
}

export function choiceFromValue(value: string, amount: number): CategoryChoice {
  if (value === 'income') return { type: 'income', kind: null }
  if (value === 'transfer') return { type: 'transfer', kind: null }
  const kind = value.startsWith('kind:') ? (value.slice(5) as ExpenseKind) : null
  return { type: amount > 0 ? 'refund' : 'expense', kind }
}

export const CATEGORY_OPTIONS: { value: string; label: string; group?: string }[] = [
  ...CATEGORIES.flatMap((c) =>
    EXPENSE_KIND_KEYS.filter((k) => EXPENSE_KINDS[k].category === c && k !== 'other').map((k) => ({ value: `kind:${k}`, label: EXPENSE_KINDS[k].label, group: CATEGORY_LABELS[c] })),
  ),
  { value: 'kind:other', label: 'Other', group: 'Needs' },
  { value: 'income', label: 'Income', group: 'Not spending' },
  { value: 'transfer', label: 'Transfer / card payment (ignored)', group: 'Not spending' },
  { value: 'uncategorized', label: 'Uncategorized', group: 'Not spending' },
]

export function categoryLabel(t: Pick<Transaction, 'type' | 'kind'>): string {
  if (t.type === 'income') return 'Income'
  if (t.type === 'transfer') return 'Transfer'
  const base = t.kind ? EXPENSE_KINDS[t.kind].label : 'Uncategorized'
  return t.type === 'refund' ? `${base} (refund)` : base
}
