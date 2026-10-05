import { useMemo, useState } from 'react'
import { Button, Card, Notice, Select } from '../../components/ui'
import { cx } from '../../lib/cx'
import { money, money0 } from '../../lib/format'
import { CATEGORY_LABELS, EXPENSE_KINDS, newId } from '../../model/profile'
import {
  actualVsBudget,
  applySuggestions,
  findRecurring,
  goalBalances,
  missingCardAccounts,
  monthlySummaries,
  suggestBudget,
  type Suggestion,
} from '../../finance/analysis'
import { useBudgetStore } from '../../store/useBudgetStore'
import { useFinanceStore } from '../../store/useFinanceStore'
import { BackupCard } from './BackupCard'
import { TrendsChart } from './TrendsChart'

const monthLabel = (m: string) => new Date(m + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

export function InsightsPage({ goToAccounts }: { goToAccounts: () => void }) {
  const loaded = useFinanceStore((s) => s.loaded)
  const data = useFinanceStore((s) => s.data)
  const months = useMemo(() => monthlySummaries(data), [data])

  if (!loaded) return <p role="status" className="py-12 text-center text-sm text-slate-500">Loading…</p>
  if (!data.transactions.length) {
    return (
      <div className="grid gap-4">
        <Card title="Insights">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Upload bank and credit card statements to see what you really spend compared with your plan, how it changes month to month, your recurring charges, and progress
            on your goals.
          </p>
          <div className="mt-3"><Button variant="primary" onClick={goToAccounts}>Add statements</Button></div>
        </Card>
        <BackupCard />
      </div>
    )
  }

  const missingCards = missingCardAccounts(data)
  const uncategorized = data.transactions.filter((t) => t.type === 'expense' && !t.kind).length
  return (
    <div className="grid gap-4">
      {missingCards > 0 && (
        <Notice tone="warn">
          You have {missingCards} credit card payment{missingCards > 1 ? 's' : ''} but no card statements. Card payments are ignored so nothing is counted twice, which means
          those purchases aren't counted at all yet. <button type="button" className="font-medium underline" onClick={goToAccounts}>Add your card statements</button>.
        </Notice>
      )}
      {uncategorized > 0 && (
        <Notice tone="info">
          {uncategorized} transaction{uncategorized > 1 ? 's are' : ' is'} uncategorized and shown separately.{' '}
          <button type="button" className="font-medium underline" onClick={goToAccounts}>Categorize them</button>.
        </Notice>
      )}
      <VsBudgetCard months={months} />
      <Card title="Month by month"><TrendsChart months={months.slice(-12)} /></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProgressCard />
        <RecurringCard />
      </div>
      <FillBudgetCard />
      <BackupCard />
    </div>
  )
}

function VsBudgetCard({ months }: { months: ReturnType<typeof monthlySummaries> }) {
  const profile = useBudgetStore((s) => s.profile)
  const defaultMonth = [...months].reverse().find((m) => m.complete)?.month ?? months[months.length - 1].month
  const [month, setMonth] = useState(defaultMonth)
  const summary = months.find((m) => m.month === month) ?? months[months.length - 1]
  const { rows, totals } = actualVsBudget(profile, summary)
  const noPlan = profile.expenses.every((e) => e.amount === 0)
  return (
    <Card
      title="Actual vs. your plan"
      action={
        <div className="w-44 shrink-0 sm:w-52">
          <Select ariaLabel="Month" value={summary.month} onChange={setMonth}
            options={[...months].reverse().map((m) => ({ value: m.month, label: monthLabel(m.month) + (m.complete ? '' : ' (partial)') }))} />
        </div>
      }
    >
      {noPlan && <div className="mb-3"><Notice tone="info">Your budget has no expense amounts yet. Use "Fill in my budget" below to start from your real spending.</Notice></div>}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['needs', 'wants', 'savings'] as const).map((c) => {
          const t = totals[c]
          const over = c === 'savings' ? t.actual < t.planned - 1 : t.actual > t.planned + 1
          return (
            <div key={c} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
              <p className="text-xs text-slate-500 dark:text-slate-400">{CATEGORY_LABELS[c]}</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money0(t.actual)}</p>
              <p className={cx('text-xs tabular-nums', over ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400')}>
                {over ? '▲ ' : ''}plan {money0(t.planned)}
              </p>
            </div>
          )
        })}
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">Income</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money0(summary.income)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">left over {summary.net < 0 ? '−' : ''}{money0(Math.abs(summary.net))}</p>
        </div>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Planned and actual spending by category for {monthLabel(summary.month)}</caption>
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
            <th className="py-1 font-medium">Category</th>
            <th className="py-1 pl-2 text-right font-medium">Plan</th>
            <th className="py-1 pl-2 text-right font-medium">Actual</th>
            <th className="py-1 pl-2 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bad = r.category === 'savings' ? r.diff < -1 : r.diff > 1
            return (
              <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-right tabular-nums">{money0(r.planned)}</td>
                <td className="py-1.5 text-right tabular-nums">{money0(r.actual)}</td>
                <td className={cx('py-1.5 text-right tabular-nums whitespace-nowrap', bad && 'font-medium text-amber-700 dark:text-amber-400')}>
                  {bad && <span aria-hidden>▲ </span>}
                  {r.diff > 0 ? '+' : r.diff < 0 ? '−' : ''}{money0(Math.abs(r.diff))}
                  {bad && <span className="sr-only"> {r.category === 'savings' ? 'under plan' : 'over plan'}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function ProgressCard() {
  const data = useFinanceStore((s) => s.data)
  const goals = useBudgetStore((s) => s.profile.goals)
  const update = useBudgetStore((s) => s.update)
  const b = goalBalances(data)
  const linked = b.emergencyFund !== null || b.savings !== null || b.debt !== null
  const rows = [
    b.emergencyFund !== null && { label: 'Emergency fund', now: b.emergencyFund, target: goals.emergencyFund.target, planned: goals.emergencyFund.saved, debt: false },
    b.savings !== null && { label: goals.savings.name || 'Savings goal', now: b.savings, target: goals.savings.target, planned: goals.savings.saved, debt: false },
    b.debt !== null && { label: goals.debt.name || 'Card debt', now: b.debt, target: 0, planned: goals.debt.balance, debt: true },
  ].filter(Boolean) as { label: string; now: number; target: number; planned: number; debt: boolean }[]
  return (
    <Card title="Goal progress from your balances">
      {!linked ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          On the Accounts tab, link a savings account to your emergency fund or savings goal, or a card to debt payoff. Its latest statement balance then shows here.
        </p>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => {
            const progress = r.debt ? (r.planned > 0 ? Math.max(0, Math.min(1, 1 - r.now / r.planned)) : 0) : r.target > 0 ? Math.min(1, r.now / r.target) : 0
            return (
              <div key={r.label}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{r.label}</span>
                  <span className="tabular-nums text-slate-600 dark:text-slate-300">
                    {r.debt ? `${money0(r.now)} owed` : `${money0(r.now)}${r.target ? ` of ${money0(r.target)}` : ''}`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-(--c-track)" role="progressbar" aria-label={`${r.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                  <div className="h-full rounded-full bg-(--c-savings)" style={{ width: `${progress * 100}%` }} />
                </div>
                {r.debt && r.planned > 0 && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Paid down {money0(Math.max(0, r.planned - r.now))} since your plan's {money0(r.planned)} balance</p>}
              </div>
            )
          })}
          <div>
            <Button size="sm" onClick={() => update((p) => {
              if (b.emergencyFund !== null) p.goals.emergencyFund.saved = Math.round(b.emergencyFund)
              if (b.savings !== null) p.goals.savings.saved = Math.round(b.savings)
              if (b.debt !== null) p.goals.debt.balance = Math.round(b.debt)
            })}>Update my plan's goals with these balances</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function RecurringCard() {
  const data = useFinanceStore((s) => s.data)
  const rec = useMemo(() => findRecurring(data), [data])
  const total = rec.filter((r) => !r.stale).reduce((s, r) => s + r.monthly, 0)
  return (
    <Card title="Recurring charges" action={rec.length ? <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{money0(total)}/mo</span> : undefined}>
      {!rec.length ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">Recurring bills and subscriptions appear here once you've imported 2–3 months of statements.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rec.map((r) => (
            <li key={r.key} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{r.payee}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {r.cadence} · {r.kind ? EXPENSE_KINDS[r.kind].label : 'Uncategorized'} · last {r.lastDate}
                </span>
                {r.priceIncrease && (
                  <span className="mt-0.5 block text-xs font-medium text-amber-700 dark:text-amber-400">▲ Price went up from {money(r.priceIncrease.from, true)} to {money(r.priceIncrease.to, true)}</span>
                )}
                {r.stale && <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">No charge since {r.lastDate}: canceled?</span>}
              </span>
              <span className={cx('shrink-0 text-right text-sm tabular-nums', r.stale && 'line-through opacity-60')}>
                {money(r.amount, true)}
                <span className="block text-xs text-slate-500 dark:text-slate-400">{r.cadence === 'monthly' ? '' : `${money0(r.monthly)}/mo`}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function FillBudgetCard() {
  const profile = useBudgetStore((s) => s.profile)
  const update = useBudgetStore((s) => s.update)
  const data = useFinanceStore((s) => s.data)
  const { months, suggestions } = useMemo(() => suggestBudget(profile, data), [profile, data])
  const [chosen, setChosen] = useState<Set<string> | null>(null)
  const [done, setDone] = useState(false)
  const selected = chosen ?? new Set(suggestions.filter((s) => Math.abs(s.monthly - s.planned) >= 5).map((s) => s.kind))
  if (!months.length) {
    return (
      <Card title="Fill in my budget">
        <p className="text-sm text-slate-600 dark:text-slate-300">Once you've imported at least one full month, this suggests budget amounts from what you really spend.</p>
      </Card>
    )
  }
  const pick = suggestions.filter((s) => selected.has(s.kind))
  return (
    <Card title="Fill in my budget">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Average monthly spending over {months.length} full month{months.length > 1 ? 's' : ''} ({monthLabel(months[0])}
        {months.length > 1 ? ` – ${monthLabel(months[months.length - 1])}` : ''}). Checked lines replace that category's amount in your plan.
      </p>
      <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
        {suggestions.map((s: Suggestion) => (
          <li key={s.kind}>
            <label className="flex items-center gap-3 py-2">
              <input type="checkbox" className="h-4 w-4 accent-teal-700 dark:accent-teal-400" checked={selected.has(s.kind)}
                onChange={(e) => {
                  const next = new Set(selected)
                  if (e.target.checked) next.add(s.kind)
                  else next.delete(s.kind)
                  setChosen(next)
                  setDone(false)
                }} />
              <span className="flex-1">{EXPENSE_KINDS[s.kind].label}</span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">plan {money0(s.planned)}</span>
              <span className="w-24 text-right font-medium tabular-nums">{money0(s.monthly)}/mo</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!pick.length} onClick={() => {
          update((p) => Object.assign(p, applySuggestions(p, pick, newId)))
          setDone(true)
        }}>Update {pick.length} budget line{pick.length === 1 ? '' : 's'}</Button>
        {done && <span className="text-sm text-emerald-700 dark:text-emerald-400">✓ Your plan was updated. See the Budget tab.</span>}
      </div>
    </Card>
  )
}
