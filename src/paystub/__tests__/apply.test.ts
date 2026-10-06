import { describe, expect, it } from 'vitest'
import { reconcile } from '../../budget/reconcile'
import { withholdingCheck } from '../../budget/withholding'
import { calculateTaxes } from '../../engine'
import { toTaxInput } from '../../model/derive'
import { DEFAULT_PROFILE } from '../../model/profile'
import { applyStub, reviewAnnualGross, reviewFromStub } from '../apply'
import { parsePaystub } from '../parse'
import { ADP_CA, GUSTO_NYC, OCR_SIDE_BY_SIDE, TESSERACT_PHOTO, TESSERACT_SCAN } from './fixtures'

const fresh = () => structuredClone(DEFAULT_PROFILE)

describe('reviewFromStub + applyStub', () => {
  it('ADP salaried stub fills salary, frequency, deductions, state and withholding', () => {
    const r = reviewFromStub(parsePaystub(ADP_CA))
    expect(r.payType).toBe('salary') // 80 standard hours -> salaried
    expect(reviewAnnualGross(r)).toBeCloseTo(3269.23 * 26, 2)
    const p = applyStub(fresh(), r)
    expect(p.income).toMatchObject({ payType: 'salary', annualSalary: 84999.98, payFrequency: 'biweekly' })
    expect(p.deductions.retirementPercent).toBe(6) // 196.15 / 3,269.23
    expect(p.deductions.healthInsurance).toEqual({ amount: 120, frequency: 'paycheck' })
    expect(p.deductions.hsa).toEqual({ amount: 50, frequency: 'paycheck' })
    expect(p.taxes).toMatchObject({ state: 'CA', filingStatus: 'single', year: 2026 })
    expect(p.withholding).toEqual({ federalPerPaycheck: 310.06, statePerPaycheck: 136.5, localPerPaycheck: null, payDate: '2026-10-02' })
    expect(p.income.netPerPaycheck).toBe(2173.11)
    expect(r.notes.join(' ')).toMatch(/where your employer withholds/)
  })

  it('a scanned stub reconciles with the estimate to within FICA rounding', () => {
    const p = applyStub(fresh(), reviewFromStub(parsePaystub(TESSERACT_SCAN)))
    p.taxes.state = 'IL'
    expect(p.income.netPerPaycheck).toBe(1884.93)
    const r = reconcile(p, calculateTaxes(toTaxInput(p)!))!
    // Every deduction on this stub is entered, so only withholding explains the gap.
    expect(r.explained.map((g) => g.name)).toEqual(['Federal income tax', 'Illinois income tax'])
    expect(Math.abs(r.unexplained)).toBeLessThan(2)
  })

  it('net pay can be unchecked, keeping the estimate', () => {
    const r = reviewFromStub(parsePaystub(ADP_CA))
    r.netPerPaycheck!.use = false
    expect(applyStub(fresh(), r).income.netPerPaycheck).toBeNull()
  })

  it('Gusto hourly stub fills hourly pay, NYC and flags the Roth 401(k)', () => {
    const r = reviewFromStub(parsePaystub(GUSTO_NYC))
    expect(r.payType).toBe('hourly')
    expect(r.hoursPerWeek!.value).toBe(38.5)
    expect(r.localityId!.value).toBe('ny-nyc')
    const p = applyStub(fresh(), r)
    expect(p.income).toMatchObject({ payType: 'hourly', hourlyRate: 22, hoursPerWeek: 38.5, payFrequency: 'weekly' })
    expect(p.taxes).toMatchObject({ state: 'NY', localityId: 'ny-nyc' })
    expect(r.notes.join(' ')).toMatch(/Roth 401\(k\)/)
  })

  it('OCR side-by-side stub: married, semimonthly, Texas', () => {
    const p = applyStub(fresh(), reviewFromStub(parsePaystub(OCR_SIDE_BY_SIDE)))
    expect(p.income).toMatchObject({ annualSalary: 70000.08, payFrequency: 'semimonthly' })
    expect(p.taxes).toMatchObject({ state: 'TX', filingStatus: 'married' })
    expect(p.deductions.retirementPercent).toBe(6)
    expect(p.deductions.healthInsurance.amount).toBe(100.5)
  })

  it('applies only the values the user keeps checked', () => {
    const r = reviewFromStub(parsePaystub(ADP_CA))
    r.state!.use = false
    r.healthPerPaycheck!.use = false
    r.grossPerPaycheck!.value = 4000 // user correction
    const before = fresh()
    before.taxes.state = 'NV'
    const p = applyStub(before, r)
    expect(p.taxes.state).toBe('NV')
    expect(p.deductions.healthInsurance.amount).toBe(0)
    expect(p.income.annualSalary).toBe(104000)
  })

  it('leaves existing expenses and goals untouched', () => {
    const before = fresh()
    before.goals.emergencyFund.target = 9_000
    const p = applyStub(before, reviewFromStub(parsePaystub(ADP_CA)))
    expect(p.goals.emergencyFund.target).toBe(9_000)
    expect(p.expenses).toEqual(before.expenses)
  })
})

describe('withholdingCheck', () => {
  const profileFrom = (text: string) => applyStub(fresh(), reviewFromStub(parsePaystub(text)))

  it('compares annualized withholding to estimated tax, line by line', () => {
    const p = profileFrom(ADP_CA)
    const tax = calculateTaxes(toTaxInput(p)!)
    const c = withholdingCheck(p, tax)!
    expect(c.rows.map((r) => r.name)).toEqual(['Federal income tax', 'California income tax'])
    expect(c.rows[0].withheld).toBeCloseTo(310.06 * 26, 2)
    expect(c.rows[0].owed).toBeCloseTo(tax.federal.tax, 6)
    expect(c.total.diff).toBeCloseTo(c.rows[0].diff + c.rows[1].diff, 6)
    expect(['refund', 'owe', 'close']).toContain(c.verdict)
  })

  it('verdicts: refund, owe, close', () => {
    const p = profileFrom(OCR_SIDE_BY_SIDE)
    const tax = calculateTaxes(toTaxInput(p)!)
    const perCheck = tax.federal.tax / 24
    const at = (fed: number) => withholdingCheck({ ...p, withholding: { federalPerPaycheck: fed, statePerPaycheck: 0, localPerPaycheck: 0, payDate: null } }, tax)!.verdict
    expect(at(perCheck)).toBe('close')
    expect(at(perCheck + 50)).toBe('refund') // +$1,200/yr
    expect(at(perCheck - 50)).toBe('owe')
  })

  it('is absent without stub data and warns about a spouse\'s paychecks', () => {
    const p = fresh()
    p.income.annualSalary = 80_000
    p.taxes.state = 'TX'
    expect(withholdingCheck(p, calculateTaxes(toTaxInput(p)!))).toBeNull()
    p.taxes.filingStatus = 'married'
    p.taxes.spouseIncome = 50_000
    p.withholding = { federalPerPaycheck: 300, statePerPaycheck: 0, localPerPaycheck: 0, payDate: null }
    expect(withholdingCheck(p, calculateTaxes(toTaxInput(p)!))!.notes[0]).toMatch(/spouse/)
  })
})

describe('unread withholding is unknown, not $0', () => {
  it('a photo where state withholding was illegible leaves it out of the check', () => {
    const r = reviewFromStub(parsePaystub(TESSERACT_PHOTO))
    expect(r.stateWithheld).toEqual({ value: 0, use: false })
    const p = applyStub(fresh(), r)
    p.taxes.state = 'IL'
    expect(p.withholding).toMatchObject({ federalPerPaycheck: 221.42, statePerPaycheck: null })
    const c = withholdingCheck(p, calculateTaxes(toTaxInput(p)!))!
    expect(c.rows.map((x) => x.name)).toEqual(['Federal income tax'])
    expect(c.notes[0]).toMatch(/Illinois income tax withholding wasn't read/)
    expect(c.verdict).not.toBe('owe')
  })

  it('the user can type the missing state amount in', () => {
    const r = reviewFromStub(parsePaystub(TESSERACT_PHOTO))
    r.stateWithheld = { value: 117.22, use: true }
    const p = applyStub(fresh(), r)
    expect(p.withholding!.statePerPaycheck).toBe(117.22)
  })
})
