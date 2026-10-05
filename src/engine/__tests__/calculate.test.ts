import { describe, expect, it } from 'vitest'
import { calculateTaxes, combinedMarginalRate } from '../calculate'
import type { Earner, TaxInput } from '../types'

const earner = (wages: number, extra: Partial<Earner> = {}): Earner => ({ wages, retirement: 0, section125: 0, hsa: 0, ...extra })

/**
 * End-to-end examples worked by hand from the published tables (the arithmetic
 * is in the comments so each figure can be checked against the sources listed
 * in the data files).
 */
describe('calculateTaxes: worked examples', () => {
  it('A. Single, Texas, 2026, $75,000 salary', () => {
    const r = calculateTaxes({ year: 2026, filingStatus: 'single', state: 'TX', earners: [earner(75_000)], dependents: 0 })
    // Federal: taxable 75,000 - 16,100 = 58,900 -> 5,800 + 22% x 8,500 = 7,670
    expect(r.federal.tax).toBeCloseTo(7_670, 2)
    // FICA: 6.2% + 1.45% of 75,000
    expect(r.fica.total).toBeCloseTo(4_650 + 1_087.5, 2)
    expect(r.state.tax).toBe(0)
    expect(r.net).toBeCloseTo(75_000 - 7_670 - 5_737.5, 2)
  })

  it('B. Single, California, 2025, $100,000 with 401(k), health premiums and HSA', () => {
    const r = calculateTaxes({
      year: 2025,
      filingStatus: 'single',
      state: 'CA',
      earners: [earner(100_000, { retirement: 6_000, section125: 2_400, hsa: 1_200 })],
      dependents: 0,
    })
    // Federal AGI 90,400; taxable 74,650 -> 5,578.50 + 22% x 26,175 = 11,337
    expect(r.federal.tax).toBeCloseTo(11_337, 2)
    // FICA wages 96,400 (401(k) stays in)
    expect(r.fica.total).toBeCloseTo(96_400 * 0.0765, 2)
    // CA taxes HSA: AGI 91,600; taxable 85,894 -> 3,201.97 + 9.3% x 13,170 = 4,426.78; less $153 credit
    expect(r.state.tax).toBeCloseTo(4_273.78, 1)
    // SDI 1.2% of 96,400
    expect(r.statePayrollTotal).toBeCloseTo(1_156.8, 2)
    expect(r.net).toBeCloseTo(100_000 - 9_600 - 11_337 - 7_374.6 - 4_273.78 - 1_156.8, 1)
  })

  it('C. Married filing jointly, New York City, 2026, $150,000 + $60,000, two children', () => {
    const r = calculateTaxes({
      year: 2026,
      filingStatus: 'married',
      state: 'NY',
      localityId: 'ny-nyc',
      earners: [earner(150_000), earner(60_000)],
      dependents: 2,
    })
    // Federal: taxable 177,800 -> 11,600 + 22% x 77,000 = 28,540; less CTC 4,400
    expect(r.federal.tax).toBeCloseTo(24_140, 2)
    expect(r.fica.total).toBeCloseTo(13_020 + 3_045, 2)
    // NY taxable 210,000 - 16,050 - 2,000 = 191,950; schedule tax 10,184.80;
    // recapture: base 332.50 + 807.75 x (210,000 - 161,550) / 50,000
    expect(r.state.taxableIncome).toBe(191_950)
    expect(r.state.tax).toBeCloseTo(10_184.8 + 332.5 + 807.75 * 0.969, 1)
    // NYC on 191,950: 664.85 + 880.31 + 1,718.55 + 3,951.58
    expect(r.local!.tax).toBeCloseTo(7_215.29, 1)
    // PFL 0.432% capped at 411.91 + 259.20; SDI $31.20 x 2
    expect(r.statePayrollTotal).toBeCloseTo(411.91 + 259.2 + 62.4, 2)
  })

  it('D. Head of household, Maryland (Montgomery County), 2025, $80,000, one child', () => {
    const r = calculateTaxes({
      year: 2025,
      filingStatus: 'headOfHousehold',
      state: 'MD',
      localityId: 'md-montgomery',
      earners: [earner(80_000)],
      dependents: 1,
    })
    // Federal: taxable 56,375 -> 1,700 + 12% x 39,375 = 6,425; less CTC 2,200
    expect(r.federal.tax).toBeCloseTo(4_225, 2)
    // MD: 80,000 - 6,700 - 3,200 - 3,200 = 66,900 -> 90 + 4.75% x 63,900 = 3,125.25
    expect(r.state.tax).toBeCloseTo(3_125.25, 2)
    expect(r.local!.tax).toBeCloseTo(66_900 * 0.032, 2)
    expect(r.net).toBeCloseTo(80_000 - 4_225 - 6_120 - 3_125.25 - 2_140.8, 2)
  })

  it('E. Single, Philadelphia, 2026, $60,000 with 5% 401(k) (PA taxes 401(k) deferrals)', () => {
    const r = calculateTaxes({
      year: 2026,
      filingStatus: 'single',
      state: 'PA',
      localityId: 'pa-philadelphia',
      earners: [earner(60_000, { retirement: 3_000 })],
      dependents: 0,
    })
    expect(r.federal.tax).toBeCloseTo(4_660, 2)
    expect(r.state.tax).toBeCloseTo(60_000 * 0.0307, 2)
    expect(r.local!.tax).toBeCloseTo(60_000 * 0.037375, 2)
    expect(r.statePayrollTotal).toBeCloseTo(42, 2)
    expect(r.net).toBeCloseTo(60_000 - 3_000 - 4_660 - 4_590 - 1_842 - 2_242.5 - 42, 2)
  })
})

describe('calculateTaxes: behavior', () => {
  const base: TaxInput = { year: 2026, filingStatus: 'single', state: 'NJ', earners: [earner(80_000)], dependents: 0 }

  it('ignores a second earner unless married filing jointly', () => {
    const r = calculateTaxes({ ...base, earners: [earner(80_000), earner(50_000)] })
    expect(r.gross).toBe(80_000)
  })

  it('New Jersey adds back Section 125 and HSA contributions', () => {
    const r = calculateTaxes({ ...base, earners: [earner(80_000, { section125: 3_000, hsa: 2_000, retirement: 4_000 })] })
    expect(r.federal.agi).toBe(71_000)
    expect(r.state.agi).toBe(76_000)
  })

  it('can exclude state payroll programs', () => {
    const r = calculateTaxes({ ...base, includeStatePayroll: false })
    expect(r.statePayroll).toEqual([])
  })

  it('applies a custom local wage tax', () => {
    const r = calculateTaxes({ ...base, state: 'PA', localityId: 'custom', customLocalRate: 0.01 })
    expect(r.local!.tax).toBeCloseTo(800, 6)
  })

  it('ignores a locality from another state with a warning', () => {
    const r = calculateTaxes({ ...base, localityId: 'ny-nyc' })
    expect(r.local).toBeNull()
    expect(r.warnings.join(' ')).toMatch(/not in the selected state/)
  })

  it('clamps pre-tax deductions to wages', () => {
    const r = calculateTaxes({ ...base, earners: [earner(10_000, { retirement: 50_000 })] })
    expect(r.preTax.retirement).toBe(10_000)
    // Deferring every dollar still leaves FICA due, so take-home goes negative and is flagged.
    expect(r.net).toBeCloseTo(-765 - 84.5, 6) // FICA 7.65% + NJ UI/TDI/FLI 0.845%
    expect(r.warnings.join(' ')).toMatch(/exceed gross pay/)
  })

  it('warns when 401(k) deferrals exceed the IRS limit', () => {
    const r = calculateTaxes({ ...base, earners: [earner(200_000, { retirement: 30_000 })] })
    expect(r.warnings.join(' ')).toMatch(/above the 2026 limit of \$24,500/)
  })

  it('net = gross - pre-tax - every tax', () => {
    const r = calculateTaxes({ ...base, earners: [earner(123_456, { retirement: 7_000, section125: 1_800 })], dependents: 1 })
    const parts = r.preTax.total + r.federal.tax + r.fica.total + r.state.tax + (r.local?.tax ?? 0) + r.statePayrollTotal
    expect(r.net).toBeCloseTo(r.gross - parts, 6)
  })

  it('combined marginal rate for a Texas single filer at $75k is 22% + 7.65%', () => {
    expect(combinedMarginalRate({ year: 2026, filingStatus: 'single', state: 'TX', earners: [earner(75_000)], dependents: 0 })).toBeCloseTo(0.2965, 4)
  })
})
