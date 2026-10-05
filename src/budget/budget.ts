/**
 * Budget math: where take-home pay goes, the 50/30/20 comparison, a
 * personalized target split, problem flags and goal timelines.
 *
 * The 50/30/20 base is take-home pay plus pre-tax payroll deductions
 * (401(k), health premiums, HSA). Those deductions are real needs or
 * savings that never reach your bank account, so leaving them out would
 * understate both. Employer match is extra savings and is not in the base.
 */
import type { TaxResult } from '../engine'
import { annualGross, annualize, type WhatIf } from '../model/derive'
import { type Category, type Expense, type ExpenseKind, type Profile } from '../model/profile'

export interface Allocation {
  id: string
  name: string
  category: Category
  monthly: number
  /** True for payroll deductions (taken before pay reaches you). */
  payroll?: boolean
}

export interface Split {
  needs: number
  wants: number
  savings: number
}

export type Severity = 'bad' | 'warn' | 'info' | 'good'

export interface Recommendation {
  id: string
  severity: Severity
  title: string
  detail: string
}

export interface GoalProgress {
  id: 'emergencyFund' | 'savings' | 'debt'
  name: string
  target: number
  current: number
  remaining: number
  monthlyContribution: number
  /** Months to reach the goal at the current contribution; null if never (no contribution). */
  months: number | null
  /** Debt only: total interest paid at the current payment. */
  totalInterest?: number
  /** Savings goal with a deadline: months left and the monthly amount needed. */
  monthsToDeadline?: number
  requiredMonthly?: number
  onTrack?: boolean
}

export interface Budget {
  /** Monthly take-home pay (after tax and payroll deductions). */
  takeHome: number
  /** Monthly 50/30/20 base: take-home + pre-tax payroll deductions. */
  base: number
  grossMonthly: number
  allocations: Allocation[]
  totals: Split
  /** Monthly expenses paid from take-home pay. */
  spending: number
  /** take-home - spending; negative means overspending. */
  leftover: number
  /** Percent of base (0-100) actually going to each category. */
  actualPct: Split
  standardPct: Split
  targetPct: Split
  targetMonthly: Split
  employerMatchMonthly: number
  housingMonthly: number
  housingShareOfGross: number
  recommendations: Recommendation[]
  goals: GoalProgress[]
}

export const STANDARD_SPLIT: Split = { needs: 50, wants: 30, savings: 20 }

/**
 * Personalized target split. At or under 50% needs it is plain 50/30/20.
 * Above that, needs are taken as they are (they rarely change quickly) and
 * what's left is shared between savings and wants: 40% to savings, at
 * least 10 points of income when there is room, never more than 20.
 */
export function personalizedSplit(needsPct: number): Split {
  if (needsPct <= 50) return { ...STANDARD_SPLIT }
  const needs = Math.min(needsPct, 100)
  const remaining = 100 - needs
  const savings = remaining >= 25 ? Math.min(20, Math.max(10, remaining * 0.4)) : remaining * 0.4
  return { needs, wants: remaining - savings, savings }
}

/** Months to pay off a balance with a fixed monthly payment (null if it never pays off). */
export function payoffMonths(balance: number, aprPercent: number, payment: number): { months: number | null; interest: number } {
  if (balance <= 0) return { months: 0, interest: 0 }
  if (payment <= 0) return { months: null, interest: 0 }
  const r = aprPercent / 100 / 12
  if (r === 0) return { months: Math.ceil(balance / payment), interest: 0 }
  if (payment <= balance * r) return { months: null, interest: 0 }
  const n = -Math.log(1 - (r * balance) / payment) / Math.log(1 + r)
  const months = Math.ceil(n - 1e-9)
  return { months, interest: Math.max(0, payment * n - balance) }
}

const monthly = (e: Expense) => annualize(e.amount, e.frequency) / 12
const sumKinds = (expenses: Expense[], kinds: ExpenseKind[]) => expenses.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + monthly(e), 0)
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/** Applies the "what if" rent override by scaling housing lines to the new monthly total. */
function withHousingOverride(expenses: Expense[], monthlyHousing: number | undefined): Expense[] {
  if (monthlyHousing === undefined) return expenses
  const housing = expenses.filter((e) => e.kind === 'housing')
  const current = housing.reduce((s, e) => s + monthly(e), 0)
  if (housing.length === 0) {
    return [...expenses, { id: 'whatif-housing', kind: 'housing', name: 'Rent / mortgage', amount: monthlyHousing, frequency: 'monthly', category: 'needs' }]
  }
  return expenses.map((e) => {
    if (e.kind !== 'housing') return e
    const share = current > 0 ? monthly(e) / current : 1 / housing.length
    return { ...e, amount: monthlyHousing * share, frequency: 'monthly' }
  })
}

export function buildBudget(profile: Profile, tax: TaxResult, whatIf: WhatIf = {}): Budget {
  const expenses = withHousingOverride(profile.expenses, whatIf.monthlyHousing)
  const takeHome = tax.net / 12
  const grossMonthly = tax.gross / 12

  const allocations: Allocation[] = [
    ...(tax.preTax.retirement > 0 ? [{ id: 'payroll-401k', name: '401(k) / 403(b)', category: 'savings' as const, monthly: tax.preTax.retirement / 12, payroll: true }] : []),
    ...(tax.preTax.hsa > 0 ? [{ id: 'payroll-hsa', name: 'HSA / FSA', category: 'savings' as const, monthly: tax.preTax.hsa / 12, payroll: true }] : []),
    ...(tax.preTax.section125 > 0 ? [{ id: 'payroll-health', name: 'Health insurance', category: 'needs' as const, monthly: tax.preTax.section125 / 12, payroll: true }] : []),
    ...expenses.filter((e) => e.amount > 0).map((e) => ({ id: e.id, name: e.name || 'Unnamed', category: e.category, monthly: monthly(e) })),
  ]

  const totals: Split = { needs: 0, wants: 0, savings: 0 }
  for (const a of allocations) totals[a.category] += a.monthly
  const spending = allocations.filter((a) => !a.payroll).reduce((s, a) => s + a.monthly, 0)
  const leftover = takeHome - spending
  const base = takeHome + tax.preTax.total / 12
  const pctOf = (x: number) => (base > 0 ? (x / base) * 100 : 0)
  const actualPct: Split = { needs: pctOf(totals.needs), wants: pctOf(totals.wants), savings: pctOf(totals.savings) }
  const targetPct = personalizedSplit(actualPct.needs)
  const targetMonthly: Split = { needs: (base * targetPct.needs) / 100, wants: (base * targetPct.wants) / 100, savings: (base * targetPct.savings) / 100 }

  const housingMonthly = sumKinds(expenses, ['housing'])
  const housingShareOfGross = grossMonthly > 0 ? housingMonthly / grossMonthly : 0
  const employerMatchMonthly = ((profile.deductions.employerMatchPercent / 100) * (whatIf.annualGross ?? annualGross(profile.income))) / 12

  const goals = goalProgress(profile, expenses)
  const recommendations = recommend({ profile, expenses, takeHome, base, totals, actualPct, targetPct, targetMonthly, leftover, housingMonthly, housingShareOfGross, grossMonthly, goals })

  return {
    takeHome,
    base,
    grossMonthly,
    allocations,
    totals,
    spending,
    leftover,
    actualPct,
    standardPct: { ...STANDARD_SPLIT },
    targetPct,
    targetMonthly,
    employerMatchMonthly,
    housingMonthly,
    housingShareOfGross,
    recommendations,
    goals,
  }
}

function goalProgress(profile: Profile, expenses: Expense[]): GoalProgress[] {
  const out: GoalProgress[] = []
  const g = profile.goals

  if (g.emergencyFund.target > 0) {
    const contribution = sumKinds(expenses, ['emergencyFund'])
    const remaining = Math.max(0, g.emergencyFund.target - g.emergencyFund.saved)
    out.push({
      id: 'emergencyFund',
      name: 'Emergency fund',
      target: g.emergencyFund.target,
      current: g.emergencyFund.saved,
      remaining,
      monthlyContribution: contribution,
      months: remaining === 0 ? 0 : contribution > 0 ? Math.ceil(remaining / contribution) : null,
    })
  }

  if (g.savings.target > 0) {
    // Savings lines other than the emergency fund and extra debt payments feed this goal.
    const contribution = expenses
      .filter((e) => e.category === 'savings' && e.kind !== 'emergencyFund' && e.kind !== 'extraDebt')
      .reduce((s, e) => s + monthly(e), 0)
    const remaining = Math.max(0, g.savings.target - g.savings.saved)
    const months = remaining === 0 ? 0 : contribution > 0 ? Math.ceil(remaining / contribution) : null
    const progress: GoalProgress = {
      id: 'savings',
      name: g.savings.name || 'Savings goal',
      target: g.savings.target,
      current: g.savings.saved,
      remaining,
      monthlyContribution: contribution,
      months,
    }
    if (g.savings.deadline) {
      const monthsToDeadline = monthsUntil(g.savings.deadline)
      progress.monthsToDeadline = monthsToDeadline
      progress.requiredMonthly = monthsToDeadline > 0 ? remaining / monthsToDeadline : remaining
      progress.onTrack = remaining === 0 || (months !== null && months <= monthsToDeadline)
    }
    out.push(progress)
  }

  if (g.debt.balance > 0) {
    const payment = sumKinds(expenses, ['minDebt', 'extraDebt'])
    const { months, interest } = payoffMonths(g.debt.balance, g.debt.aprPercent, payment)
    out.push({
      id: 'debt',
      name: g.debt.name || 'Debt payoff',
      target: g.debt.balance,
      current: 0,
      remaining: g.debt.balance,
      monthlyContribution: payment,
      months,
      totalInterest: interest,
    })
  }
  return out
}

/** Whole months from today until an ISO date (0 if past). */
export function monthsUntil(iso: string, now = new Date()): number {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return 0
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + (d.getDate() >= now.getDate() ? 0 : -1)
  return Math.max(0, months)
}

interface RecommendInput {
  profile: Profile
  expenses: Expense[]
  takeHome: number
  base: number
  totals: Split
  actualPct: Split
  targetPct: Split
  targetMonthly: Split
  leftover: number
  housingMonthly: number
  housingShareOfGross: number
  grossMonthly: number
  goals: GoalProgress[]
}

function recommend(x: RecommendInput): Recommendation[] {
  const recs: Recommendation[] = []
  const { profile, expenses, totals, actualPct, targetPct, targetMonthly, leftover } = x
  if (x.takeHome <= 0) return recs

  // 1. Overspending
  if (leftover < -0.5) {
    recs.push({
      id: 'overspending',
      severity: 'bad',
      title: `You're spending ${dollars(-leftover)} more than you take home each month`,
      detail: `Expenses come to ${dollars(x.takeHome - leftover)}/month against ${dollars(x.takeHome)} of take-home pay. Start with the largest wants, then look at needs you can renegotiate.`,
    })
  }

  // 2. Emergency fund
  const efMonthly = sumKinds(expenses, ['emergencyFund'])
  const efSaved = profile.goals.emergencyFund.saved
  if (efMonthly <= 0 && efSaved < totals.needs) {
    recs.push({
      id: 'no-emergency-fund',
      severity: 'warn',
      title: 'No emergency fund',
      detail: `Aim for 3–6 months of needs (${dollars(totals.needs * 3)}–${dollars(totals.needs * 6)}). Even ${dollars(Math.max(25, targetMonthly.savings * 0.25))}/month to start builds the habit.`,
    })
  }

  // 3. Housing over 30% of gross
  if (x.housingShareOfGross > 0.3) {
    const affordable = x.grossMonthly * 0.3
    recs.push({
      id: 'housing-high',
      severity: 'warn',
      title: `Housing is ${Math.round(x.housingShareOfGross * 100)}% of your gross income`,
      detail: `The usual guideline is 30% or less (${dollars(affordable)}/month on your pay). That's ${dollars(x.housingMonthly - affordable)}/month over. A roommate, a cheaper place at renewal, or refinancing would make the biggest difference.`,
    })
  }

  // 4. Needs above 50%: explain the adjusted targets
  if (actualPct.needs > 50) {
    const topNeeds = expenses
      .filter((e) => e.category === 'needs' && e.amount > 0)
      .sort((a, b) => monthly(b) - monthly(a))
      .slice(0, 2)
      .map((e) => e.name)
    recs.push({
      id: 'needs-high',
      severity: actualPct.needs > 70 ? 'warn' : 'info',
      title: `Needs take ${Math.round(actualPct.needs)}% of your income, so your targets are adjusted`,
      detail: `Instead of 50/30/20, aim for ${Math.round(targetPct.needs)}/${Math.round(targetPct.wants)}/${Math.round(targetPct.savings)}: ${dollars(targetMonthly.wants)}/month for wants and ${dollars(targetMonthly.savings)}/month for savings.${topNeeds.length ? ` Your biggest needs are ${topNeeds.join(' and ')}; lowering them over time moves you toward 50%.` : ''}`,
    })
  }

  // 5. Wants above target
  if (totals.wants - targetMonthly.wants > 1) {
    const over = totals.wants - targetMonthly.wants
    const topWant = expenses.filter((e) => e.category === 'wants' && e.amount > 0).sort((a, b) => monthly(b) - monthly(a))[0]
    recs.push({
      id: 'wants-high',
      severity: 'info',
      title: `Wants are ${dollars(over)}/month above your ${Math.round(targetPct.wants)}% target`,
      detail: `Bringing wants to ${dollars(targetMonthly.wants)}/month frees money for savings.${topWant ? ` ${topWant.name} is your largest want at ${dollars(monthly(topWant))}/month.` : ''}`,
    })
  }

  // 6. Savings below target
  if (targetMonthly.savings - totals.savings > 1) {
    const gap = targetMonthly.savings - totals.savings
    const fromLeftover = Math.min(gap, Math.max(0, leftover))
    recs.push({
      id: 'savings-low',
      severity: 'warn',
      title: `Savings are ${Math.round(actualPct.savings)}% of income; your target is ${Math.round(targetPct.savings)}%`,
      detail:
        fromLeftover > 0
          ? `Move ${dollars(fromLeftover)}/month of your unassigned money into savings${fromLeftover < gap ? `, then find another ${dollars(gap - fromLeftover)}` : ''} to reach ${dollars(targetMonthly.savings)}/month.`
          : `Find ${dollars(gap)}/month, from wants first, to reach ${dollars(targetMonthly.savings)}/month.`,
    })
  }

  // 7. Unassigned money
  if (leftover > 1 && targetMonthly.savings - totals.savings <= 1) {
    recs.push({
      id: 'unassigned',
      severity: 'info',
      title: `${dollars(leftover)}/month isn't assigned`,
      detail: 'Give every dollar a job: extra toward a goal, debt, or a planned fun fund keeps it from disappearing.',
    })
  }

  // 8. Goals behind schedule
  for (const g of x.goals) {
    if (g.id === 'savings' && g.onTrack === false && g.requiredMonthly !== undefined) {
      recs.push({
        id: 'goal-savings-behind',
        severity: 'warn',
        title: `${g.name} is behind schedule`,
        detail: `You need ${dollars(g.requiredMonthly)}/month to hit your deadline; you're putting in ${dollars(g.monthlyContribution)}.`,
      })
    }
    if (g.id === 'debt' && g.months === null) {
      recs.push({
        id: 'goal-debt-never',
        severity: 'bad',
        title: `${g.name} won't be paid off at the current payment`,
        detail:
          g.monthlyContribution > 0
            ? `${dollars(g.monthlyContribution)}/month doesn't cover the interest. Add an "Extra debt payments" line.`
            : 'Add your minimum and any extra debt payments to see a payoff date.',
      })
    }
  }

  if (recs.length === 0) {
    recs.push({ id: 'on-track', severity: 'good', title: 'Your budget is on track', detail: 'Needs, wants and savings are all within your targets. Nice work.' })
  }
  const order: Record<Severity, number> = { bad: 0, warn: 1, info: 2, good: 3 }
  return recs.sort((a, b) => order[a.severity] - order[b.severity])
}

