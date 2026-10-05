import type { FilingStatus, StateCode } from '../taxdata'

/** One wage earner's annual pay and pre-tax payroll deductions (all in dollars per year). */
export interface Earner {
  wages: number
  /** Traditional 401(k)/403(b) deferrals: exempt from income tax, still subject to FICA. */
  retirement: number
  /** Section 125 (cafeteria plan) health premiums and FSA: exempt from income tax and FICA. */
  section125: number
  /** HSA contributions made through payroll: exempt from income tax and FICA. */
  hsa: number
}

export interface TaxInput {
  year: number
  filingStatus: FilingStatus
  state: StateCode
  /** Locality id from the tax data, or "custom" to use `customLocalRate`. */
  localityId?: string | null
  /** Decimal rate applied to wages when localityId is "custom" (e.g. 0.01 for 1%). */
  customLocalRate?: number
  /** First earner is you; a second earner (spouse) is only used when married filing jointly. */
  earners: Earner[]
  /** Qualifying children under 17 (used for the Child Tax Credit and state dependent amounts). */
  dependents: number
  /** Include employee-paid state programs such as SDI and paid family leave. Default true. */
  includeStatePayroll?: boolean
}

export interface LineItem {
  name: string
  amount: number
}

export interface FederalResult {
  agi: number
  standardDeduction: number
  taxableIncome: number
  taxBeforeCredits: number
  childTaxCredit: number
  /** Income tax after credits; negative when the refundable credit exceeds tax. */
  tax: number
  marginalRate: number
}

export interface FicaResult {
  socialSecurity: number
  medicare: number
  additionalMedicare: number
  total: number
}

export interface StateResult {
  code: StateCode
  name: string
  hasIncomeTax: boolean
  agi: number
  deductions: number
  taxableIncome: number
  taxBeforeCredits: number
  credits: number
  tax: number
  marginalRate: number
  notes: string[]
}

export interface LocalResult {
  id: string
  name: string
  items: LineItem[]
  tax: number
  notes: string[]
}

export interface TaxResult {
  year: number
  gross: number
  preTax: { retirement: number; section125: number; hsa: number; total: number }
  federal: FederalResult
  fica: FicaResult
  state: StateResult
  local: LocalResult | null
  statePayroll: LineItem[]
  statePayrollTotal: number
  totalTax: number
  /** Take-home pay: gross minus pre-tax deductions and all taxes. */
  net: number
  /** Total tax / gross. */
  effectiveRate: number
  warnings: string[]
}
