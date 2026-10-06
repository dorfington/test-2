import type { WithholdingCheck } from '../../budget/withholding'
import { cx } from '../../lib/cx'
import { money0 } from '../../lib/format'

/** Pay stub withholding vs. estimated tax for the year. */
export function WithholdingCard({ check }: { check: WithholdingCheck }) {
  const { total, verdict } = check
  const headline =
    verdict === 'refund'
      ? `Likely refund of about ${money0(total.diff)}`
      : verdict === 'owe'
        ? `You may owe about ${money0(-total.diff)} at tax time`
        : 'Your withholding looks about right'
  const tone =
    verdict === 'owe'
      ? 'text-amber-800 dark:text-amber-300'
      : verdict === 'refund'
        ? 'text-sky-800 dark:text-sky-300'
        : 'text-emerald-800 dark:text-emerald-300'
  return (
    <div className="grid gap-3">
      <p className={cx('text-base font-semibold', tone)}>
        <span aria-hidden>{verdict === 'owe' ? '▲ ' : verdict === 'refund' ? '↺ ' : '✓ '}</span>
        {headline}
      </p>
      <table className="w-full text-sm">
        <caption className="sr-only">Tax withheld per year compared with estimated tax</caption>
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
            <th className="py-1 font-medium">Per year</th>
            <th className="py-1 pl-2 text-right font-medium">Withheld</th>
            <th className="py-1 pl-2 text-right font-medium">Est. tax</th>
            <th className="py-1 pl-2 text-right font-medium">Diff.</th>
          </tr>
        </thead>
        <tbody>
          {[...check.rows, total].map((r) => (
            <tr key={r.name} className={cx('border-t border-slate-100 dark:border-slate-800', r === total && 'font-semibold')}>
              <td className="py-1.5 text-slate-800 dark:text-slate-200">{r.name}</td>
              <td className="py-1.5 text-right tabular-nums">{money0(r.withheld)}</td>
              <td className="py-1.5 text-right tabular-nums">{money0(r.owed)}</td>
              <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{r.diff >= 0 ? '+' : '−'}{money0(Math.abs(r.diff))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="list-inside list-disc text-xs text-slate-500 dark:text-slate-400">
        {check.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  )
}
