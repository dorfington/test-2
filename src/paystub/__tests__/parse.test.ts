import { describe, expect, it } from 'vitest'
import { findDates, frequencyFromDays, parsePaystub, segmentLine } from '../parse'
import { ADP_CA, GUSTO_NYC, OCR_SIDE_BY_SIDE, TESSERACT_PHOTO, TESSERACT_SCAN } from './fixtures'

const v = <T,>(f: { value: T } | undefined) => f?.value

describe('segmentLine', () => {
  it('splits side-by-side tables into label + numbers segments', () => {
    const segs = segmentLine('Salary 2,916.67 55,416.73   FED W/H 301.12 5,721.28')
    expect(segs.map((s) => [s.label, s.nums])).toEqual([
      ['Salary', [2916.67, 55416.73]],
      ['FED W/H', [301.12, 5721.28]],
    ])
  })

  it('keeps integers like 401 in the label and reads negatives and $ amounts', () => {
    expect(segmentLine('401(K) -196.15 3,726.85')[0]).toMatchObject({ label: '401(K)', nums: [196.15, 3726.85] })
    expect(segmentLine('Gross Pay $ 3,269.23')[0].nums).toEqual([3269.23])
  })

  it('fixes OCR letter-for-digit slips only inside numbers', () => {
    expect(segmentLine('Dental 12.5O 237.50')[0].nums).toEqual([12.5, 237.5])
    expect(segmentLine('SOC SEC 180.83')[0].label).toBe('SOC SEC')
  })
})

describe('dates and frequency', () => {
  it('reads numeric, ISO and written dates', () => {
    expect(findDates('Period 09/14/2026 - 9/27/26, paid 2026-10-02 or Oct 9, 2026')).toEqual(['2026-09-14', '2026-09-27', '2026-10-02', '2026-10-09'])
  })

  it('maps period length to frequency', () => {
    expect(frequencyFromDays(7)).toBe('weekly')
    expect(frequencyFromDays(14)).toBe('biweekly')
    expect(frequencyFromDays(15)).toBe('semimonthly')
    expect(frequencyFromDays(30)).toBe('monthly')
    expect(frequencyFromDays(10)).toBeUndefined()
  })
})

describe('parsePaystub: ADP-style salaried stub (CA, biweekly)', () => {
  const d = parsePaystub(ADP_CA)
  it('reads pay, dates and frequency', () => {
    expect(v(d.grossPay)).toBe(3269.23)
    expect(v(d.grossYtd)).toBe(62115.37)
    expect(v(d.netPay)).toBe(2173.11)
    expect(v(d.payDate)).toBe('2026-10-02')
    expect(v(d.payFrequency)).toBe('biweekly')
    expect(v(d.filingStatus)).toBe('single')
  })
  it('handles a "rate before hours" header', () => {
    expect(v(d.hours)).toBe(80)
    expect(v(d.hourlyRate)).toBe(40.8654)
  })
  it('sums health premiums, reads 401(k) and HSA, ignores the employer match', () => {
    expect(v(d.healthInsurance)).toBe(120)
    expect(d.healthInsurance!.source).toContain('Medical')
    expect(v(d.retirement)).toBe(196.15)
    expect(v(d.hsa)).toBe(50)
  })
  it('reads taxes and the state, skipping SDI', () => {
    expect(v(d.federalWithholding)).toBe(310.06)
    expect(v(d.socialSecurity)).toBe(195.25)
    expect(v(d.medicare)).toBe(45.66)
    expect(v(d.stateWithholding)).toBe(136.5)
    expect(v(d.state)).toBe('CA')
    expect(d.state!.source).toBe('CA State Income Tax -136.50 2,593.50')
  })
})

describe('parsePaystub: Gusto-style hourly stub (NYC, weekly)', () => {
  const d = parsePaystub(GUSTO_NYC)
  it('reads hourly rate and regular hours, weekly from written dates', () => {
    expect(v(d.hourlyRate)).toBe(22)
    expect(v(d.hours)).toBe(38.5)
    expect(v(d.payFrequency)).toBe('weekly')
    expect(v(d.payDate)).toBe('2026-10-09')
    expect(v(d.grossPay)).toBe(913)
  })
  it('separates state, NYC, PFL/SDI and Roth', () => {
    expect(v(d.state)).toBe('NY')
    expect(v(d.stateWithholding)).toBe(37.85)
    expect(v(d.localWithholding)).toBe(26.1)
    expect(v(d.retirement)).toBe(45.65)
    expect(v(d.rothRetirement)).toBe(20)
    expect(v(d.healthInsurance)).toBe(42)
  })
})

describe('parsePaystub: OCR photo, side-by-side tables (TX, semimonthly)', () => {
  const d = parsePaystub(OCR_SIDE_BY_SIDE)
  it('reads both columns of each row, citing only the matching column', () => {
    expect(d.federalWithholding!.source).toBe('FED W/H 301.12 5,721.28')
    expect(d.healthInsurance!.source).toBe('Dental 12.50 237.50 + Med Ins 88.00 1,672.00')
    expect(d.filingStatus!.source).toBe('Marital Status: Married')
    expect(d.payFrequency!.source).toBe('Pay period 2026-10-01 to 2026-10-15 (15 days)')
    expect(v(d.grossPay)).toBe(2916.67)
    expect(v(d.federalWithholding)).toBe(301.12)
    expect(v(d.socialSecurity)).toBe(180.83)
    expect(v(d.medicare)).toBe(42.29)
    expect(v(d.netPay)).toBe(2112.43)
  })
  it('reads 403(b), sums dental + medical with an OCR fix', () => {
    expect(v(d.retirement)).toBe(175)
    expect(v(d.healthInsurance)).toBe(100.5)
  })
  it('gets frequency from the period even when the pay date comes first', () => {
    expect(v(d.payFrequency)).toBe('semimonthly')
    expect(v(d.payDate)).toBe('2026-10-15')
  })
  it('reads the work state and marital status', () => {
    expect(v(d.state)).toBe('TX')
    expect(v(d.filingStatus)).toBe('married')
    expect(d.stateWithholding).toBeUndefined()
  })
})

describe('parsePaystub: not a pay stub', () => {
  it('finds nothing in unrelated text', () => {
    const d = parsePaystub('Grocery receipt\nApples 3.99\nBread 2.49\nTotal 6.48')
    expect(d.matchedLines).toBe(0)
    expect(d.grossPay).toBeUndefined()
  })
})

describe('parsePaystub: real Tesseract output', () => {
  it('scan: recovers the state tax row that merged with a neighbouring header', () => {
    const d = parsePaystub(TESSERACT_SCAN)
    expect(v(d.grossPay)).toBe(2692.31)
    expect(v(d.payFrequency)).toBe('biweekly')
    expect(v(d.filingStatus)).toBe('single')
    expect(v(d.federalWithholding)).toBe(221.42)
    expect(v(d.stateWithholding)).toBe(117.22)
    expect(d.stateWithholding!.source).toMatch(/Income Tax/)
    expect(v(d.retirement)).toBe(134.62)
    expect(v(d.healthInsurance)).toBe(99.75)
    expect(v(d.hsa)).toBe(40)
    expect(v(d.netPay)).toBe(1884.93)
  })

  it('blurry tilted photo: reads what is legible and skips the garbled amounts', () => {
    const d = parsePaystub(TESSERACT_PHOTO)
    expect(v(d.grossPay)).toBe(2692.31)
    expect(v(d.federalWithholding)).toBe(221.42)
    expect(v(d.medicare)).toBe(36.84)
    expect(v(d.retirement)).toBe(134.62)
    expect(v(d.healthInsurance)).toBe(99.75)
    // "n722 222118" lost its decimal points: better to leave it out than guess.
    expect(d.stateWithholding).toBeUndefined()
  })
})
