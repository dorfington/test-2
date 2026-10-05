import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CATEGORY_COLOR } from '../../lib/categoryStyles'
import { money0, pct } from '../../lib/format'
import type { MonthSummary } from '../../finance/analysis'

const monthLabel = (m: string, long = false) => new Date(m + '-15').toLocaleDateString('en-US', long ? { month: 'long', year: 'numeric' } : { month: 'short' })

const SERIES = [
  { key: 'needs', label: 'Needs', color: CATEGORY_COLOR.needs },
  { key: 'wants', label: 'Wants', color: CATEGORY_COLOR.wants },
  { key: 'savings', label: 'Saved', color: CATEGORY_COLOR.savings },
  { key: 'uncategorized', label: 'Uncategorized', color: CATEGORY_COLOR.unassigned },
] as const

/** Monthly spending by bucket (stacked bars) with income as a line on the same dollar axis. */
export function TrendsChart({ months }: { months: MonthSummary[] }) {
  const rows = months.map((m) => ({ month: monthLabel(m.month), full: m.month, ...m.spending, needs: Math.max(0, m.spending.needs), wants: Math.max(0, m.spending.wants), savings: Math.max(0, m.spending.savings), uncategorized: Math.max(0, m.spending.uncategorized), income: m.income, complete: m.complete }))
  const hasUncat = months.some((m) => m.spending.uncategorized > 0.5)
  const series = SERIES.filter((s) => s.key !== 'uncategorized' || hasUncat)
  return (
    <div className="grid gap-3">
      <div className="h-64 w-full" role="img" aria-label={`Monthly spending and income for ${months.length} months; details in the table below`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--c-track)" />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: 'var(--c-track)' }} tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.7 }} />
            <YAxis width={56} tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.7 }} tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)} />
            <Tooltip
              cursor={{ fill: 'var(--c-track)', opacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const r = payload[0].payload as (typeof rows)[number]
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
                    <p className="mb-1 font-medium text-slate-900 dark:text-slate-100">{monthLabel(r.full, true)}{!r.complete && ' (partial)'}</p>
                    {series.map((s) => (
                      <p key={s.key} className="flex items-center gap-2 tabular-nums text-slate-700 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
                        {s.label}: {money0(r[s.key])}
                      </p>
                    ))}
                    <p className="mt-1 flex items-center gap-2 tabular-nums text-slate-700 dark:text-slate-300">
                      <span className="h-0.5 w-3 bg-(--c-target)" aria-hidden /> Income: {money0(r.income)}
                    </p>
                  </div>
                )
              }}
            />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="spend" fill={s.color} stroke="var(--c-surface)" strokeWidth={1.5} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
            <Line dataKey="income" type="monotone" stroke="var(--c-target)" strokeWidth={2} dot={{ r: 4, fill: 'var(--c-target)' }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</li>
        ))}
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-(--c-target)" aria-hidden />Income</li>
      </ul>
      <table className="w-full text-sm">
        <caption className="sr-only">Monthly totals</caption>
        <thead>
          <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
            <th className="py-1 font-medium">Month</th>
            <th className="py-1 pl-2 text-right font-medium">Income</th>
            <th className="py-1 pl-2 text-right font-medium">Spent</th>
            <th className="py-1 pl-2 text-right font-medium">Saved</th>
            <th className="py-1 pl-2 text-right font-medium">Left over</th>
            <th className="hidden py-1 pl-2 text-right font-medium sm:table-cell">Savings rate</th>
          </tr>
        </thead>
        <tbody>
          {[...months].reverse().map((m) => (
            <tr key={m.month} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1.5">{monthLabel(m.month, true)}{!m.complete && <span className="text-xs text-slate-500"> (partial)</span>}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{money0(m.income)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{money0(m.totalSpending)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums">{money0(m.saved)}</td>
              <td className={`py-1.5 pl-2 text-right tabular-nums ${m.net < 0 ? 'font-medium text-rose-700 dark:text-rose-400' : ''}`}>{m.net < 0 ? '−' : ''}{money0(Math.abs(m.net))}</td>
              <td className="hidden py-1.5 pl-2 text-right tabular-nums sm:table-cell">{m.savingsRate === null ? '–' : pct(m.savingsRate, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
