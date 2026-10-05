/**
 * Schema for a tax-year data file (src/taxdata/<year>.json).
 *
 * The engine contains no tax numbers: every rate, bracket, deduction,
 * threshold and cap lives in a data file that is validated against this
 * schema when it is loaded. To add a new tax year, copy the latest file,
 * update the numbers and sources, and register it in ./index.ts.
 */
import { z } from 'zod'

export const FILING_STATUSES = ['single', 'married', 'headOfHousehold'] as const
export type FilingStatus = (typeof FILING_STATUSES)[number]

const money = z.number().nonnegative()
const rate = z.number().min(0).max(1)

/** A value given separately for each filing status. */
const byStatus = <T extends z.ZodType>(t: T) =>
  z.object({ single: t, married: t, headOfHousehold: t })

/** Same, but head of household may be omitted (the engine then falls back). */
const byStatusHohOptional = <T extends z.ZodType>(t: T) =>
  z.object({ single: t, married: t, headOfHousehold: t.optional() })

export const SourceSchema = z.object({
  /** Short human-readable label, e.g. "IRS Rev. Proc. 2025-32". */
  name: z.string(),
  url: z.url(),
})

/** Marginal bracket: `rate` applies to income above `over` (up to the next bracket). */
export const BracketSchema = z.object({ over: money, rate })
const brackets = z
  .array(BracketSchema)
  .min(1)
  .refine((b) => b[0].over === 0, 'first bracket must start at 0')
  .refine((b) => b.every((x, i) => i === 0 || x.over > b[i - 1].over), 'brackets must ascend')

/** Linear phase-out of a deduction/exemption between AGI `start` and `end`, down to `floor`. */
const PhaseoutSchema = z.object({
  start: byStatus(money),
  end: byStatus(money),
  floor: byStatus(money).optional(),
})

const FederalSchema = z.object({
  sources: z.array(SourceSchema).min(1),
  standardDeduction: byStatus(money),
  brackets: byStatus(brackets),
  childTaxCredit: z.object({
    perChild: money,
    refundablePerChild: money,
    /** Refundable portion is limited to this % of earned income above `earnedIncomeThreshold`. */
    refundableEarnedIncomeRate: rate,
    earnedIncomeThreshold: money,
    phaseoutStart: byStatus(money),
    /** Credit is reduced by this amount for each $1,000 (or part) of AGI above the start. */
    phaseoutPer1000: money,
  }),
  /** Employee elective deferral limit for 401(k)/403(b) (before catch-up contributions). */
  retirementDeferralLimit: money,
})

const FicaSchema = z.object({
  sources: z.array(SourceSchema).min(1),
  socialSecurity: z.object({ rate, wageBase: money }),
  medicare: z.object({
    rate,
    additionalRate: rate,
    additionalThreshold: byStatus(money),
  }),
})

/** Employee-paid state payroll programs (SDI, paid family leave, employee UI). */
export const PayrollTaxSchema = z.object({
  name: z.string(),
  rate,
  /** Annual wage cap per worker; omit for no cap. Use "socialSecurity" to follow the SS wage base. */
  wageBase: z.union([money, z.literal('socialSecurity')]).optional(),
  /** Maximum annual contribution per worker, when the program states one directly. */
  annualMax: money.optional(),
  sources: z.array(SourceSchema).min(1),
  note: z.string().optional(),
})

const ExemptionSchema = z.object({
  /** Whether the amounts below reduce taxable income (deduction) or tax (credit). */
  kind: z.enum(['deduction', 'credit']),
  /** Total personal amount for the filer(s): e.g. MFJ is usually 2x single. */
  personal: byStatusHohOptional(money),
  perDependent: money,
  /** Linear phase-out by AGI (applies to personal and dependent amounts). */
  phaseout: PhaseoutSchema.optional(),
  /** Credit reduction of `amount` per credit for each `step` (or part) of AGI above `start` (California). */
  stepPhaseout: z
    .object({ start: byStatus(money), step: money, amountPerCredit: money })
    .optional(),
  /** Dependent amounts can be a credit even when personal amounts are a deduction (Maine). */
  dependentKind: z.enum(['deduction', 'credit']).optional(),
  /** Number of dependents that get no amount (New Mexico: all but one). */
  firstDependentsExcluded: z.number().int().nonnegative().default(0),
  /**
   * Amounts that vary by AGI: the first tier whose `agiUpTo` is >= AGI (null = no limit) wins.
   * `perPerson` replaces `personal` (x2 when married); `perDependent` replaces `perDependent`.
   */
  agiTiers: z
    .array(
      z.object({ agiUpTo: money.nullable(), perPerson: money.optional(), perDependent: money.optional() }),
    )
    .optional(),
})

const StandardDeductionSchema = z.object({
  amount: byStatusHohOptional(money),
  phaseout: PhaseoutSchema.optional(),
})

/** Utah-style credit: % of (federal standard deduction + dependent exemptions), phased out above AGI. */
const TaxpayerCreditSchema = z.object({
  percent: rate,
  dependentExemption: money,
  phaseoutStart: byStatus(money),
  phaseoutRate: rate,
})

/** Deduction of federal income tax paid (AL full; MO and OR limited). */
const FederalTaxDeductionSchema = z.object({
  /** % of federal tax deductible by AGI tier (first tier whose agiUpTo >= AGI); omit for 100%. */
  agiTiers: z.array(z.object({ agiUpTo: money.nullable(), percent: rate })).optional(),
  cap: byStatus(money).optional(),
  /** Cap shrinks linearly to 0 between these AGIs (Oregon). */
  capPhaseout: z.object({ start: byStatus(money), end: byStatus(money) }).optional(),
})

/**
 * New York-style "tax benefit recapture": above an AGI threshold the benefit of
 * the lower brackets is gradually taken back so that, at high AGI, the top
 * applicable rate applies to all taxable income.
 */
const RecaptureSchema = z.object({
  agiThreshold: money,
  phaseInRange: money,
  /** Above this AGI the top rate applies to all taxable income. */
  flatTopRateAboveAgi: money,
})

export const StateSchema = z.object({
  name: z.string(),
  type: z.enum(['none', 'flat', 'progressive']),
  sources: z.array(SourceSchema).min(1),
  /** Caveats shown to the user (simplifications, stale indexing, etc.). */
  notes: z.array(z.string()).default([]),
  brackets: byStatusHohOptional(brackets).optional(),
  /** When head-of-household brackets are not given: which schedule HoH uses. */
  hohUses: z.enum(['single', 'married']).optional(),
  /** Separate schedule used instead of `brackets` when taxable income is at or below a limit (Arkansas). */
  lowIncomeSchedule: z.object({ maxTaxableIncome: money, brackets }).optional(),
  standardDeduction: StandardDeductionSchema.optional(),
  exemptions: ExemptionSchema.optional(),
  taxpayerCredit: TaxpayerCreditSchema.optional(),
  federalTaxDeduction: FederalTaxDeductionSchema.optional(),
  recapture: RecaptureSchema.optional(),
  /** When AGI exceeds `agiOver`, tax is at least `rate` x AGI (Vermont). */
  minimumTax: z.object({ agiOver: money, rate }).optional(),
  /** Where state law differs from federal on pre-tax payroll deductions. */
  taxes401k: z.boolean().default(false),
  taxesHsa: z.boolean().default(false),
  taxesSection125: z.boolean().default(false),
  payrollTaxes: z.array(PayrollTaxSchema).default([]),
})

/** One piece of a local tax. A locality can combine several (e.g. Portland Metro + Multnomah). */
export const LocalComponentSchema = z.object({
  name: z.string(),
  /**
   * stateTaxable: state taxable income (NYC, MD and IN counties, Oregon locals)
   * wages: gross wages less Section 125 (401(k) deferrals are taxable) (city wage taxes)
   * stateTax: percentage of state income tax (Yonkers surcharge)
   */
  base: z.enum(['stateTaxable', 'wages', 'stateTax']),
  rate: rate.optional(),
  brackets: byStatusHohOptional(brackets).optional(),
  /** Single rate on all income, chosen by which tier the income falls in (Frederick County, MD). */
  tiers: byStatusHohOptional(z.array(z.object({ upTo: money.nullable(), rate }))).optional(),
  /** Per-person exemption subtracted from the base (Michigan cities). */
  exemptionPerPerson: money.optional(),
})

export const LocalitySchema = z.object({
  id: z.string(),
  state: z.string().length(2),
  name: z.string(),
  components: z.array(LocalComponentSchema).min(1),
  sources: z.array(SourceSchema).min(1),
  notes: z.array(z.string()).default([]),
})

export const STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
  'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const
export type StateCode = (typeof STATE_CODES)[number]

export const TaxYearSchema = z
  .object({
    year: z.number().int(),
    /** ISO date the figures were last reviewed. */
    lastReviewed: z.string(),
    federal: FederalSchema,
    fica: FicaSchema,
    states: z.record(z.enum(STATE_CODES), StateSchema),
    localities: z.array(LocalitySchema),
  })
  .superRefine((d, ctx) => {
    for (const code of STATE_CODES) {
      if (!d.states[code]) ctx.addIssue({ code: 'custom', message: `missing state ${code}` })
    }
    for (const [code, s] of Object.entries(d.states)) {
      if (s.type !== 'none' && !s.brackets) {
        ctx.addIssue({ code: 'custom', message: `${code}: taxed state needs brackets` })
      }
    }
    for (const l of d.localities) {
      if (!d.states[l.state as StateCode]) {
        ctx.addIssue({ code: 'custom', message: `locality ${l.id}: unknown state ${l.state}` })
      }
      for (const c of l.components) {
        if ([c.rate, c.brackets, c.tiers].filter((x) => x !== undefined).length !== 1) {
          ctx.addIssue({ code: 'custom', message: `locality ${l.id}: give exactly one of rate/brackets/tiers` })
        }
      }
    }
  })

export type TaxYearData = z.infer<typeof TaxYearSchema>
export type StateTax = z.infer<typeof StateSchema>
export type Locality = z.infer<typeof LocalitySchema>
export type LocalComponent = z.infer<typeof LocalComponentSchema>
export type Bracket = z.infer<typeof BracketSchema>
export type PayrollTax = z.infer<typeof PayrollTaxSchema>
export type Source = z.infer<typeof SourceSchema>
