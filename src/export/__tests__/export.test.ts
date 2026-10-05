import { describe, expect, it } from 'vitest'
import { buildBudget } from '../../budget/budget'
import { calculateTaxes } from '../../engine'
import { toTaxInput, type WhatIf } from '../../model/derive'
import { DEFAULT_PROFILE, makeExpense } from '../../model/profile'
import { csvField, reportToCsv } from '../csv'
import { reportToPdf } from '../pdf'
import { buildReport, DISCLAIMER } from '../report'

function report(whatIf: WhatIf = {}) {
  const p = structuredClone(DEFAULT_PROFILE)
  p.income.annualSalary = 75_000
  p.income.payFrequency = 'biweekly'
  p.taxes.state = 'TX'
  p.expenses = [makeExpense('housing', { amount: 1_500 }), makeExpense('other', { name: 'Gym, "premium"', category: 'wants', amount: 50 })]
  p.goals.emergencyFund = { target: 6_000, saved: 1_000 }
  const tax = calculateTaxes(toTaxInput(p, whatIf)!)
  return buildReport(p, tax, buildBudget(p, tax, whatIf), whatIf, new Date('2026-10-05T12:00:00Z'))
}

describe('csvField', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
    expect(csvField(12.5)).toBe('12.5')
  })

  it('neutralizes spreadsheet formulas in text', () => {
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)")
  })
})

describe('CSV export', () => {
  const csv = reportToCsv(report())

  it('includes the pay breakdown per year, month and paycheck', () => {
    expect(csv).toContain('Item,Per year,Per month,Per paycheck')
    expect(csv).toContain('Gross pay,75000,6250,2884.62')
    // Texas single $75,000 (2026): take-home 61,592.50
    expect(csv).toContain('Take-home pay,61592.5,5132.71,2368.94')
  })

  it('lists every budget line, the split, goals and the disclaimer', () => {
    expect(csv).toContain('Rent / mortgage,Needs,1500,18000')
    expect(csv).toContain('"Gym, ""premium""",Wants,50,600')
    expect(csv).toMatch(/Needs,1500,\d+\.\d%,\d+\.\d%,50%/)
    expect(csv).toContain('Emergency fund,6000,1000,0,Not funded')
    expect(csv).toContain(DISCLAIMER)
  })

  it('starts with a BOM and uses CRLF line endings', () => {
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('\r\n')
  })

  it('labels a what-if scenario', () => {
    expect(reportToCsv(report({ monthlyHousing: 1_200 }))).toContain('What-if scenario (not saved),"rent $1,200/mo"')
  })
})

describe('PDF export', () => {
  it('builds a text PDF that contains the figures and disclaimer', () => {
    const doc = reportToPdf(report())
    const raw = doc.output()
    expect(raw.startsWith('%PDF-')).toBe(true)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    expect(raw).toContain('$61,592.50')
    expect(raw).toContain('Estimates only - not tax advice.')
  })
})
