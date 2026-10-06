import { describe, expect, it } from 'vitest'
import { annualDeduction, annualGross, annualize, periods, toTaxInput } from '../derive'
import { DEFAULT_PROFILE, type Profile } from '../profile'
import { validateExpenses, validateIncome, validateTaxes } from '../validate'

const profile = (fn: (p: Profile) => void = () => {}) => {
  const p = structuredClone(DEFAULT_PROFILE)
  p.income.annualSalary = 80_000
  p.taxes.state = 'CA'
  fn(p)
  return p
}

describe('conversions', () => {
  it('annualizes expenses', () => {
    expect(annualize(100, 'weekly')).toBe(5_200)
    expect(annualize(100, 'monthly')).toBe(1_200)
    expect(annualize(100, 'yearly')).toBe(100)
  })

  it('computes hourly gross as rate x hours x 52', () => {
    expect(annualGross({ payType: 'hourly', annualSalary: 0, hourlyRate: 25, hoursPerWeek: 40, payFrequency: 'weekly', netPerPaycheck: null })).toBe(52_000)
  })

  it('annualizes per-paycheck deductions by pay frequency', () => {
    expect(annualDeduction(100, 'paycheck', 'biweekly')).toBe(2_600)
    expect(annualDeduction(100, 'paycheck', 'semimonthly')).toBe(2_400)
    expect(annualDeduction(100, 'monthly', 'weekly')).toBe(1_200)
  })

  it('splits annual into month and paycheck', () => {
    expect(periods(52_000, 'weekly')).toEqual({ year: 52_000, month: 52_000 / 12, paycheck: 1_000 })
  })
})

describe('toTaxInput', () => {
  it('returns null until a state is chosen', () => {
    expect(toTaxInput(profile((p) => void (p.taxes.state = null)))).toBeNull()
  })

  it('maps deductions to annual dollars', () => {
    const input = toTaxInput(profile((p) => {
      p.deductions.retirementPercent = 5
      p.deductions.healthInsurance = { amount: 100, frequency: 'paycheck' }
    }))!
    expect(input.earners[0]).toEqual({ wages: 80_000, retirement: 4_000, section125: 2_600, hsa: 0 })
  })

  it('adds a spouse only for married filing jointly', () => {
    const p = profile((p) => void (p.taxes.spouseIncome = 50_000))
    expect(toTaxInput(p)!.earners).toHaveLength(1)
    p.taxes.filingStatus = 'married'
    expect(toTaxInput(p)!.earners).toHaveLength(2)
  })

  it('applies what-if overrides', () => {
    const input = toTaxInput(profile(), { annualGross: 100_000, retirementPercent: 10 })!
    expect(input.earners[0].wages).toBe(100_000)
    expect(input.earners[0].retirement).toBe(10_000)
  })
})

describe('validation', () => {
  it('requires a salary or hourly rate', () => {
    expect(validateIncome(profile((p) => void (p.income.annualSalary = 0)))).toHaveProperty('annualSalary')
    expect(validateIncome(profile((p) => void (p.income.payType = 'hourly')))).toHaveProperty('hourlyRate')
    expect(validateIncome(profile())).toEqual({})
  })

  it('requires a state and a custom local rate when "Other" is chosen', () => {
    expect(validateTaxes(profile((p) => void (p.taxes.state = null)))).toHaveProperty('state')
    expect(validateTaxes(profile((p) => void (p.taxes.localityId = 'custom')))).toHaveProperty('customLocalRatePercent')
  })

  it('requires expense names', () => {
    const p = profile((p) => void p.expenses.push({ id: 'x', kind: 'other', name: ' ', amount: 5, frequency: 'monthly', category: 'wants' }))
    expect(validateExpenses(p)).toHaveProperty('expense-x')
  })
})
