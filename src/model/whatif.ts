import { annualize, type WhatIf } from './derive'
import { makeExpense, type Profile } from './profile'

/** Writes "what if" values into the profile so they become the saved plan. */
export function applyWhatIf(p: Profile, w: WhatIf): Profile {
  const next = structuredClone(p)
  if (w.annualGross !== undefined) {
    if (next.income.payType === 'hourly' && next.income.hoursPerWeek > 0) {
      next.income.hourlyRate = Math.round((w.annualGross / (next.income.hoursPerWeek * 52)) * 100) / 100
    } else {
      next.income.payType = 'salary'
      next.income.annualSalary = w.annualGross
    }
  }
  if (w.retirementPercent !== undefined) next.deductions.retirementPercent = w.retirementPercent
  if (w.monthlyHousing !== undefined) {
    const housing = next.expenses.filter((e) => e.kind === 'housing')
    const current = housing.reduce((s, e) => s + annualize(e.amount, e.frequency) / 12, 0)
    if (housing.length === 0) {
      next.expenses.unshift(makeExpense('housing', { amount: w.monthlyHousing }))
    } else {
      for (const e of housing) {
        const share = current > 0 ? annualize(e.amount, e.frequency) / 12 / current : 1 / housing.length
        e.amount = Math.round(w.monthlyHousing * share * 100) / 100
        e.frequency = 'monthly'
      }
    }
  }
  return next
}
