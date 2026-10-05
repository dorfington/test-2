import type { TaxInput } from '../engine'
import {
  PERIODS_PER_YEAR,
  type DeductionFrequency,
  type ExpenseFrequency,
  type PayFrequency,
  type Profile,
} from './profile'

const EXPENSE_PER_YEAR: Record<ExpenseFrequency, number> = { weekly: 52, monthly: 12, yearly: 1 }

export const annualize = (amount: number, frequency: ExpenseFrequency) => amount * EXPENSE_PER_YEAR[frequency]

export function annualDeduction(amount: number, frequency: DeductionFrequency, pay: PayFrequency): number {
  if (frequency === 'paycheck') return amount * PERIODS_PER_YEAR[pay]
  return frequency === 'monthly' ? amount * 12 : amount
}

export function annualGross(income: Profile['income']): number {
  return income.payType === 'salary' ? income.annualSalary : income.hourlyRate * income.hoursPerWeek * 52
}

/** Optional "what if" adjustments applied on top of the saved profile (never persisted). */
export interface WhatIf {
  /** Replaces the user's annual gross pay. */
  annualGross?: number
  /** Replaces the monthly total of housing expenses. */
  monthlyHousing?: number
  /** Replaces the 401(k)/403(b) contribution percent. */
  retirementPercent?: number
}

export function toTaxInput(p: Profile, w: WhatIf = {}): TaxInput | null {
  if (!p.taxes.state) return null
  const gross = w.annualGross ?? annualGross(p.income)
  const pay = p.income.payFrequency
  const retirementPercent = w.retirementPercent ?? p.deductions.retirementPercent
  const married = p.taxes.filingStatus === 'married'
  return {
    year: p.taxes.year,
    filingStatus: p.taxes.filingStatus,
    state: p.taxes.state,
    localityId: p.taxes.localityId,
    customLocalRate: p.taxes.customLocalRatePercent / 100,
    dependents: p.taxes.dependents,
    includeStatePayroll: p.taxes.includeStatePayroll,
    earners: [
      {
        wages: gross,
        retirement: (gross * retirementPercent) / 100,
        section125: annualDeduction(p.deductions.healthInsurance.amount, p.deductions.healthInsurance.frequency, pay),
        hsa: annualDeduction(p.deductions.hsa.amount, p.deductions.hsa.frequency, pay),
      },
      ...(married && p.taxes.spouseIncome > 0
        ? [{ wages: p.taxes.spouseIncome, retirement: (p.taxes.spouseIncome * p.taxes.spouseRetirementPercent) / 100, section125: 0, hsa: 0 }]
        : []),
    ],
  }
}

/** Splits an annual amount into year / month / paycheck. */
export function periods(annual: number, pay: PayFrequency) {
  return { year: annual, month: annual / 12, paycheck: annual / PERIODS_PER_YEAR[pay] }
}
