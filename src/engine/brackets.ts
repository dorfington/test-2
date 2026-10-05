import type { Bracket, FilingStatus } from '../taxdata'

/** Tax on `income` under marginal brackets. */
export function bracketTax(income: number, brackets: Bracket[]): number {
  if (income <= 0) return 0
  let tax = 0
  for (let i = 0; i < brackets.length; i++) {
    const lo = brackets[i].over
    if (income <= lo) break
    const hi = i + 1 < brackets.length ? brackets[i + 1].over : Infinity
    tax += (Math.min(income, hi) - lo) * brackets[i].rate
  }
  return tax
}

/** Index of the bracket that contains `income` (the last bracket whose `over` is below it). */
export function bracketIndex(income: number, brackets: Bracket[]): number {
  let k = 0
  for (let i = 0; i < brackets.length; i++) if (income > brackets[i].over) k = i
  return k
}

export function marginalRate(income: number, brackets: Bracket[]): number {
  return brackets[bracketIndex(income, brackets)].rate
}

type MaybeHoh<T> = { single: T; married: T; headOfHousehold?: T }

/**
 * Picks the value for a filing status. When a head-of-household value is
 * missing, falls back to `hohUses` (default single) and reports it.
 */
export function pick<T>(
  values: MaybeHoh<T>,
  status: FilingStatus,
  hohUses: 'single' | 'married' = 'single',
): { value: T; fellBack: boolean } {
  if (status !== 'headOfHousehold') return { value: values[status], fellBack: false }
  if (values.headOfHousehold !== undefined) return { value: values.headOfHousehold, fellBack: false }
  return { value: values[hohUses], fellBack: true }
}

/** Linear phase-out from `amount` (at AGI <= start) down to `floor` (at AGI >= end). */
export function phaseOut(amount: number, agi: number, start: number, end: number, floor = 0): number {
  const lo = Math.min(amount, floor)
  if (agi <= start) return amount
  if (agi >= end || end <= start) return lo
  return lo + (amount - lo) * (1 - (agi - start) / (end - start))
}
