/**
 * Compares tax withheld from paychecks (read from a pay stub) with the
 * estimated tax for the year, to flag a likely refund or balance due.
 */
import type { TaxResult } from '../engine'
import { PERIODS_PER_YEAR, type Profile } from '../model/profile'

export interface WithholdingRow {
  name: string
  /** Annual amount withheld at this paycheck's rate. */
  withheld: number
  /** Estimated annual tax. */
  owed: number
  /** withheld - owed: positive means a refund, negative means you'd owe. */
  diff: number
}

export interface WithholdingCheck {
  rows: WithholdingRow[]
  total: WithholdingRow
  verdict: 'refund' | 'owe' | 'close'
  notes: string[]
}

/** Within this many dollars a year we call withholding "about right". */
export const CLOSE_ENOUGH = 300

export function withholdingCheck(profile: Profile, tax: TaxResult): WithholdingCheck | null {
  const w = profile.withholding
  if (!w) return null
  const n = PERIODS_PER_YEAR[profile.income.payFrequency]
  const skipped: string[] = []
  const rows: WithholdingRow[] = []
  const add = (name: string, perPaycheck: number | null, owed: number, applies: boolean) => {
    if (perPaycheck === null) {
      if (applies) skipped.push(name)
      return
    }
    if (!applies && perPaycheck === 0) return
    rows.push({ name, withheld: perPaycheck * n, owed, diff: perPaycheck * n - owed })
  }
  add('Federal income tax', w.federalPerPaycheck, tax.federal.tax, true)
  add(`${tax.state.name} income tax`, w.statePerPaycheck, tax.state.tax, tax.state.hasIncomeTax)
  add(tax.local ? tax.local.name : 'Local income tax', w.localPerPaycheck, tax.local?.tax ?? 0, !!tax.local)
  if (rows.length === 0) return null
  const total = rows.reduce((t, r) => ({ name: 'Total', withheld: t.withheld + r.withheld, owed: t.owed + r.owed, diff: t.diff + r.diff }), { name: 'Total', withheld: 0, owed: 0, diff: 0 })

  const notes = ['Assumes every paycheck this year withholds the same as the one you scanned.']
  if (skipped.length) notes.unshift(`${skipped.join(' and ')} withholding wasn't read from your pay stub, so it's left out of this comparison.`)
  if (profile.taxes.filingStatus === 'married' && profile.taxes.spouseIncome > 0) {
    notes.unshift("Your spouse's withholding isn't included, so the estimate covers both incomes but only your paychecks. Add their withholding mentally before acting.")
  }
  const verdict = total.diff > CLOSE_ENOUGH ? 'refund' : total.diff < -CLOSE_ENOUGH ? 'owe' : 'close'
  if (verdict !== 'close') {
    notes.push(
      verdict === 'owe'
        ? 'To avoid a bill, you can ask for extra withholding on a new Form W-4 (Step 4(c)) and your state form.'
        : 'A big refund means a smaller paycheck all year; you can update your W-4 to take home more now.',
    )
  }
  return { rows, total, verdict, notes }
}
