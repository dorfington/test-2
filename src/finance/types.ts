/**
 * Bank and credit card data: accounts, transactions, balances and imports.
 * Stored only on this device (IndexedDB, see db.ts). Validated with these
 * schemas whenever it is loaded or restored from a backup.
 */
import { z } from 'zod'
import { CATEGORIES, EXPENSE_KIND_KEYS, type ExpenseKind } from '../model/profile'

export const ACCOUNT_KINDS = ['checking', 'savings', 'credit', 'other'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit card',
  other: 'Other',
}

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  kind: z.enum(ACCOUNT_KINDS),
  /** Last 4 digits only, when a file shows them. Full account numbers are never stored. */
  last4: z.string().regex(/^\d{4}$/).nullable(),
  /** Use this account's balance for a goal: a savings account for the emergency fund, a card for debt payoff. */
  goal: z.enum(['emergencyFund', 'savings', 'debt']).nullable(),
  createdAt: z.string(),
})
export type Account = z.infer<typeof AccountSchema>

/**
 * How a transaction counts in the budget.
 * - spending/saving lines carry a budget category and expense kind
 * - income: paychecks and other money in
 * - transfer: between your own accounts or a card payment (excluded, so nothing is counted twice)
 * - refund: money back on a purchase (reduces spending in its category)
 */
export const TXN_TYPES = ['expense', 'income', 'transfer', 'refund'] as const
export type TxnType = (typeof TXN_TYPES)[number]

const kindEnum = z.enum(EXPENSE_KIND_KEYS as [ExpenseKind, ...ExpenseKind[]])

export const TransactionSchema = z.object({
  /** Stable id: the file's own id (OFX FITID) when present, else a hash of account+date+amount+description+occurrence. */
  id: z.string(),
  accountId: z.string(),
  /** ISO yyyy-mm-dd (posted date). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Description exactly as the bank printed it. */
  description: z.string(),
  /** Cleaned-up merchant name used for rules and grouping ("NETFLIX.COM 866-579" -> "Netflix"). */
  payee: z.string(),
  /** Signed from your point of view: negative = money out (purchase, bill); positive = money in (pay, refund, card payment received). */
  amount: z.number(),
  type: z.enum(TXN_TYPES),
  category: z.enum(CATEGORIES).nullable(),
  kind: kindEnum.nullable(),
  /** Where the categorization came from: a built-in rule, your own rule, or set by hand on this transaction. */
  categorizedBy: z.enum(['auto', 'rule', 'user']),
  importId: z.string(),
})
export type Transaction = z.infer<typeof TransactionSchema>

export const BalanceSchema = z.object({
  accountId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** For cards, the amount owed is stored as a negative balance. */
  balance: z.number(),
})
export type Balance = z.infer<typeof BalanceSchema>

export const ImportSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  fileName: z.string(),
  format: z.enum(['csv', 'ofx', 'pdf']),
  importedAt: z.string(),
  added: z.number().int(),
  skipped: z.number().int(),
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
})
export type ImportRecord = z.infer<typeof ImportSchema>

/** Your own categorization rule, learned when you recategorize a transaction. */
export const RuleSchema = z.object({
  /** Normalized payee key the rule matches (see payeeKey in categorize.ts). */
  payeeKey: z.string(),
  type: z.enum(TXN_TYPES),
  category: z.enum(CATEGORIES).nullable(),
  kind: kindEnum.nullable(),
})
export type Rule = z.infer<typeof RuleSchema>

export const FinanceDataSchema = z.object({
  accounts: z.array(AccountSchema),
  transactions: z.array(TransactionSchema),
  balances: z.array(BalanceSchema),
  imports: z.array(ImportSchema),
  rules: z.array(RuleSchema),
})
export type FinanceData = z.infer<typeof FinanceDataSchema>

export const EMPTY_FINANCE: FinanceData = { accounts: [], transactions: [], balances: [], imports: [], rules: [] }

/** A transaction as read from a file, before categorization and dedupe. */
export interface RawTxn {
  date: string
  description: string
  /** Signed from the account holder's point of view (see Transaction.amount). */
  amount: number
  /** The file's own unique id (OFX FITID), when present. */
  fitid?: string
}

/** What a parser returns for one file. */
export interface ParsedStatement {
  format: 'csv' | 'ofx' | 'pdf'
  transactions: RawTxn[]
  /** Closing/ledger balance if the file states one. */
  balance?: { date: string; amount: number }
  /** Account type the file suggests (OFX CREDITCARD, "credit card" in a PDF). */
  suggestedKind?: AccountKind
  last4?: string
  /** True when the amounts' signs were inferred and the user should confirm them. */
  signsInferred: boolean
  warnings: string[]
}
