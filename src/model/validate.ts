import type { Profile } from './profile'
import { annualGross } from './derive'

export type StepId = 'income' | 'taxes' | 'expenses'
export type Errors = Record<string, string>

export function validateIncome(p: Profile): Errors {
  const e: Errors = {}
  const i = p.income
  if (i.payType === 'salary') {
    if (!(i.annualSalary > 0)) e.annualSalary = 'Enter your annual salary.'
  } else {
    if (!(i.hourlyRate > 0)) e.hourlyRate = 'Enter your hourly rate.'
    if (!(i.hoursPerWeek > 0)) e.hoursPerWeek = 'Enter hours per week.'
    else if (i.hoursPerWeek > 100) e.hoursPerWeek = 'That is more than 100 hours a week. Check the number.'
  }
  return e
}

export function validateTaxes(p: Profile): Errors {
  const e: Errors = {}
  const t = p.taxes
  const d = p.deductions
  if (!t.state) e.state = 'Choose your state.'
  if (t.localityId === 'custom' && !(t.customLocalRatePercent > 0)) e.customLocalRatePercent = 'Enter your local tax rate.'
  if (d.retirementPercent > 75) e.retirementPercent = 'Retirement contributions above 75% of pay are unusual. Check the number.'
  const gross = annualGross(p.income)
  if (gross > 0 && (gross * d.retirementPercent) / 100 > gross) e.retirementPercent = 'Contributions cannot exceed your pay.'
  return e
}

export function validateExpenses(p: Profile): Errors {
  const e: Errors = {}
  p.expenses.forEach((x) => {
    if (!x.name.trim()) e[`expense-${x.id}`] = 'Give this expense a name.'
  })
  const s = p.goals.savings
  if (s.target > 0 && s.deadline && Number.isNaN(Date.parse(s.deadline))) e.savingsDeadline = 'Enter a valid date.'
  return e
}

export const VALIDATORS: Record<StepId, (p: Profile) => Errors> = {
  income: validateIncome,
  taxes: validateTaxes,
  expenses: validateExpenses,
}

export const isStepValid = (step: StepId, p: Profile) => Object.keys(VALIDATORS[step](p)).length === 0
