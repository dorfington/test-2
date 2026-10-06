import { describe, expect, it } from 'vitest'
import { calculateTaxes } from '../../engine'
import { toTaxInput } from '../../model/derive'
import { DEFAULT_PROFILE, type Profile } from '../../model/profile'
import { buildBudget } from '../budget'
import { estimatePaycheck, reconcile } from '../reconcile'

// Texas, single, 2026, $75,000 biweekly: take-home 61,592.50/yr (engine tests, example A) = 2,368.94 per paycheck.
const NET_PER_PAYCHECK = 61_592.5 / 26

function profile(fn: (p: Profile) => void = () => {}): Profile {
  const p = structuredClone(DEFAULT_PROFILE)
  p.income.annualSalary = 75_000
  p.taxes.state = 'TX'
  fn(p)
  return p
}
const taxOf = (p: Profile) => calculateTaxes(toTaxInput(p)!)

describe('estimatePaycheck', () => {
  it('splits a single filer paycheck into lines that add up to the estimated take-home', () => {
    const p = profile((p) => (p.deductions.retirementPercent = 5))
    const tax = taxOf(p)
    const est = estimatePaycheck(p, tax)!
    expect(est.lines.map((l) => l.id)).toEqual(['gross', 'retirement', 'federal', 'fica'])
    expect(est.lines[0].amount).toBeCloseTo(75_000 / 26, 2)
    expect(est.lines[1].amount).toBeCloseTo(-3_750 / 26, 2)
    expect(est.net * 26).toBeCloseTo(tax.net, 2)
  })

  it('with a spouse, shares income tax by wages and works out FICA on your pay alone', () => {
    const p = profile((p) => {
      p.taxes.filingStatus = 'married'
      p.taxes.spouseIncome = 25_000
    })
    const tax = taxOf(p)
    const est = estimatePaycheck(p, tax)!
    const line = (id: string) => est.lines.find((l) => l.id === id)!.amount
    expect(line('federal')).toBeCloseTo((-tax.federal.tax * 0.75) / 26, 2)
    expect(line('fica')).toBeCloseTo((-75_000 * 0.0765) / 26, 2)
    expect(est.net * 26).toBeLessThan(tax.net)
  })
})

describe('reconcile', () => {
  it('is null until an actual take-home is entered', () => {
    const p = profile()
    expect(reconcile(p, taxOf(p))).toBeNull()
  })

  it('reports a match when the actual pay equals the estimate', () => {
    const p = profile((p) => (p.income.netPerPaycheck = Math.round(NET_PER_PAYCHECK * 100) / 100))
    const r = reconcile(p, taxOf(p))!
    expect(Math.abs(r.diff)).toBeLessThan(0.01)
    expect(r.householdAnnual).toBeCloseTo(61_592.5, 0)
  })

  it('puts a gap with no withholding data down to deductions not entered here', () => {
    const p = profile((p) => (p.income.netPerPaycheck = 2_300))
    const r = reconcile(p, taxOf(p))!
    expect(r.diff).toBeCloseTo(2_300 - NET_PER_PAYCHECK, 2)
    expect(r.explained).toEqual([])
    expect(r.unexplained).toBeCloseTo(r.diff, 2)
  })

  it('explains the part of the gap that comes from tax actually withheld', () => {
    const p = profile()
    const tax = taxOf(p)
    const estFederal = tax.federal.tax / 26
    p.withholding = { federalPerPaycheck: estFederal + 40, statePerPaycheck: null, localPerPaycheck: null, payDate: null }
    // $40 more federal withholding and $25 of post-tax deductions.
    p.income.netPerPaycheck = NET_PER_PAYCHECK - 65
    const r = reconcile(p, tax)!
    expect(r.explained).toHaveLength(1)
    expect(r.explained[0].name).toBe('Federal income tax')
    expect(r.explained[0].amount).toBeCloseTo(-40, 2)
    expect(r.unexplained).toBeCloseTo(-25, 2)
  })

  it('keeps a spouse estimated when replacing your pay with the actual', () => {
    const p = profile((p) => {
      p.taxes.filingStatus = 'married'
      p.taxes.spouseIncome = 25_000
    })
    const tax = taxOf(p)
    const est = estimatePaycheck(p, tax)!
    p.income.netPerPaycheck = est.net - 100
    const r = reconcile(p, tax)!
    expect(r.householdAnnual).toBeCloseTo(tax.net - 2_600, 2)
  })

  it('feeds the budget when passed as take-home pay', () => {
    const p = profile((p) => (p.income.netPerPaycheck = 2_000))
    const tax = taxOf(p)
    const r = reconcile(p, tax)!
    const b = buildBudget(p, tax, {}, r.householdAnnual)
    expect(b.takeHome).toBeCloseTo((2_000 * 26) / 12, 2)
    expect(b.leftover).toBeCloseTo((2_000 * 26) / 12, 2)
  })
})
