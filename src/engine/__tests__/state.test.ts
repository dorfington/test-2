import { describe, expect, it } from 'vitest'
import { getTaxYear, STATE_CODES, type FilingStatus, type StateCode } from '../../taxdata'
import { bracketTax } from '../brackets'
import { componentTax } from '../local'
import { recaptureBase, stateIncomeTax } from '../state'

const y25 = getTaxYear(2025)
const y26 = getTaxYear(2026)

const stateTax = (year: number, code: StateCode, status: FilingStatus, agi: number, dependents = 0) => {
  const data = getTaxYear(year)
  return stateIncomeTax(code, data, {
    status,
    agi,
    dependents,
    federalTax: 0,
    federalStandardDeduction: data.federal.standardDeduction[status],
  })
}

describe('California (FTB 2025 Form 540 tax rate schedules)', () => {
  // https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf
  it('reproduces the official worked example: MFJ taxable income $125,000 -> $4,768.10', () => {
    expect(bracketTax(125_000, y25.states.CA.brackets!.married)).toBeCloseTo(4_768.1, 2)
  })

  it.each([
    ['single', 72_724, 3_201.97],
    ['single', 371_479, 30_986.19],
    ['single', 742_953, 72_219.84],
    ['married', 145_448, 6_403.94],
    ['married', 891_542, 77_276.52],
    ['headOfHousehold', 98_990, 3_616.45],
    ['headOfHousehold', 606_251, 51_802.15],
  ] as [FilingStatus, number, number][])('%s schedule base at $%d is $%d', (status, income, base) => {
    expect(bracketTax(income, y25.states.CA.brackets![status]!)).toBeCloseTo(base, 1)
  })

  it('applies the standard deduction, exemption credit and the $6-per-$2,500 credit phase-out', () => {
    const r = stateTax(2025, 'CA', 'single', 50_000)
    expect(r.taxableIncome).toBe(50_000 - 5_706)
    expect(r.credits).toBe(153)
    const high = stateTax(2025, 'CA', 'single', 252_203 + 25_000)
    expect(high.credits).toBe(153 - 10 * 6)
  })
})

describe('New York (IT-201 instructions, 2025)', () => {
  // https://www.tax.ny.gov/forms/current-forms/it/it201i.htm
  const ny = y25.states.NY.brackets!

  it.each([
    ['single', 13_900, 600],
    ['single', 80_650, 4_271],
    ['single', 215_400, 12_356],
    ['married', 27_900, 1_202],
    ['married', 161_550, 8_553],
    ['married', 323_200, 18_252],
    ['headOfHousehold', 20_900, 901],
    ['headOfHousehold', 107_650, 5_672],
    ['headOfHousehold', 269_300, 15_371],
  ] as [FilingStatus, number, number][])('%s rate schedule base at $%d is $%d', (status, income, base) => {
    expect(Math.round(bracketTax(income, ny[status]!))).toBe(base)
  })

  it('derives the recapture worksheet constants from the brackets', () => {
    const base = (status: FilingStatus, over: number) => {
      const b = ny[status]!
      return Math.round(recaptureBase(b.findIndex((x) => x.over === over), b))
    }
    // Worksheets 2-5 (married filing jointly): recapture base and incremental benefit.
    expect(base('married', 161_550)).toBe(333)
    expect(base('married', 323_200) - base('married', 161_550)).toBe(807)
    expect(base('married', 323_200)).toBe(1_140)
    expect(base('married', 2_155_350) - base('married', 323_200)).toBe(2_747)
    expect(base('married', 2_155_350)).toBe(3_887)
    expect(base('married', 5_000_000) - base('married', 2_155_350)).toBe(60_350)
    expect(base('married', 5_000_000)).toBe(64_237)
    expect(base('married', 25_000_000) - base('married', 5_000_000)).toBe(32_500)
    // Worksheets 8-10 (single)
    expect(base('single', 215_400)).toBe(568)
    expect(base('single', 1_077_550) - base('single', 215_400)).toBe(1_831)
    expect(base('single', 1_077_550)).toBe(2_399)
    expect(base('single', 5_000_000) - base('single', 1_077_550)).toBe(30_172)
    expect(base('single', 5_000_000)).toBe(32_571)
    // Worksheet 13 (head of household)
    expect(base('headOfHousehold', 269_300)).toBe(787)
    expect(base('headOfHousehold', 1_616_450) - base('headOfHousehold', 269_300)).toBe(2_289)
  })

  it('worksheet 7: single with AGI >= $157,650 and taxable income <= $215,400 pays a flat 6%', () => {
    const r = stateTax(2025, 'NY', 'single', 180_000)
    expect(r.taxableIncome).toBe(172_000)
    expect(r.tax).toBeCloseTo(172_000 * 0.06, 2)
  })

  it('no recapture at or below $107,650 AGI', () => {
    const r = stateTax(2025, 'NY', 'single', 100_000)
    expect(r.tax).toBeCloseTo(bracketTax(92_000, ny.single), 6)
  })

  it('NYC rate schedule base amounts', () => {
    const nyc = y25.localities.find((l) => l.id === 'ny-nyc')!.components[0]
    const at = (status: FilingStatus, income: number) =>
      Math.round(componentTax(nyc, { status, stateTaxable: income, stateTax: 0, wages: 0, persons: 1 }))
    expect(at('single', 25_000)).toBe(858)
    expect(at('single', 50_000)).toBe(1_813)
    expect(at('married', 45_000)).toBe(1_545)
    expect(at('married', 90_000)).toBe(3_264)
    expect(at('headOfHousehold', 30_000)).toBe(1_030)
    expect(at('headOfHousehold', 60_000)).toBe(2_176)
  })

  it('Yonkers surcharge is 16.75% of state tax', () => {
    const yonkers = y25.localities.find((l) => l.id === 'ny-yonkers')!.components[0]
    expect(componentTax(yonkers, { status: 'single', stateTaxable: 0, stateTax: 4_000, wages: 0, persons: 1 })).toBeCloseTo(670, 6)
  })
})

describe('Maryland (Comptroller Withholding Tax Facts 2025, Schedule II)', () => {
  // https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/facts/Withholding-Tax-Facts-2025.pdf
  it.each([
    [1_000, 20],
    [2_000, 50],
    [3_000, 90],
    [150_000, 7_072.5],
    [175_000, 8_322.5],
    [225_000, 10_947.5],
    [300_000, 15_072.5],
    [600_000, 32_322.5],
    [1_200_000, 69_822.5],
  ])('married at $%d is $%d', (income, expected) => {
    expect(bracketTax(income, y25.states.MD.brackets!.married)).toBeCloseTo(expected, 2)
  })

  it('head of household uses Schedule II', () => {
    const r = stateTax(2025, 'MD', 'headOfHousehold', 60_000, 1)
    expect(r.taxableIncome).toBe(60_000 - 6_700 - 3_200 - 3_200)
    expect(r.tax).toBeCloseTo(bracketTax(r.taxableIncome, y25.states.MD.brackets!.married), 6)
  })

  it('Frederick County applies one tiered rate to all income', () => {
    const frederick = y25.localities.find((l) => l.id === 'md-frederick')!.components[0]
    const at = (income: number) => componentTax(frederick, { status: 'single', stateTaxable: income, stateTax: 0, wages: 0, persons: 1 })
    expect(at(40_000)).toBeCloseTo(40_000 * 0.0275, 6)
    expect(at(160_000)).toBeCloseTo(160_000 * 0.032, 6)
  })

  it('Anne Arundel County is graduated (2.70% / 2.94% / 3.20%)', () => {
    const aa = y25.localities.find((l) => l.id === 'md-anne-arundel')!.components[0]
    const r = componentTax(aa, { status: 'single', stateTaxable: 100_000, stateTax: 0, wages: 0, persons: 1 })
    expect(r).toBeCloseTo(50_000 * 0.027 + 50_000 * 0.0294, 6)
  })
})

describe('South Carolina 2026 (H.4216)', () => {
  // https://dor.sc.gov/news/information-about-h-4216 : 1.99% under $30,000; 5.21% minus $966 at $30,000 and above.
  it.each([30_000, 55_000, 120_000])('taxable income $%d matches 5.21%% x income - $966', (ti) => {
    expect(bracketTax(ti, y26.states.SC.brackets!.single)).toBeCloseTo(0.0521 * ti - 966, 0)
  })

  it('phases out the SC Income Adjusted Deduction between $40,000 and $95,000 (single)', () => {
    expect(stateTax(2026, 'SC', 'single', 40_000).deductions).toBe(15_000)
    expect(stateTax(2026, 'SC', 'single', 67_500).deductions).toBeCloseTo(7_500, 6)
    expect(stateTax(2026, 'SC', 'single', 95_000).deductions).toBe(0)
  })
})

describe('other states', () => {
  it('states without a wage income tax return zero', () => {
    for (const code of ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'] as StateCode[]) {
      expect(stateTax(2026, code, 'single', 100_000).tax).toBe(0)
    }
  })

  it('every state computes a finite, non-negative tax for every filing status and year', () => {
    for (const year of [2025, 2026]) {
      for (const code of STATE_CODES) {
        for (const status of ['single', 'married', 'headOfHousehold'] as FilingStatus[]) {
          for (const agi of [0, 25_000, 85_000, 250_000, 2_000_000]) {
            const r = stateTax(year, code, status, agi, 2)
            expect(Number.isFinite(r.tax), `${year} ${code} ${status} ${agi}`).toBe(true)
            expect(r.tax).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })

  it('flat-tax examples', () => {
    // Illinois 2026: 4.95% after a $2,925 exemption
    expect(stateTax(2026, 'IL', 'single', 60_000).tax).toBeCloseTo((60_000 - 2_925) * 0.0495, 6)
    // Pennsylvania: 3.07% with no deductions
    expect(stateTax(2026, 'PA', 'single', 60_000).tax).toBeCloseTo(1_842, 6)
    // Georgia 2026: 4.99% (HB 463) after the $12,000 standard deduction
    expect(stateTax(2026, 'GA', 'single', 60_000).tax).toBeCloseTo(48_000 * 0.0499, 6)
    // Mississippi 2026: 4% over $10,000 after $2,300 deduction and $6,000 exemption
    expect(stateTax(2026, 'MS', 'single', 60_000).tax).toBeCloseTo((60_000 - 8_300 - 10_000) * 0.04, 6)
  })

  it('Utah credit: 6% of the federal standard deduction, phased out at 1.3% over the threshold', () => {
    const r = stateTax(2026, 'UT', 'single', 50_000)
    const credit = 0.06 * 16_100 - 0.013 * (50_000 - 18_213)
    expect(r.tax).toBeCloseTo(50_000 * 0.0445 - credit, 6)
  })

  it('Vermont minimum tax: at least 3% of AGI above $150,000', () => {
    const r = stateTax(2026, 'VT', 'single', 160_000)
    expect(r.tax).toBeGreaterThanOrEqual(0.03 * 160_000)
  })

  it('Indiana county rates come from Departmental Notice #1', () => {
    const marion = y26.localities.find((l) => l.id === 'in-marion')!
    expect(marion.components[0].rate).toBe(0.0202)
    expect(y26.localities.filter((l) => l.state === 'IN')).toHaveLength(92)
    expect(y25.localities.find((l) => l.id === 'in-howard')!.components[0].rate).toBe(0.0195)
    expect(y26.localities.find((l) => l.id === 'in-howard')!.components[0].rate).toBe(0.0235)
  })
})
