/**
 * Turns parsed pay stub values into an editable review, and applies the
 * values the user keeps to their profile. Pure functions.
 */
import { PERIODS_PER_YEAR, type PayFrequency, type Profile } from '../model/profile'
import { TAX_YEARS, type FilingStatus, type StateCode } from '../taxdata'
import { WEEKS_PER_PERIOD, type PaystubData } from './parse'

/** One reviewable value. `use` is the checkbox; `source` is the stub text it came from. */
export interface ReviewField<T> {
  value: T
  use: boolean
  source?: string
}

export interface StubReview {
  payFrequency?: ReviewField<PayFrequency>
  /** Salary: gross per paycheck × paychecks per year. Hourly: rate × hours per week × 52. */
  payType: 'salary' | 'hourly'
  grossPerPaycheck?: ReviewField<number>
  hourlyRate?: ReviewField<number>
  hoursPerWeek?: ReviewField<number>
  retirementPerPaycheck?: ReviewField<number>
  healthPerPaycheck?: ReviewField<number>
  hsaPerPaycheck?: ReviewField<number>
  state?: ReviewField<StateCode>
  localityId?: ReviewField<string>
  filingStatus?: ReviewField<FilingStatus>
  federalWithheld?: ReviewField<number>
  stateWithheld?: ReviewField<number>
  localWithheld?: ReviewField<number>
  payDate?: string
  /** Things the user should know before applying. */
  notes: string[]
}

const STANDARD_HOURS = [37.5, 40, 75, 80, 81.25, 86.67, 162.5, 173.33]
const isStandard = (h: number) => STANDARD_HOURS.some((s) => Math.abs(h - s) < 0.6)
const r2 = (n: number) => Math.round(n * 100) / 100

function field<T>(f: { value: T; source: string } | undefined): ReviewField<T> | undefined {
  return f ? { value: f.value, use: true, source: f.source } : undefined
}

export function reviewFromStub(d: PaystubData): StubReview {
  const notes: string[] = []
  const freq = d.payFrequency?.value
  const hourly = !!(d.hourlyRate && d.hours && !isStandard(d.hours.value))
  const review: StubReview = {
    payType: hourly ? 'hourly' : 'salary',
    payFrequency: field(d.payFrequency),
    grossPerPaycheck: field(d.grossPay),
    retirementPerPaycheck: field(d.retirement),
    healthPerPaycheck: field(d.healthInsurance),
    hsaPerPaycheck: field(d.hsa),
    state: field(d.state),
    filingStatus: field(d.filingStatus),
    federalWithheld: field(d.federalWithholding),
    stateWithheld: field(d.stateWithholding),
    localWithheld: field(d.localWithholding),
    payDate: d.payDate?.value,
    notes,
  }
  if (d.hourlyRate && d.hours) {
    review.hourlyRate = field(d.hourlyRate)
    review.hoursPerWeek = {
      value: r2(d.hours.value / WEEKS_PER_PERIOD[freq ?? 'biweekly']),
      use: hourly,
      source: d.hours.source,
    }
    if (!freq) notes.push('Pay frequency wasn\'t found, so hours per week assume you\'re paid every 2 weeks. Check both.')
  }
  if (d.federalWithholding && !d.stateWithholding) {
    // Offer an empty box rather than silently treating state withholding as $0.
    review.stateWithheld = { value: 0, use: false }
    notes.push("State income tax withheld wasn't found on the stub. If it shows one, check the box and enter it; otherwise it's left out of the withholding check.")
  }
  if (d.localWithholding) {
    const src = d.localWithholding.source.toLowerCase()
    const id = /\bnyc\b|new york city/.test(src) ? 'ny-nyc' : /yonkers/.test(src) ? 'ny-yonkers' : /phila/.test(src) ? 'pa-philadelphia' : /detroit/.test(src) ? 'mi-detroit' : null
    if (id) review.localityId = { value: id, use: true, source: d.localWithholding.source }
  }
  if (!d.grossPay) notes.push('Gross pay wasn\'t found. Enter it yourself, or try a clearer photo or the PDF from your payroll site.')
  if (d.state) notes.push('The state on a pay stub is where your employer withholds tax. If you live in a different state, change it on the Taxes step.')
  if (d.rothRetirement) {
    notes.push(`Roth 401(k) contributions (${'$'}${d.rothRetirement.value.toFixed(2)}/paycheck) are after-tax, so they aren't a pre-tax deduction. Add them as an "Investing" expense if you want them in your savings.`)
  }
  if (review.payType === 'salary' && d.grossYtd && d.grossPay && freq && d.payDate) {
    // A big gap between YTD and this paycheck usually means a bonus or overtime this year.
    const month = Number(d.payDate.value.slice(5, 7))
    const expected = d.grossPay.value * PERIODS_PER_YEAR[freq] * (month / 12)
    if (d.grossYtd.value > expected * 1.15) notes.push('Your year-to-date pay is higher than this paycheck suggests (bonus or overtime?). The salary below uses this paycheck only.')
  }
  return review
}

/** Annual gross implied by the review (what the Income step will show). */
export function reviewAnnualGross(r: StubReview): number | undefined {
  if (r.payType === 'hourly' && r.hourlyRate?.use && r.hoursPerWeek?.use) return r.hourlyRate.value * r.hoursPerWeek.value * 52
  if (r.grossPerPaycheck?.use && r.payFrequency?.use) return r.grossPerPaycheck.value * PERIODS_PER_YEAR[r.payFrequency.value]
  return undefined
}

const used = <T,>(f: ReviewField<T> | undefined): T | undefined => (f?.use ? f.value : undefined)

/** Writes the checked review values into a copy of the profile. */
export function applyStub(profile: Profile, r: StubReview): Profile {
  const p = structuredClone(profile)
  const freq = used(r.payFrequency)
  if (freq) p.income.payFrequency = freq
  const pay = p.income.payFrequency

  const rate = used(r.hourlyRate)
  const hours = used(r.hoursPerWeek)
  const gross = used(r.grossPerPaycheck)
  if (r.payType === 'hourly' && rate && hours) {
    p.income.payType = 'hourly'
    p.income.hourlyRate = rate
    p.income.hoursPerWeek = hours
  } else if (gross) {
    p.income.payType = 'salary'
    p.income.annualSalary = r2(gross * PERIODS_PER_YEAR[pay])
  }

  const annual = p.income.payType === 'hourly' ? p.income.hourlyRate * p.income.hoursPerWeek * 52 : p.income.annualSalary
  const perPaycheckGross = annual / PERIODS_PER_YEAR[pay]
  const ret = used(r.retirementPerPaycheck)
  if (ret !== undefined && perPaycheckGross > 0) p.deductions.retirementPercent = Math.round((ret / perPaycheckGross) * 1000) / 10
  const health = used(r.healthPerPaycheck)
  if (health !== undefined) p.deductions.healthInsurance = { amount: health, frequency: 'paycheck' }
  const hsa = used(r.hsaPerPaycheck)
  if (hsa !== undefined) p.deductions.hsa = { amount: hsa, frequency: 'paycheck' }

  const state = used(r.state)
  if (state && state !== p.taxes.state) {
    p.taxes.state = state
    p.taxes.localityId = null
  }
  const locality = used(r.localityId)
  if (locality && p.taxes.state && locality.startsWith(p.taxes.state.toLowerCase() + '-')) p.taxes.localityId = locality
  const status = used(r.filingStatus)
  if (status) p.taxes.filingStatus = status

  if (r.payDate) {
    const year = Number(r.payDate.slice(0, 4))
    if (TAX_YEARS.includes(year)) p.taxes.year = year
  }

  const fed = used(r.federalWithheld)
  const st = used(r.stateWithheld)
  const loc = used(r.localWithheld)
  if (fed !== undefined || st !== undefined || loc !== undefined) {
    p.withholding = { federalPerPaycheck: fed ?? null, statePerPaycheck: st ?? null, localPerPaycheck: loc ?? null, payDate: r.payDate ?? null }
  }
  return p
}

