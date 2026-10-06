/**
 * One report model feeds both exports, so the CSV and PDF always agree with
 * each other and with the dashboard.
 */
import type { Budget } from '../budget/budget'
import { withholdingCheck } from '../budget/withholding'
import type { TaxResult } from '../engine'
import type { WhatIf } from '../model/derive'
import { CATEGORIES, CATEGORY_LABELS, PAY_FREQUENCY_LABELS, PERIODS_PER_YEAR, type Profile } from '../model/profile'

export const DISCLAIMER =
  'Tax figures are estimates, not tax advice. They use published federal, state and local rates for the selected year and simplify some rules; your actual withholding and tax bill will differ.'

export interface ReportTable {
  title: string
  head: string[]
  rows: (string | number)[][]
  /** Columns holding dollar amounts (formatted in the PDF, raw numbers in the CSV). */
  moneyCols?: number[]
}

export interface Report {
  title: string
  subtitle: string
  generated: string
  scenario: string | null
  tables: ReportTable[]
  notes: string[]
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function buildReport(profile: Profile, tax: TaxResult, budget: Budget, whatIf: WhatIf, now = new Date()): Report {
  const n = PERIODS_PER_YEAR[profile.income.payFrequency]
  const triple = (label: string, annual: number): (string | number)[] => [label, r2(annual), r2(annual / 12), r2(annual / n)]

  const taxRows: (string | number)[][] = [
    triple('Gross pay', tax.gross),
    ...(tax.preTax.retirement ? [triple('401(k) / 403(b)', -tax.preTax.retirement)] : []),
    ...(tax.preTax.section125 ? [triple('Health insurance (pre-tax)', -tax.preTax.section125)] : []),
    ...(tax.preTax.hsa ? [triple('HSA / FSA', -tax.preTax.hsa)] : []),
    triple('Federal income tax', -tax.federal.tax),
    triple('Social Security', -tax.fica.socialSecurity),
    triple('Medicare', -(tax.fica.medicare + tax.fica.additionalMedicare)),
    ...(tax.state.hasIncomeTax ? [triple(`${tax.state.name} income tax`, -tax.state.tax)] : []),
    ...(tax.local ? tax.local.items.map((i) => triple(`${tax.local!.name}: ${i.name}`, -i.amount)) : []),
    ...tax.statePayroll.map((i) => triple(i.name, -i.amount)),
    triple(profile.income.netPerPaycheck !== null ? 'Take-home pay (estimate)' : 'Take-home pay', tax.net),
    // The budget runs on your actual pay when it's entered.
    ...(profile.income.netPerPaycheck !== null ? [triple('Take-home pay (your actual, used for the budget)', budget.takeHome * 12)] : []),
  ]

  const scenario = Object.keys(whatIf).length
    ? [
        whatIf.annualGross !== undefined && `salary $${Math.round(whatIf.annualGross).toLocaleString('en-US')}`,
        whatIf.monthlyHousing !== undefined && `rent $${Math.round(whatIf.monthlyHousing).toLocaleString('en-US')}/mo`,
        whatIf.retirementPercent !== undefined && `401(k) ${whatIf.retirementPercent}%`,
      ]
        .filter(Boolean)
        .join(', ')
    : null

  const wc = withholdingCheck(profile, tax)
  const withholdingTable: ReportTable[] = wc
    ? [{
        title: 'Withholding check (from your pay stub, per year)',
        head: ['Tax', 'Withheld', 'Estimated tax', 'Difference'],
        rows: [...wc.rows, wc.total].map((r) => [r.name, r2(r.withheld), r2(r.owed), r2(r.diff)]),
        moneyCols: [1, 2, 3],
      }]
    : []

  const goalRows = budget.goals.map((g) => [
    g.name,
    r2(g.target),
    g.id === 'debt' ? '' : r2(g.current),
    r2(g.monthlyContribution),
    g.months === null ? 'Not funded' : g.months === 0 ? 'Reached' : `${g.months} months`,
  ])

  return {
    title: 'Take-Home Budget',
    subtitle: `${tax.year} · ${tax.state.name}${tax.local ? ` · ${tax.local.name}` : ''} · paid ${PAY_FREQUENCY_LABELS[profile.income.payFrequency].toLowerCase()}`,
    generated: now.toISOString().slice(0, 10),
    scenario,
    tables: [
      { title: 'Pay and taxes', head: ['Item', 'Per year', 'Per month', 'Per paycheck'], rows: taxRows, moneyCols: [1, 2, 3] },
      {
        title: 'Budget split (percent of take-home pay plus pre-tax deductions)',
        head: ['Category', 'Per month', 'Your share', 'Your target', '50/30/20'],
        rows: CATEGORIES.map((c) => [
          CATEGORY_LABELS[c],
          r2(budget.totals[c]),
          `${budget.actualPct[c].toFixed(1)}%`,
          `${budget.targetPct[c].toFixed(1)}%`,
          `${budget.standardPct[c]}%`,
        ]),
        moneyCols: [1],
      },
      {
        title: 'Where every dollar goes (monthly)',
        head: ['Item', 'Category', 'Per month', 'Per year'],
        rows: [
          ...[...budget.allocations]
            .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || b.monthly - a.monthly)
            .map((a) => [a.payroll ? `${a.name} (from paycheck)` : a.name, CATEGORY_LABELS[a.category], r2(a.monthly), r2(a.monthly * 12)]),
          [budget.leftover >= 0 ? 'Unassigned' : 'Over budget', '', r2(budget.leftover), r2(budget.leftover * 12)],
        ],
        moneyCols: [2, 3],
      },
      ...(goalRows.length
        ? [{ title: 'Goals', head: ['Goal', 'Target / balance', 'Saved', 'Per month', 'Time to reach'], rows: goalRows, moneyCols: [1, 2, 3] }]
        : []),
      ...withholdingTable,
      {
        title: 'Recommendations',
        head: ['Priority', 'Recommendation', 'Details'],
        rows: budget.recommendations.map((r) => [{ bad: 'Problem', warn: 'Watch', info: 'Tip', good: 'Good' }[r.severity], r.title, r.detail]),
      },
    ],
    notes: [...tax.warnings, ...tax.state.notes, ...(tax.local?.notes ?? []), DISCLAIMER],
  }
}
