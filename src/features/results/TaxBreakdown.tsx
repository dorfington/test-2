import { Fragment, useState } from 'react'
import { Segmented } from '../../components/ui'
import type { TaxResult } from '../../engine'
import { money, pct } from '../../lib/format'
import { PERIODS_PER_YEAR, type PayFrequency } from '../../model/profile'

type Period = 'year' | 'month' | 'paycheck'

/** Line-by-line path from gross pay to take-home pay. */
export function TaxBreakdown({ result, payFrequency }: { result: TaxResult; payFrequency: PayFrequency }) {
  const [period, setPeriod] = useState<Period>('month')
  const div = period === 'year' ? 1 : period === 'month' ? 12 : PERIODS_PER_YEAR[payFrequency]
  const r = result
  const cents = period !== 'year'
  const rows: { label: string; amount: number; sub?: boolean; strong?: boolean; note?: string }[] = [
    { label: 'Gross pay', amount: r.gross, strong: true },
    ...(r.preTax.retirement ? [{ label: '401(k) / 403(b)', amount: -r.preTax.retirement, sub: true }] : []),
    ...(r.preTax.section125 ? [{ label: 'Health insurance', amount: -r.preTax.section125, sub: true }] : []),
    ...(r.preTax.hsa ? [{ label: 'HSA / FSA', amount: -r.preTax.hsa, sub: true }] : []),
    { label: 'Federal income tax', amount: -r.federal.tax, note: r.federal.childTaxCredit ? `after ${money(r.federal.childTaxCredit / div, cents)} Child Tax Credit` : undefined },
    { label: 'Social Security', amount: -r.fica.socialSecurity },
    { label: 'Medicare', amount: -(r.fica.medicare + r.fica.additionalMedicare), note: r.fica.additionalMedicare ? 'includes 0.9% Additional Medicare Tax' : undefined },
    ...(r.state.hasIncomeTax ? [{ label: `${r.state.name} income tax`, amount: -r.state.tax }] : []),
    ...(r.local ? r.local.items.map((i) => ({ label: `${r.local!.name}: ${i.name}`, amount: -i.amount })) : []),
    ...r.statePayroll.map((i) => ({ label: i.name, amount: -i.amount })),
  ]

  return (
    <div className="grid gap-3">
      <Segmented<Period>
        label="Show amounts per"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'year', label: 'Year' },
          { value: 'month', label: 'Month' },
          { value: 'paycheck', label: 'Paycheck' },
        ]}
      />
      <table className="w-full text-sm">
        <caption className="sr-only">Pay breakdown per {period}</caption>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.label}>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th scope="row" className={`py-2 text-left font-normal ${row.sub ? 'pl-4 text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-300'} ${row.strong ? 'font-semibold text-slate-900 dark:text-slate-100' : ''}`}>
                  {row.label}
                  {row.note && <span className="block text-xs text-slate-500 dark:text-slate-400">{row.note}</span>}
                </th>
                <td className={`py-2 pl-3 text-right whitespace-nowrap tabular-nums ${row.strong ? 'font-semibold' : ''} ${row.amount < 0 ? 'text-slate-700 dark:text-slate-300' : 'text-slate-900 dark:text-slate-100'}`}>
                  {row.amount < 0 ? '−' : ''}
                  {money(Math.abs(row.amount / div), cents)}
                </td>
              </tr>
            </Fragment>
          ))}
          <tr>
            <th scope="row" className="pt-3 text-left text-base font-semibold text-slate-900 dark:text-slate-100">Take-home pay</th>
            <td className="pt-3 pl-3 text-right whitespace-nowrap text-base font-semibold tabular-nums text-teal-800 dark:text-teal-300">{money(r.net / div, cents)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Effective tax rate {pct(r.effectiveRate)} · federal bracket {pct(r.federal.marginalRate, 0)}
        {r.state.hasIncomeTax ? ` · state bracket ${pct(r.state.marginalRate, 2)}` : ''}
      </p>
    </div>
  )
}
