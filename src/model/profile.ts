/**
 * The user's budget profile: everything entered in the setup flow.
 * Persisted to localStorage and validated with this schema on load.
 */
import { z } from 'zod'
import { DEFAULT_TAX_YEAR, FILING_STATUSES, STATE_CODES } from '../taxdata'

export const PAY_FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly'] as const
export type PayFrequency = (typeof PAY_FREQUENCIES)[number]

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }
export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
}

export const EXPENSE_FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const
export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number]

/** How often a pre-tax payroll deduction amount is entered. */
export const DEDUCTION_FREQUENCIES = ['paycheck', 'monthly', 'yearly'] as const
export type DeductionFrequency = (typeof DEDUCTION_FREQUENCIES)[number]

export const CATEGORIES = ['needs', 'wants', 'savings'] as const
export type Category = (typeof CATEGORIES)[number]
export const CATEGORY_LABELS: Record<Category, string> = { needs: 'Needs', wants: 'Wants', savings: 'Savings & debt' }

/**
 * Expense kinds drive defaults and some checks (housing share of income,
 * which goal a savings line feeds). "other" is a free-form expense.
 */
export const EXPENSE_KINDS = {
  housing: { label: 'Rent / mortgage', category: 'needs' },
  utilities: { label: 'Utilities', category: 'needs' },
  car: { label: 'Car payment', category: 'needs' },
  insurance: { label: 'Insurance', category: 'needs' },
  groceries: { label: 'Groceries', category: 'needs' },
  gas: { label: 'Gas / transit', category: 'needs' },
  phone: { label: 'Phone / internet', category: 'needs' },
  minDebt: { label: 'Minimum debt payments', category: 'needs' },
  healthcare: { label: 'Healthcare', category: 'needs' },
  dining: { label: 'Dining out', category: 'wants' },
  subscriptions: { label: 'Subscriptions', category: 'wants' },
  entertainment: { label: 'Entertainment', category: 'wants' },
  shopping: { label: 'Shopping', category: 'wants' },
  travel: { label: 'Travel', category: 'wants' },
  emergencyFund: { label: 'Emergency fund', category: 'savings' },
  extraDebt: { label: 'Extra debt payments', category: 'savings' },
  investing: { label: 'Investing', category: 'savings' },
  other: { label: 'Other', category: 'needs' },
} as const satisfies Record<string, { label: string; category: Category }>
export type ExpenseKind = keyof typeof EXPENSE_KINDS
export const EXPENSE_KIND_KEYS = Object.keys(EXPENSE_KINDS) as ExpenseKind[]

const amount = z.number().min(0).max(100_000_000)
const percent = z.number().min(0).max(100)

export const ExpenseSchema = z.object({
  id: z.string(),
  kind: z.enum(EXPENSE_KIND_KEYS as [ExpenseKind, ...ExpenseKind[]]),
  name: z.string().max(80),
  amount,
  frequency: z.enum(EXPENSE_FREQUENCIES),
  category: z.enum(CATEGORIES),
})
export type Expense = z.infer<typeof ExpenseSchema>

const DeductionSchema = z.object({ amount, frequency: z.enum(DEDUCTION_FREQUENCIES) })

export const ProfileSchema = z.object({
  income: z.object({
    payType: z.enum(['salary', 'hourly']),
    annualSalary: amount,
    hourlyRate: amount,
    hoursPerWeek: z.number().min(0).max(168),
    payFrequency: z.enum(PAY_FREQUENCIES),
  }),
  taxes: z.object({
    year: z.number().int(),
    filingStatus: z.enum(FILING_STATUSES),
    state: z.enum(STATE_CODES).nullable(),
    localityId: z.string().nullable(),
    /** Percent (e.g. 1.5 for 1.5%), used when localityId is "custom". */
    customLocalRatePercent: z.number().min(0).max(10),
    dependents: z.number().int().min(0).max(20),
    includeStatePayroll: z.boolean(),
    spouseIncome: amount,
    spouseRetirementPercent: percent,
  }),
  deductions: z.object({
    retirementPercent: percent,
    /** Employer match as % of salary: counted as savings, not take-home. */
    employerMatchPercent: percent,
    healthInsurance: DeductionSchema,
    hsa: DeductionSchema,
  }),
  expenses: z.array(ExpenseSchema),
  goals: z.object({
    emergencyFund: z.object({ target: amount, saved: amount }),
    savings: z.object({ name: z.string().max(80), target: amount, saved: amount, deadline: z.string().nullable() }),
    debt: z.object({ name: z.string().max(80), balance: amount, aprPercent: z.number().min(0).max(100) }),
  }),
  /** Tax actually withheld per paycheck, read from a pay stub (for the withholding check). */
  withholding: z
    // null = not read from the stub (unknown), which is different from $0 withheld.
    .object({ federalPerPaycheck: amount.nullable(), statePerPaycheck: amount.nullable(), localPerPaycheck: amount.nullable(), payDate: z.string().nullable() })
    .nullable()
    .default(null),
})
export type Profile = z.infer<typeof ProfileSchema>

export const newId = () => Math.random().toString(36).slice(2, 10)

export function makeExpense(kind: ExpenseKind, overrides: Partial<Expense> = {}): Expense {
  const k = EXPENSE_KINDS[kind]
  return { id: newId(), kind, name: kind === 'other' ? '' : k.label, amount: 0, frequency: 'monthly', category: k.category, ...overrides }
}

export const DEFAULT_PROFILE: Profile = {
  income: { payType: 'salary', annualSalary: 0, hourlyRate: 0, hoursPerWeek: 40, payFrequency: 'biweekly' },
  taxes: {
    year: DEFAULT_TAX_YEAR,
    filingStatus: 'single',
    state: null,
    localityId: null,
    customLocalRatePercent: 0,
    dependents: 0,
    includeStatePayroll: true,
    spouseIncome: 0,
    spouseRetirementPercent: 0,
  },
  deductions: {
    retirementPercent: 0,
    employerMatchPercent: 0,
    healthInsurance: { amount: 0, frequency: 'paycheck' },
    hsa: { amount: 0, frequency: 'paycheck' },
  },
  expenses: [],
  goals: {
    emergencyFund: { target: 0, saved: 0 },
    savings: { name: '', target: 0, saved: 0, deadline: null },
    debt: { name: '', balance: 0, aprPercent: 0 },
  },
  withholding: null,
}

/** Starter rows shown on the expenses step for a new profile. */
export const STARTER_EXPENSE_KINDS: ExpenseKind[] = ['housing', 'utilities', 'groceries', 'phone', 'dining', 'subscriptions', 'emergencyFund']
