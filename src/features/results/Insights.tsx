import type { Budget, GoalProgress, Severity } from '../../budget/budget'
import { cx } from '../../lib/cx'
import { money0 } from '../../lib/format'

const SEVERITY: Record<Severity, { icon: string; label: string; cls: string }> = {
  bad: { icon: '!', label: 'Problem', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
  warn: { icon: '▲', label: 'Watch', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  info: { icon: 'i', label: 'Tip', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  good: { icon: '✓', label: 'Good', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
}

export function Recommendations({ budget }: { budget: Budget }) {
  return (
    <ul className="grid gap-3">
      {budget.recommendations.map((r) => {
        const s = SEVERITY[r.severity]
        return (
          <li key={r.id} className="flex gap-3">
            <span className={cx('mt-0.5 flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold', s.cls)}>
              <span aria-hidden>{s.icon}</span>
              {s.label}
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.title}</p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{r.detail}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function duration(months: number) {
  if (months === 0) return 'reached'
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y && `${y} yr`, m && `${m} mo`].filter(Boolean).join(' ')
}

function goalLine(g: GoalProgress): string {
  if (g.id === 'debt') {
    if (g.months === null) return g.monthlyContribution > 0 ? "Payments don't cover the interest" : 'Add debt payments to see a payoff date'
    return `Paid off in ${duration(g.months)} at ${money0(g.monthlyContribution)}/mo (${money0(g.totalInterest ?? 0)} interest)`
  }
  if (g.months === 0) return 'Goal reached'
  if (g.months === null) return 'Nothing going toward this yet'
  const base = `${duration(g.months)} to go at ${money0(g.monthlyContribution)}/mo`
  if (g.monthsToDeadline !== undefined && g.requiredMonthly !== undefined) {
    return g.onTrack ? `${base} · on track for your deadline` : `${base} · needs ${money0(g.requiredMonthly)}/mo to make your deadline`
  }
  return base
}

export function Goals({ budget }: { budget: Budget }) {
  if (budget.goals.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Add an emergency fund, savings or debt goal on the Expenses step to track it here.</p>
  }
  return (
    <ul className="grid gap-5">
      {budget.goals.map((g) => {
        const progress = g.id === 'debt' ? 0 : g.target > 0 ? Math.min(1, g.current / g.target) : 0
        const behind = g.months === null || g.onTrack === false
        return (
          <li key={g.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-200">{g.name}</span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                {g.id === 'debt' ? `${money0(g.target)} balance` : `${money0(g.current)} of ${money0(g.target)}`}
              </span>
            </div>
            {g.id !== 'debt' && (
              <div className="h-2 rounded-full bg-(--c-track)" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={`${g.name} progress`}>
                <div className="h-full rounded-full bg-(--c-savings)" style={{ width: `${progress * 100}%` }} />
              </div>
            )}
            <p className={cx('mt-1.5 text-xs', behind ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400')}>
              {behind && <span aria-hidden>▲ </span>}
              {goalLine(g)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
