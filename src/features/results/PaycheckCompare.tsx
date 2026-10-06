import { Button } from '../../components/ui'
import { GAP_TOLERANCE, type PaycheckLineId, type Reconciliation } from '../../budget/reconcile'
import { cx } from '../../lib/cx'
import { money } from '../../lib/format'
import type { Profile } from '../../model/profile'

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n), true)}`

/** Your actual take-home pay next to the estimate, with where the difference comes from. */
export function PaycheckCompare({ r, withholding, onEditIncome, onClear }: {
  r: Reconciliation
  withholding: Profile['withholding']
  onEditIncome: () => void
  onClear: () => void
}) {
  const matches = Math.abs(r.diff) < GAP_TOLERANCE
  const withheld: Partial<Record<PaycheckLineId, number | null>> = withholding
    ? { federal: withholding.federalPerPaycheck, state: withholding.statePerPaycheck, local: withholding.localPerPaycheck }
    : {}
  const hasWithheld = Object.values(withheld).some((v) => v !== null && v !== undefined)
  const unexplained = Math.abs(r.unexplained) >= GAP_TOLERANCE ? r.unexplained : 0

  return (
    <div className="grid gap-3">
      <p className={cx('text-base font-semibold', matches ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-100')}>
        {matches ? (
          <><span aria-hidden>✓ </span>Your paycheck matches the estimate.</>
        ) : (
          <>Your paycheck is {money(Math.abs(r.diff), true)} {r.diff < 0 ? 'less' : 'more'} than the estimate. Your budget uses your actual pay.</>
        )}
      </p>

      <table className="w-full text-sm">
        <caption className="sr-only">Estimated paycheck compared with your actual paycheck</caption>
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
            <th className="py-1 font-medium">Per paycheck</th>
            <th className="py-1 pl-2 text-right font-medium">Estimate</th>
            <th className="py-1 pl-2 text-right font-medium">Your paycheck</th>
          </tr>
        </thead>
        <tbody>
          {r.estimate.lines.map((l) => {
            const actual = withheld[l.id]
            return (
              <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5 text-slate-700 dark:text-slate-300">{l.name}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{l.amount < 0 ? '−' : ''}{money(Math.abs(l.amount), true)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400">
                  {actual !== null && actual !== undefined ? <span className="text-slate-900 dark:text-slate-100">−{money(actual, true)}</span> : '–'}
                </td>
              </tr>
            )
          })}
          {unexplained !== 0 && (
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1.5 text-slate-700 dark:text-slate-300">{unexplained < 0 ? (hasWithheld ? 'Other deductions (not entered here)' : 'Other deductions or tax withheld') : 'Not explained'}</td>
              <td className="py-1.5 pl-2 text-right text-slate-500 dark:text-slate-400">–</td>
              <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap font-medium text-amber-800 dark:text-amber-300">{signed(unexplained)}</td>
            </tr>
          )}
          <tr className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
            <td className="pt-2 text-slate-900 dark:text-slate-100">Take-home pay</td>
            <td className="pt-2 pl-2 text-right tabular-nums">{money(r.estimate.net, true)}</td>
            <td className="pt-2 pl-2 text-right tabular-nums text-teal-800 dark:text-teal-300">{money(r.actual, true)}</td>
          </tr>
        </tbody>
      </table>

      {!matches && (
        <div className="grid gap-1.5">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Where the {money(Math.abs(r.diff), true)} comes from</p>
          <ul className="grid gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            {r.explained.map((g) => (
              <li key={g.name}>
                <span className="font-medium tabular-nums">{signed(g.amount)}</span> {g.name}: your employer withholds {money(Math.abs(g.amount), true)}{' '}
                {g.amount < 0 ? 'more' : 'less'} than the estimated tax. Payroll formulas and your W-4 (extra withholding, the multiple-jobs box)
                cause this, and it evens out at tax time; see the withholding check.
              </li>
            ))}
            {unexplained < 0 && (
              <li>
                <span className="font-medium tabular-nums">{signed(unexplained)}</span>{' '}
                {hasWithheld ? 'Deductions on your pay stub that aren\'t entered here.' : 'More tax withheld than estimated, or deductions on your pay stub that aren\'t entered here.'} Common deductions:
                Roth 401(k), dental, vision or life insurance taken after tax, union dues, a stock purchase plan or a garnishment. Pre-tax ones (traditional
                401(k), health, HSA) belong on the Taxes step because they lower your tax.
              </li>
            )}
            {unexplained > 0 && (
              <li>
                <span className="font-medium tabular-nums">{signed(unexplained)}</span> More than the estimate explains. Check the gross pay and the pre-tax
                deductions (401(k) %, health, HSA) against your stub. A reimbursement, overtime or a bonus in that paycheck also raises net pay.
              </li>
            )}
            {!hasWithheld && (
              <li>Scan your pay stub on the Income step to compare the tax actually withheld line by line.</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onEditIncome}>Change my take-home pay</Button>
        <Button size="sm" variant="ghost" onClick={onClear}>Use the estimate instead</Button>
      </div>
    </div>
  )
}
