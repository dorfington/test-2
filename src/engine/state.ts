import type { Bracket, FilingStatus, StateCode, StateTax, TaxYearData } from '../taxdata'
import { bracketIndex, bracketTax, marginalRate, phaseOut, pick } from './brackets'
import type { StateResult } from './types'

export interface StateTaxInput {
  status: FilingStatus
  /** State AGI: federal AGI adjusted for this state's treatment of pre-tax deductions. */
  agi: number
  dependents: number
  /** Federal income tax after credits (for states that let you deduct it). */
  federalTax: number
  /** Federal standard deduction for the filer (Utah's credit is based on it). */
  federalStandardDeduction: number
}

/** Federal AGI -> state AGI, adding back pre-tax deductions the state does not exclude. */
export function stateAgi(
  s: StateTax,
  federalAgi: number,
  preTax: { retirement: number; section125: number; hsa: number },
): number {
  return (
    federalAgi +
    (s.taxes401k ? preTax.retirement : 0) +
    (s.taxesSection125 ? preTax.section125 : 0) +
    (s.taxesHsa ? preTax.hsa : 0)
  )
}

/**
 * Tax under New York-style benefit recapture. Above the AGI threshold the
 * benefit of the lower brackets phases out over `phaseInRange` dollars of
 * AGI, so the tax approaches (top applicable rate x taxable income).
 * The recapture amounts are derived from the brackets themselves and
 * reproduce the constants printed in NY's tax computation worksheets.
 */
export function recaptureTax(
  taxable: number,
  agi: number,
  b: Bracket[],
  r: NonNullable<StateTax['recapture']>,
): number {
  const sched = (x: number) => bracketTax(x, b)
  if (agi <= r.agiThreshold) return sched(taxable)
  if (agi > r.flatTopRateAboveAgi) return taxable * b[b.length - 1].rate
  const frac = (over: number) => Math.min(1, Math.max(0, agi - over) / r.phaseInRange)
  const k0 = bracketIndex(r.agiThreshold + 0.01, b)
  const k = bracketIndex(taxable, b)
  if (k <= k0) {
    // Phase toward a flat rate at the threshold bracket's rate.
    return sched(taxable) + (taxable * b[k0].rate - sched(taxable)) * frac(r.agiThreshold)
  }
  const base = recaptureBase(k, b)
  const incremental = k + 1 < b.length ? recaptureBase(k + 1, b) - base : 0
  return sched(taxable) + base + incremental * frac(b[k].over)
}

/** Recapture base for bracket k: the full benefit of all brackets below k-1 (see NY worksheets). */
export function recaptureBase(k: number, b: Bracket[]): number {
  const s = b[k].over
  return s * b[k - 1].rate - bracketTax(s, b)
}

export function stateIncomeTax(
  code: StateCode,
  data: TaxYearData,
  input: StateTaxInput,
): StateResult & { warnings: string[] } {
  const s = data.states[code]
  const { status, agi } = input
  const warnings: string[] = []
  const base = {
    code,
    name: s.name,
    hasIncomeTax: s.type !== 'none',
    agi,
    notes: s.notes,
  }
  if (s.type === 'none' || !s.brackets) {
    return { ...base, deductions: 0, taxableIncome: 0, taxBeforeCredits: 0, credits: 0, tax: 0, marginalRate: 0, warnings }
  }

  const hohUses = s.hohUses ?? 'single'
  const married = status === 'married'
  const persons = married ? 2 : 1
  let deductions = 0
  let credits = 0

  // Standard deduction
  if (s.standardDeduction) {
    const sd = pick(s.standardDeduction.amount, status, hohUses)
    if (sd.fellBack) warnings.push(`${s.name}: head-of-household standard deduction not in data; used the ${hohUses} amount.`)
    let amount = sd.value
    const po = s.standardDeduction.phaseout
    if (po) amount = phaseOut(amount, agi, po.start[status], po.end[status], po.floor?.[status] ?? 0)
    deductions += amount
  }

  // Personal and dependent exemptions (deductions or credits)
  const ex = s.exemptions
  if (ex) {
    const tier = ex.agiTiers?.find((t) => t.agiUpTo === null || agi <= t.agiUpTo)
    const deps = Math.max(0, input.dependents - ex.firstDependentsExcluded)
    let personal = tier?.perPerson !== undefined ? tier.perPerson * persons : pick(ex.personal, status, hohUses).value
    let perDep = tier?.perDependent ?? ex.perDependent
    if (ex.phaseout) {
      const { start, end, floor } = ex.phaseout
      personal = phaseOut(personal, agi, start[status], end[status], floor?.[status] ?? 0)
      perDep = phaseOut(perDep, agi, start[status], end[status], floor?.[status] ?? 0)
    }
    let dependentTotal = perDep * deps
    if (ex.stepPhaseout) {
      // California: each credit is reduced by $X per $2,500 (or part) of AGI over the threshold.
      const { start, step, amountPerCredit } = ex.stepPhaseout
      const cut = Math.ceil(Math.max(0, agi - start[status]) / step) * amountPerCredit
      personal = Math.max(0, personal / persons - cut) * persons
      dependentTotal = Math.max(0, perDep - cut) * deps
    }
    if (ex.kind === 'deduction') deductions += personal
    else credits += personal
    if ((ex.dependentKind ?? ex.kind) === 'deduction') deductions += dependentTotal
    else credits += dependentTotal
  }

  // Deduction for federal income tax paid (AL, MO, OR)
  const fd = s.federalTaxDeduction
  if (fd) {
    const fedTax = Math.max(0, input.federalTax)
    const pct = fd.agiTiers?.find((t) => t.agiUpTo === null || agi <= t.agiUpTo)?.percent ?? 1
    let cap = fd.cap?.[status] ?? Infinity
    if (fd.capPhaseout && cap !== Infinity) {
      cap = phaseOut(cap, agi, fd.capPhaseout.start[status], fd.capPhaseout.end[status])
    }
    deductions += Math.min(fedTax * pct, cap)
  }

  const taxableIncome = Math.max(0, agi - deductions)

  // Tax from the rate schedule
  const sched = pick(s.brackets, status, hohUses)
  if (sched.fellBack && !s.hohUses) {
    warnings.push(`${s.name}: head-of-household brackets not in data; used the single brackets.`)
  }
  let brackets = sched.value
  if (s.lowIncomeSchedule && taxableIncome <= s.lowIncomeSchedule.maxTaxableIncome) {
    brackets = s.lowIncomeSchedule.brackets
  }
  let taxBeforeCredits = s.recapture
    ? recaptureTax(taxableIncome, agi, brackets, s.recapture)
    : bracketTax(taxableIncome, brackets)

  // Utah: credit of a % of the federal standard deduction plus dependent exemptions, phased out by AGI.
  const tc = s.taxpayerCredit
  if (tc) {
    const raw = tc.percent * (input.federalStandardDeduction + tc.dependentExemption * input.dependents)
    credits += Math.max(0, raw - tc.phaseoutRate * Math.max(0, agi - tc.phaseoutStart[status]))
  }

  let tax = Math.max(0, taxBeforeCredits - credits)
  if (s.minimumTax && agi > s.minimumTax.agiOver) {
    tax = Math.max(tax, s.minimumTax.rate * agi)
    taxBeforeCredits = Math.max(taxBeforeCredits, tax)
  }

  return {
    ...base,
    deductions,
    taxableIncome,
    taxBeforeCredits,
    credits: Math.min(credits, taxBeforeCredits),
    tax,
    marginalRate: taxableIncome > 0 ? marginalRate(taxableIncome, brackets) : 0,
    warnings,
  }
}
