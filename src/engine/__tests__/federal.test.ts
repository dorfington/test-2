import { describe, expect, it } from 'vitest'
import { getTaxYear, type FilingStatus } from '../../taxdata'
import { bracketTax } from '../brackets'
import { federalIncomeTax } from '../federal'
import { fica } from '../fica'

const fed = (year: number) => getTaxYear(year).federal
const tax = (year: number, status: FilingStatus, taxable: number) => bracketTax(taxable, fed(year).brackets[status])

describe('federal brackets vs. the IRS 2025 Tax Table (Form 1040 instructions, i1040tt.pdf)', () => {
  // https://www.irs.gov/pub/irs-pdf/i1040tt.pdf - the table computes tax at the midpoint of each $50 row.
  // Columns: [row start, single, married filing jointly, head of household]
  const rows: [number, number, number, number][] = [
    [10_000, 1_003, 1_003, 1_003],
    [50_000, 5_920, 5_526, 5_663],
    [75_000, 11_420, 8_526, 9_681],
    [88_000, 14_280, 10_086, 12_541],
  ]
  for (const [start, single, married, hoh] of rows) {
    it(`taxable income $${start.toLocaleString()}-$${(start + 50).toLocaleString()}`, () => {
      const mid = start + 25
      expect(Math.round(tax(2025, 'single', mid))).toBe(single)
      expect(Math.round(tax(2025, 'married', mid))).toBe(married)
      expect(Math.round(tax(2025, 'headOfHousehold', mid))).toBe(hoh)
    })
  }
})

describe('federal brackets vs. Rev. Proc. 2025-32 (2026) rate table base amounts', () => {
  // https://www.irs.gov/pub/irs-drop/rp-25-32.pdf, section 4.01 tables 1-3
  it.each([
    ['single', 12_400, 1_240],
    ['single', 50_400, 5_800],
    ['single', 105_700, 17_966],
    ['single', 201_775, 41_024],
    ['single', 256_225, 58_448],
    ['single', 640_600, 192_979.25],
    ['married', 24_800, 2_480],
    ['married', 100_800, 11_600],
    ['married', 211_400, 35_932],
    ['married', 403_550, 82_048],
    ['married', 512_450, 116_896],
    ['married', 768_700, 206_583.5],
    ['headOfHousehold', 17_700, 1_770],
    ['headOfHousehold', 67_450, 7_740],
    ['headOfHousehold', 105_700, 16_155],
    ['headOfHousehold', 201_750, 39_207],
    ['headOfHousehold', 256_200, 56_631],
    ['headOfHousehold', 640_600, 191_171],
  ] as [FilingStatus, number, number][])('%s at $%d -> $%d', (status, income, expected) => {
    expect(tax(2026, status, income)).toBeCloseTo(expected, 2)
  })

  it('standard deductions (IRS 2026 inflation adjustments release)', () => {
    expect(fed(2026).standardDeduction).toEqual({ single: 16_100, married: 32_200, headOfHousehold: 24_150 })
    expect(fed(2025).standardDeduction).toEqual({ single: 15_750, married: 31_500, headOfHousehold: 23_625 })
  })
})

describe('Child Tax Credit', () => {
  it('reduces tax by $2,200 per child', () => {
    const r = federalIncomeTax(fed(2026), 'married', 100_000, 100_000, 2)
    // taxable 67,800: 2,480 + 12% x 43,000 = 7,640
    expect(r.taxBeforeCredits).toBeCloseTo(7_640, 2)
    expect(r.childTaxCredit).toBe(4_400)
    expect(r.tax).toBeCloseTo(3_240, 2)
  })

  it('pays a refundable portion up to $1,700 per child when tax is low', () => {
    const r = federalIncomeTax(fed(2026), 'headOfHousehold', 30_000, 30_000, 1)
    // taxable 5,850 -> tax 585; nonrefundable 585; refundable min(1,615, 1,700, 15% x 27,500 = 4,125) = 1,615
    expect(r.taxBeforeCredits).toBeCloseTo(585, 2)
    expect(r.childTaxCredit).toBeCloseTo(2_200, 2)
    expect(r.tax).toBeCloseTo(-1_615, 2)
  })

  it('phases out by $50 per $1,000 (or part) of AGI over $200,000 single', () => {
    const r = federalIncomeTax(fed(2026), 'single', 210_500, 210_500, 1)
    expect(r.childTaxCredit).toBe(2_200 - 11 * 50)
  })
})

describe('FICA', () => {
  it('caps Social Security at the wage base (SSA: $176,100 in 2025, $184,500 in 2026)', () => {
    const r26 = fica(getTaxYear(2026).fica, 'single', [{ wages: 300_000, retirement: 0, section125: 0, hsa: 0 }])
    expect(r26.socialSecurity).toBeCloseTo(184_500 * 0.062, 2) // 11,439
    const r25 = fica(getTaxYear(2025).fica, 'single', [{ wages: 300_000, retirement: 0, section125: 0, hsa: 0 }])
    expect(r25.socialSecurity).toBeCloseTo(176_100 * 0.062, 2) // 10,918.20
  })

  it('applies the cap per worker on a joint return', () => {
    const r = fica(getTaxYear(2026).fica, 'married', [
      { wages: 200_000, retirement: 0, section125: 0, hsa: 0 },
      { wages: 100_000, retirement: 0, section125: 0, hsa: 0 },
    ])
    expect(r.socialSecurity).toBeCloseTo((184_500 + 100_000) * 0.062, 2)
  })

  it('charges 0.9% Additional Medicare Tax above $200k single / $250k joint', () => {
    const single = fica(getTaxYear(2026).fica, 'single', [{ wages: 250_000, retirement: 0, section125: 0, hsa: 0 }])
    expect(single.medicare).toBeCloseTo(3_625, 2)
    expect(single.additionalMedicare).toBeCloseTo(450, 2)
    const joint = fica(getTaxYear(2026).fica, 'married', [
      { wages: 150_000, retirement: 0, section125: 0, hsa: 0 },
      { wages: 150_000, retirement: 0, section125: 0, hsa: 0 },
    ])
    expect(joint.additionalMedicare).toBeCloseTo(450, 2)
  })

  it('exempts Section 125 and HSA payroll contributions but not 401(k) deferrals', () => {
    const r = fica(getTaxYear(2026).fica, 'single', [{ wages: 100_000, retirement: 10_000, section125: 3_000, hsa: 2_000 }])
    expect(r.socialSecurity).toBeCloseTo(95_000 * 0.062, 2)
  })
})
