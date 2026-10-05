import type { FilingStatus, TaxYearData } from '../taxdata'
import { bracketTax, marginalRate } from './brackets'
import type { FederalResult } from './types'

/** Federal income tax on an AGI, with the standard deduction and Child Tax Credit. */
export function federalIncomeTax(
  data: TaxYearData['federal'],
  status: FilingStatus,
  agi: number,
  earnedIncome: number,
  children: number,
): FederalResult {
  const standardDeduction = data.standardDeduction[status]
  const taxableIncome = Math.max(0, agi - standardDeduction)
  const brackets = data.brackets[status]
  const taxBeforeCredits = bracketTax(taxableIncome, brackets)

  const ctc = data.childTaxCredit
  const excess = Math.max(0, agi - ctc.phaseoutStart[status])
  const credit = Math.max(0, children * ctc.perChild - Math.ceil(excess / 1000) * ctc.phaseoutPer1000)
  const nonrefundable = Math.min(credit, taxBeforeCredits)
  const refundable = Math.min(
    credit - nonrefundable,
    children * ctc.refundablePerChild,
    Math.max(0, earnedIncome - ctc.earnedIncomeThreshold) * ctc.refundableEarnedIncomeRate,
  )
  const childTaxCredit = nonrefundable + refundable

  return {
    agi,
    standardDeduction,
    taxableIncome,
    taxBeforeCredits,
    childTaxCredit,
    tax: taxBeforeCredits - childTaxCredit,
    marginalRate: taxableIncome > 0 ? marginalRate(taxableIncome, brackets) : 0,
  }
}
