import { getTaxYear, type PayrollTax, type TaxYearData } from '../taxdata'
import { federalIncomeTax } from './federal'
import { fica, ficaWages } from './fica'
import { localTax } from './local'
import { stateAgi, stateIncomeTax } from './state'
import type { Earner, LineItem, TaxInput, TaxResult } from './types'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function payrollTax(p: PayrollTax, data: TaxYearData, earners: Earner[]): number {
  const cap = p.wageBase === 'socialSecurity' ? data.fica.socialSecurity.wageBase : (p.wageBase ?? Infinity)
  return sum(
    earners.map((e) => {
      const amount = Math.min(ficaWages(e), cap) * p.rate
      return p.annualMax !== undefined ? Math.min(amount, p.annualMax) : amount
    }),
  )
}

/** Normalizes earners: only married-filing-jointly returns include a second earner; negatives become 0. */
function cleanEarners(input: TaxInput): Earner[] {
  const list = input.filingStatus === 'married' ? input.earners.slice(0, 2) : input.earners.slice(0, 1)
  return list.map((e) => {
    const wages = Math.max(0, e.wages || 0)
    const section125 = Math.min(wages, Math.max(0, e.section125 || 0))
    const hsa = Math.min(wages - section125, Math.max(0, e.hsa || 0))
    const retirement = Math.min(wages - section125 - hsa, Math.max(0, e.retirement || 0))
    return { wages, retirement, section125, hsa }
  })
}

/** Annual take-home pay for a household. Pure: same input, same output. */
export function calculateTaxes(input: TaxInput): TaxResult {
  const data = getTaxYear(input.year)
  const status = input.filingStatus
  const earners = cleanEarners(input)
  const dependents = Math.max(0, Math.floor(input.dependents || 0))
  const warnings: string[] = []

  const gross = sum(earners.map((e) => e.wages))
  const preTax = {
    retirement: sum(earners.map((e) => e.retirement)),
    section125: sum(earners.map((e) => e.section125)),
    hsa: sum(earners.map((e) => e.hsa)),
    total: 0,
  }
  preTax.total = preTax.retirement + preTax.section125 + preTax.hsa

  // Federal
  const federalAgi = gross - preTax.total
  const federal = federalIncomeTax(data.federal, status, federalAgi, federalAgi, dependents)
  const ficaResult = fica(data.fica, status, earners)

  // State
  const st = data.states[input.state]
  const { warnings: stateWarnings, ...state } = stateIncomeTax(input.state, data, {
    status,
    agi: stateAgi(st, federalAgi, preTax),
    dependents,
    federalTax: federal.tax,
    federalStandardDeduction: federal.standardDeduction,
  })
  warnings.push(...stateWarnings)

  // Local
  const { result: local, warnings: localWarnings } = localTax(data, input.state, input.localityId, input.customLocalRate, {
    status,
    stateTaxable: state.taxableIncome,
    stateTax: state.tax,
    wages: gross - preTax.section125,
    persons: (status === 'married' ? 2 : 1) + dependents,
  })
  warnings.push(...localWarnings)

  // State payroll programs (SDI, paid leave, employee UI)
  const statePayroll: LineItem[] =
    input.includeStatePayroll === false
      ? []
      : st.payrollTaxes.map((p) => ({ name: p.name, amount: payrollTax(p, data, earners) })).filter((i) => i.amount > 0)
  const statePayrollTotal = sum(statePayroll.map((i) => i.amount))

  const totalTax = federal.tax + ficaResult.total + state.tax + (local?.tax ?? 0) + statePayrollTotal
  const net = gross - preTax.total - totalTax

  earners.forEach((e, i) => {
    if (e.retirement > data.federal.retirementDeferralLimit) {
      warnings.push(
        `${i === 0 ? 'Your' : "Your spouse's"} 401(k)/403(b) contribution is above the ${data.year} limit of $${data.federal.retirementDeferralLimit.toLocaleString()} (catch-up contributions for age 50+ can raise it).`,
      )
    }
  })
  if (net < 0) warnings.push('Deductions and taxes exceed gross pay. Check your pre-tax deductions.')

  return {
    year: data.year,
    gross,
    preTax,
    federal,
    fica: ficaResult,
    state,
    local,
    statePayroll,
    statePayrollTotal,
    totalTax,
    net,
    effectiveRate: gross > 0 ? totalTax / gross : 0,
    warnings,
  }
}

/** Combined marginal rate on the next $100 of the first earner's wages (all taxes). */
export function combinedMarginalRate(input: TaxInput): number {
  const step = 100
  const base = calculateTaxes(input)
  const bumped = calculateTaxes({
    ...input,
    earners: input.earners.map((e, i) => (i === 0 ? { ...e, wages: e.wages + step } : e)),
  })
  return (bumped.totalTax - base.totalTax) / step
}
