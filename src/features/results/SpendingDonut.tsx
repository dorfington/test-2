import { useState } from 'react'
import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip, type PieSectorShapeProps } from 'recharts'
import type { Budget } from '../../budget/budget'
import { CATEGORY_COLOR } from '../../lib/categoryStyles'
import { money0, pct } from '../../lib/format'
import { CATEGORY_LABELS } from '../../model/profile'

interface Slice {
  key: 'needs' | 'wants' | 'savings' | 'unassigned'
  name: string
  value: number
  fill: string
}

/** Donut of the monthly 50/30/20 base split into needs, wants, savings and unassigned money. */
export function SpendingDonut({ budget }: { budget: Budget }) {
  const [showTable, setShowTable] = useState(false)
  const unassigned = Math.max(0, budget.leftover)
  const slices: Slice[] = [
    { key: 'needs' as const, name: CATEGORY_LABELS.needs, value: budget.totals.needs, fill: CATEGORY_COLOR.needs },
    { key: 'wants' as const, name: CATEGORY_LABELS.wants, value: budget.totals.wants, fill: CATEGORY_COLOR.wants },
    { key: 'savings' as const, name: CATEGORY_LABELS.savings, value: budget.totals.savings, fill: CATEGORY_COLOR.savings },
    { key: 'unassigned' as const, name: 'Unassigned', value: unassigned, fill: CATEGORY_COLOR.unassigned },
  ].filter((s) => s.value > 0.5)
  const total = slices.reduce((s, x) => s + x.value, 0)

  if (total === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Add expenses to see where your money goes.</p>
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_1fr] sm:items-center">
      <div className="relative mx-auto aspect-square w-full max-w-52" role="img" aria-label={`Monthly spending: ${slices.map((s) => `${s.name} ${money0(s.value)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              cornerRadius={4}
              stroke="none"
              isAnimationActive={false}
              shape={({ key, ...props }: PieSectorShapeProps) => <Sector key={key ?? undefined} {...props} fill={(props.payload as Slice).fill} />}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const s = payload[0].payload as Slice
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.fill }} aria-hidden />
                      {s.name}
                    </div>
                    <div className="mt-0.5 tabular-nums text-slate-600 dark:text-slate-300">
                      {money0(s.value)}/mo · {pct(s.value / total, 0)}
                    </div>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-slate-500 dark:text-slate-400">Per month</span>
          <span className="text-xl font-semibold text-slate-900 dark:text-slate-100">{money0(total)}</span>
        </div>
      </div>

      <div className="grid gap-2">
        <ul className="grid gap-2" aria-label="Legend">
          {slices.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-300">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.fill }} aria-hidden />
                {s.name}
              </span>
              <span className="whitespace-nowrap tabular-nums text-slate-900 dark:text-slate-100">
                {money0(s.value)} <span className="text-slate-500 dark:text-slate-400">· {pct(s.value / total, 0)}</span>
              </span>
            </li>
          ))}
        </ul>
        {budget.leftover < -0.5 && (
          <p className="text-sm font-medium text-rose-700 dark:text-rose-400">Over budget by {money0(-budget.leftover)}/month</p>
        )}
        <button type="button" onClick={() => setShowTable((v) => !v)} className="justify-self-start text-xs font-medium text-teal-800 underline-offset-2 hover:underline dark:text-teal-300" aria-expanded={showTable}>
          {showTable ? 'Hide' : 'Show'} every line
        </button>
        {showTable && <AllocationTable budget={budget} />}
      </div>
    </div>
  )
}

export function AllocationTable({ budget }: { budget: Budget }) {
  const rows = [...budget.allocations].sort((a, b) => b.monthly - a.monthly)
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Every budget line, per month</caption>
      <thead>
        <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
          <th className="py-1 font-medium">Item</th>
          <th className="py-1 font-medium">Category</th>
          <th className="py-1 text-right font-medium">Per month</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-1.5 text-slate-800 dark:text-slate-200">
              {a.name}
              {a.payroll && <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">(from paycheck)</span>}
            </td>
            <td className="py-1.5 text-slate-600 dark:text-slate-400">{CATEGORY_LABELS[a.category]}</td>
            <td className="py-1.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{money0(a.monthly)}</td>
          </tr>
        ))}
        {budget.leftover > 0.5 && (
          <tr className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-1.5 text-slate-800 dark:text-slate-200">Unassigned</td>
            <td className="py-1.5 text-slate-600 dark:text-slate-400">—</td>
            <td className="py-1.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{money0(budget.leftover)}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
