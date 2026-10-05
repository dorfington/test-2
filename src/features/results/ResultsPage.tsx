import { Button, Card, Notice } from '../../components/ui'
import { money, money0, pct } from '../../lib/format'
import { periods } from '../../model/derive'
import { PAY_FREQUENCY_LABELS } from '../../model/profile'
import type { Step } from '../../store/useBudgetStore'
import { useResults } from './useResults'
import { ExportCard } from './ExportCard'
import { Goals, Recommendations } from './Insights'
import { WithholdingCard } from './WithholdingCard'
import { SpendingDonut } from './SpendingDonut'
import { SplitBars } from './SplitBars'
import { TaxBreakdown } from './TaxBreakdown'
import { WhatIfPanel } from './WhatIfPanel'

export function ResultsPage({ onEdit }: { onEdit: (s: Step) => void }) {
  const results = useResults()

  if (!results) {
    return (
      <Notice tone="warn">
        Choose your state to see results. <Button size="sm" onClick={() => onEdit('taxes')}>Edit taxes</Button>
      </Notice>
    )
  }

  const { profile, whatIf, tax, budget, withholding, deltaPerMonth } = results
  const net = periods(tax.net, profile.income.payFrequency)
  const notes = [...tax.state.notes, ...(tax.local?.notes ?? [])]
  const editLinks = (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      Edit:{' '}
      {(['income', 'taxes', 'expenses'] as const).map((s, i) => (
        <span key={s}>
          {i > 0 && ' · '}
          <button type="button" className="font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-300" onClick={() => onEdit(s)}>
            {s}
          </button>
        </span>
      ))}
    </p>
  )

  return (
    <div className="grid gap-4">
      {/* Take-home summary */}
      <section aria-labelledby="summary-heading" className="rounded-2xl bg-teal-800 p-5 text-white shadow-sm sm:p-6 dark:bg-teal-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="summary-heading" className="text-sm font-medium text-teal-100">Take-home pay per paycheck ({PAY_FREQUENCY_LABELS[profile.income.payFrequency].toLowerCase()})</h2>
            <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">{money(net.paycheck, true)}</p>
          </div>
          <div className="text-sm text-teal-100 sm:text-right">
            <div>Tax year {tax.year}</div>
            <div>{tax.state.name}{tax.local ? ` · ${tax.local.name}` : ''}</div>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['Per month', money0(net.month)],
            ['Per year', money0(net.year)],
            ['Gross per year', money0(tax.gross)],
            ['Total tax rate', pct(tax.effectiveRate)],
          ] as const).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/10 px-3 py-2">
              <dt className="text-xs text-teal-100">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Where your money goes">
          <SpendingDonut budget={budget} />
        </Card>
        <Card title="Your split vs. 50/30/20">
          <SplitBars budget={budget} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Recommendations">
          <Recommendations budget={budget} />
        </Card>
        <Card title="What if…">
          <WhatIfPanel deltaPerMonth={deltaPerMonth} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Goals">
          <Goals budget={budget} />
          {budget.employerMatchMonthly > 0 && (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Plus {money0(budget.employerMatchMonthly)}/mo employer 401(k) match, not counted above.
            </p>
          )}
        </Card>
        <Card title="Gross to take-home" action={editLinks}>
          <TaxBreakdown result={tax} payFrequency={profile.income.payFrequency} />
        </Card>
      </div>

      {withholding && (
        <Card title="Withholding check (from your pay stub)">
          <WithholdingCard check={withholding} />
        </Card>
      )}

      <ExportCard profile={profile} tax={tax} budget={budget} whatIf={whatIf} />

      {(tax.warnings.length > 0 || notes.length > 0) && (
        <Card title="About this estimate">
          <div className="grid gap-2">
            {tax.warnings.map((w) => (
              <Notice key={w} tone="warn">{w}</Notice>
            ))}
            <ul className="list-inside list-disc text-sm text-slate-600 dark:text-slate-300">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  )
}
