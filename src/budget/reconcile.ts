/**
 * Your paycheck as estimated, line by line, and how it compares with the
 * take-home pay you actually get. When an actual figure is entered the
 * budget uses it, and this explains the gap so it can be fixed at the
 * source (a missing deduction, different withholding).
 */
import { calculateTaxes, type TaxResult } from '../engine'
import { toTaxInput } from '../model/derive'
import { PERIODS_PER_YEAR, type Profile } from '../model/profile'

export type PaycheckLineId = 'gross' | 'retirement' | 'health' | 'hsa' | 'federal' | 'fica' | 'state' | 'local' | 'payroll'

/** One line of a paycheck: gross is positive, deductions negative. */
export interface PaycheckLine {
  id: PaycheckLineId
  name: string
  amount: number
}

export interface PaycheckEstimate {
  lines: PaycheckLine[]
  /** Estimated take-home per paycheck (your pay only). */
  net: number
}

export interface GapItem {
  name: string
  /** Effect on take-home per paycheck: positive means your actual pay is higher than estimated. */
  amount: number
}

export interface Reconciliation {
  estimate: PaycheckEstimate
  actual: number
  /** actual - estimated, per paycheck. */
  diff: number
  /** Parts of the gap explained by the tax actually withheld (read from your pay stub). */
  explained: GapItem[]
  /** What's left: usually deductions on the stub that aren't entered here. */
  unexplained: number
  /** Household take-home per year using your actual pay (a spouse's pay stays estimated). */
  householdAnnual: number
}

/** Below this many dollars per paycheck a gap is treated as rounding. */
export const GAP_TOLERANCE = 1

/**
 * Your paycheck as estimated. With a spouse on a joint return, income taxes
 * are shared by each person's share of wages; Social Security, Medicare and
 * state payroll programs are worked out on your pay alone.
 */
export function estimatePaycheck(profile: Profile, tax: TaxResult): PaycheckEstimate | null {
  const input = toTaxInput(profile)
  if (!input) return null
  const n = PERIODS_PER_YEAR[profile.income.payFrequency]
  const me = input.earners[0]
  const totalWages = input.earners.reduce((s, e) => s + e.wages, 0)
  const share = input.earners.length > 1 && totalWages > 0 ? me.wages / totalWages : 1
  const mine = input.earners.length > 1 ? calculateTaxes({ ...input, earners: [me] }) : tax

  const per = (annual: number) => annual / n
  const lines: PaycheckLine[] = [{ id: 'gross', name: 'Gross pay', amount: per(me.wages) }]
  const add = (id: PaycheckLineId, name: string, annual: number, show = annual !== 0) => {
    if (show) lines.push({ id, name, amount: -per(annual) })
  }
  add('retirement', '401(k) / 403(b)', me.retirement)
  add('health', 'Health insurance (pre-tax)', me.section125)
  add('hsa', 'HSA / FSA', me.hsa)
  add('federal', 'Federal income tax', tax.federal.tax * share, true)
  add('fica', 'Social Security & Medicare', mine.fica.total, true)
  add('state', `${tax.state.name} income tax`, tax.state.tax * share, tax.state.hasIncomeTax)
  if (tax.local) add('local', tax.local.name, tax.local.tax * share, true)
  add('payroll', mine.statePayroll.map((i) => i.name).join(', ') || 'State payroll programs', mine.statePayrollTotal)
  return { lines, net: lines.reduce((s, l) => s + l.amount, 0) }
}

export function reconcile(profile: Profile, tax: TaxResult): Reconciliation | null {
  const actual = profile.income.netPerPaycheck
  if (actual === null) return null
  const estimate = estimatePaycheck(profile, tax)
  if (!estimate) return null
  const n = PERIODS_PER_YEAR[profile.income.payFrequency]
  const diff = actual - estimate.net

  const explained: GapItem[] = []
  const w = profile.withholding
  if (w) {
    const line = (id: PaycheckLineId) => estimate.lines.find((l) => l.id === id)
    const compare = (id: PaycheckLineId, withheld: number | null, fallbackName: string) => {
      if (withheld === null) return
      const l = line(id)
      const amount = -(l?.amount ?? 0) - withheld
      if (Math.abs(amount) >= 0.5) explained.push({ name: l?.name ?? fallbackName, amount })
    }
    compare('federal', w.federalPerPaycheck, 'Federal income tax')
    compare('state', w.statePerPaycheck, 'State income tax')
    compare('local', w.localPerPaycheck, 'Local income tax')
  }
  const unexplained = diff - explained.reduce((s, g) => s + g.amount, 0)

  // Spouse's take-home stays as estimated.
  const householdAnnual = actual * n + (tax.net - estimate.net * n)
  return { estimate, actual, diff, explained, unexplained, householdAnnual }
}
