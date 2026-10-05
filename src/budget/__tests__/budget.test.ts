import { describe, expect, it } from 'vitest'
import { calculateTaxes } from '../../engine'
import { toTaxInput, type WhatIf } from '../../model/derive'
import { DEFAULT_PROFILE, makeExpense, type ExpenseKind, type Profile } from '../../model/profile'
import { buildBudget, monthsUntil, payoffMonths, personalizedSplit } from '../budget'

// Texas, single, 2026, $75,000: take-home 61,592.50/yr = 5,132.71/mo (see engine tests, example A).
const TAKE_HOME = 61_592.5 / 12

function profile(expenses: [ExpenseKind, number][], fn: (p: Profile) => void = () => {}): Profile {
  const p = structuredClone(DEFAULT_PROFILE)
  p.income.annualSalary = 75_000
  p.taxes.state = 'TX'
  p.expenses = expenses.map(([k, amount]) => makeExpense(k, { amount }))
  fn(p)
  return p
}
const budget = (p: Profile, w: WhatIf = {}) => buildBudget(p, calculateTaxes(toTaxInput(p, w)!), w)
const ids = (p: Profile, w?: WhatIf) => budget(p, w).recommendations.map((r) => r.id)

describe('personalizedSplit', () => {
  it('is plain 50/30/20 when needs are at or under 50%', () => {
    expect(personalizedSplit(42)).toEqual({ needs: 50, wants: 30, savings: 20 })
    expect(personalizedSplit(50)).toEqual({ needs: 50, wants: 30, savings: 20 })
  })

  it('keeps needs as they are and shares the rest 40% savings / 60% wants, savings 10-20 points', () => {
    expect(personalizedSplit(60)).toEqual({ needs: 60, wants: 24, savings: 16 })
    expect(personalizedSplit(70)).toEqual({ needs: 70, wants: 18, savings: 12 })
    expect(personalizedSplit(75)).toEqual({ needs: 75, wants: 15, savings: 10 })
  })

  it('shrinks savings proportionally when very little is left', () => {
    const s = personalizedSplit(90)
    expect(s.needs).toBe(90)
    expect(s.savings).toBeCloseTo(4, 6)
    expect(s.wants).toBeCloseTo(6, 6)
  })

  it('never goes negative when needs exceed income', () => {
    expect(personalizedSplit(130)).toEqual({ needs: 100, wants: 0, savings: 0 })
  })

  it('is continuous at the 50% boundary', () => {
    const s = personalizedSplit(50.0001)
    expect(s.savings).toBeCloseTo(19.99996, 3)
  })
})

describe('buildBudget', () => {
  it('shows where every dollar goes, with leftover money', () => {
    const b = budget(profile([['housing', 1_500], ['groceries', 400], ['dining', 200], ['emergencyFund', 300]]))
    expect(b.takeHome).toBeCloseTo(TAKE_HOME, 6)
    expect(b.totals).toEqual({ needs: 1_900, wants: 200, savings: 300 })
    expect(b.leftover).toBeCloseTo(TAKE_HOME - 2_400, 6)
    expect(b.actualPct.needs).toBeCloseTo((1_900 / TAKE_HOME) * 100, 6)
  })

  it('counts pre-tax 401(k) as savings and health premiums as needs, in a base that includes them', () => {
    const p = profile([['housing', 1_000]], (p) => {
      p.deductions.retirementPercent = 10
      p.deductions.healthInsurance = { amount: 200, frequency: 'monthly' }
    })
    const b = budget(p)
    expect(b.totals.savings).toBeCloseTo(625, 6)
    expect(b.totals.needs).toBeCloseTo(1_200, 6)
    expect(b.base).toBeCloseTo(b.takeHome + 625 + 200, 6)
    // payroll deductions are not "spending" from take-home pay
    expect(b.spending).toBe(1_000)
  })

  it('annualizes weekly and yearly expenses', () => {
    const b = budget(profile([['groceries', 100]], (p) => {
      p.expenses[0].frequency = 'weekly'
      p.expenses.push(makeExpense('insurance', { amount: 1_200, frequency: 'yearly' }))
    }))
    expect(b.totals.needs).toBeCloseTo((100 * 52) / 12 + 100, 6)
  })

  it('computes the employer match from salary', () => {
    expect(budget(profile([], (p) => void (p.deductions.employerMatchPercent = 4))).employerMatchMonthly).toBeCloseTo(250, 6)
  })
})

describe('flags', () => {
  it('flags spending above take-home pay', () => {
    expect(ids(profile([['housing', 4_000], ['dining', 1_500], ['emergencyFund', 100]]))).toContain('overspending')
  })

  it('flags a missing emergency fund, unless one is funded or already saved', () => {
    expect(ids(profile([['housing', 1_200]]))).toContain('no-emergency-fund')
    expect(ids(profile([['housing', 1_200], ['emergencyFund', 100]]))).not.toContain('no-emergency-fund')
    expect(ids(profile([['housing', 1_200]], (p) => void (p.goals.emergencyFund.saved = 10_000)))).not.toContain('no-emergency-fund')
  })

  it('flags housing above 30% of gross income ($1,875/month on $75,000)', () => {
    expect(ids(profile([['housing', 1_875], ['emergencyFund', 100]]))).not.toContain('housing-high')
    expect(ids(profile([['housing', 1_900], ['emergencyFund', 100]]))).toContain('housing-high')
  })

  it('explains adjusted targets when needs exceed 50%', () => {
    const b = budget(profile([['housing', 2_500], ['car', 600], ['emergencyFund', 100]]))
    expect(b.actualPct.needs).toBeGreaterThan(50)
    expect(b.targetPct.needs).toBeCloseTo(b.actualPct.needs, 6)
    expect(b.recommendations.find((r) => r.id === 'needs-high')!.detail).toMatch(/Rent \/ mortgage and Car payment/)
  })

  it('sorts problems first and says "on track" only when nothing is wrong', () => {
    const b = budget(profile([['housing', 1_500], ['dining', 600], ['emergencyFund', 500], ['investing', 600]]))
    expect(b.recommendations.map((r) => r.id)).toEqual(['unassigned'])
    // needs 49.3%, wants 29.2%, savings 21.4%, every dollar assigned
    const onTrack = budget(profile([['housing', 1_500], ['groceries', 1_032.71], ['dining', 1_500], ['emergencyFund', 500], ['investing', 600]]))
    expect(onTrack.recommendations.map((r) => r.id)).toEqual(['on-track'])
  })
})

describe('what-if', () => {
  it('replaces rent and recomputes the housing flag', () => {
    const p = profile([['housing', 2_500], ['emergencyFund', 100]])
    expect(ids(p)).toContain('housing-high')
    const b = budget(p, { monthlyHousing: 1_500 })
    expect(b.housingMonthly).toBeCloseTo(1_500, 6)
    expect(b.recommendations.map((r) => r.id)).not.toContain('housing-high')
  })

  it('replaces salary', () => {
    expect(budget(profile([]), { annualGross: 100_000 }).grossMonthly).toBeCloseTo(100_000 / 12, 6)
  })
})

describe('goals', () => {
  it('months to reach the emergency fund at the current rate', () => {
    const b = budget(profile([['emergencyFund', 300]], (p) => (p.goals.emergencyFund = { target: 10_000, saved: 1_000 })))
    expect(b.goals[0]).toMatchObject({ id: 'emergencyFund', remaining: 9_000, monthlyContribution: 300, months: 30 })
  })

  it('reports null months when nothing is going toward a goal', () => {
    const b = budget(profile([], (p) => (p.goals.emergencyFund = { target: 5_000, saved: 0 })))
    expect(b.goals[0].months).toBeNull()
  })

  it('checks a savings goal against its deadline', () => {
    const deadline = new Date()
    deadline.setMonth(deadline.getMonth() + 12)
    const iso = deadline.toISOString().slice(0, 10)
    const b = budget(profile([['investing', 500]], (p) => (p.goals.savings = { name: 'Car', target: 12_000, saved: 0, deadline: iso })))
    const g = b.goals.find((x) => x.id === 'savings')!
    expect(g.months).toBe(24)
    expect(g.monthsToDeadline).toBe(12)
    expect(g.requiredMonthly).toBeCloseTo(1_000, 6)
    expect(g.onTrack).toBe(false)
    expect(b.recommendations.map((r) => r.id)).toContain('goal-savings-behind')
  })

  it('debt payoff uses minimum + extra payments with interest', () => {
    const b = budget(profile([['minDebt', 100], ['extraDebt', 100]], (p) => (p.goals.debt = { name: 'Card', balance: 5_000, aprPercent: 20 })))
    const g = b.goals.find((x) => x.id === 'debt')!
    expect(g.monthlyContribution).toBe(200)
    expect(g.months).toBe(33)
  })
})

describe('payoffMonths (standard amortization)', () => {
  it('matches the amortization formula', () => {
    // $5,000 at 20% APR, $200/month: r = 0.20/12, n = -ln(1 - r*B/P) / ln(1 + r) = 32.61 -> 33 payments,
    // interest = 200 x 32.61 - 5,000 = 1,521.8
    const { months, interest } = payoffMonths(5_000, 20, 200)
    expect(months).toBe(33)
    expect(interest).toBeCloseTo(1_521.8, 0)
  })

  it('handles 0% APR and payments that never cover interest', () => {
    expect(payoffMonths(1_000, 0, 300).months).toBe(4)
    expect(payoffMonths(10_000, 24, 200).months).toBeNull()
  })
})

describe('monthsUntil', () => {
  it('counts whole months', () => {
    expect(monthsUntil('2027-03-15', new Date('2026-10-05T12:00:00'))).toBe(5)
    expect(monthsUntil('2027-03-01', new Date('2026-10-05T12:00:00'))).toBe(4)
    expect(monthsUntil('2020-01-01', new Date('2026-10-05T12:00:00'))).toBe(0)
  })
})
