import { useState } from 'react'
import type { Budget } from '../../budget/budget'
import { CATEGORY_COLOR } from '../../lib/categoryStyles'
import { money0 } from '../../lib/format'
import { CATEGORIES, CATEGORY_LABELS, type Category } from '../../model/profile'

/**
 * Actual share of income per category against the personalized target, with
 * the plain 50/30/20 mark shown when the target differs from it.
 * Bars are HTML so they stay crisp and responsive; hover or focus shows details.
 */
export function SplitBars({ budget }: { budget: Budget }) {
  const [hover, setHover] = useState<Category | null>(null)
  const scaleMax = Math.max(100, ...CATEGORIES.map((c) => budget.actualPct[c]))
  const x = (v: number) => `${(Math.min(v, scaleMax) / scaleMax) * 100}%`
  const adjusted = CATEGORIES.some((c) => Math.round(budget.targetPct[c]) !== budget.standardPct[c])

  return (
    <div className="grid gap-5">
      {CATEGORIES.map((c) => {
        const actual = budget.actualPct[c]
        const target = budget.targetPct[c]
        const diff = budget.totals[c] - budget.targetMonthly[c]
        const status = c === 'savings' ? (diff >= -1 ? 'good' : 'low') : diff <= 1 ? 'good' : 'high'
        return (
          <div
            key={c}
            className="relative"
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(c)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${CATEGORY_LABELS[c]}: ${Math.round(actual)}% of income, target ${Math.round(target)}%`}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-800 dark:text-slate-200">{CATEGORY_LABELS[c]}</span>
              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{Math.round(actual)}%</span> · target {Math.round(target)}%
                <span className={`ml-1.5 text-xs ${status === 'good' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {status === 'good' ? '✓ on target' : status === 'high' ? `▲ ${money0(diff)} over` : `▼ ${money0(-diff)} short`}
                </span>
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-(--c-track)">
              <div className="h-full rounded-full" style={{ width: x(actual), background: CATEGORY_COLOR[c] }} />
              <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-(--c-target)" style={{ left: `calc(${x(target)} - 1px)` }} aria-hidden />
              {adjusted && Math.round(target) !== budget.standardPct[c] && (
                <span
                  className="absolute -top-1 -bottom-1 w-0 border-l-2 border-dotted border-(--c-target) opacity-60"
                  style={{ left: `calc(${x(budget.standardPct[c])} - 1px)` }}
                  aria-hidden
                />
              )}
            </div>
            {hover === c && (
              <div role="tooltip" className="absolute right-0 z-10 mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
                <div className="tabular-nums text-slate-700 dark:text-slate-300">
                  You: {money0(budget.totals[c])}/mo ({Math.round(actual)}%)
                </div>
                <div className="tabular-nums text-slate-700 dark:text-slate-300">
                  Target: {money0(budget.targetMonthly[c])}/mo ({Math.round(target)}%)
                </div>
                <div className="tabular-nums text-slate-500 dark:text-slate-400">50/30/20 rule: {budget.standardPct[c]}%</div>
              </div>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 rounded bg-(--c-target)" aria-hidden /> Your target
        </span>
        {adjusted && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-0 border-l-2 border-dotted border-(--c-target)" aria-hidden /> Standard 50/30/20
          </span>
        )}
        <span>Percent of take-home pay plus pre-tax deductions ({money0(budget.base)}/mo)</span>
      </div>
    </div>
  )
}
