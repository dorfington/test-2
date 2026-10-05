import { useId } from 'react'
import { Button } from '../../components/ui'
import { money0 } from '../../lib/format'
import { annualGross, annualize } from '../../model/derive'
import { applyWhatIf } from '../../model/whatif'
import { useBudgetStore } from '../../store/useBudgetStore'

function Slider({ label, value, min, max, step, format, onChange, changed }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  changed: boolean
}) {
  const id = useId()
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</label>
        <output htmlFor={id} className={`text-sm tabular-nums ${changed ? 'font-semibold text-teal-800 dark:text-teal-300' : 'text-slate-600 dark:text-slate-300'}`}>
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="h-2 w-full cursor-pointer accent-teal-700 dark:accent-teal-400"
      />
      <div className="mt-0.5 flex justify-between text-xs text-slate-400">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  )
}

/** Sliders that change salary, rent and 401(k) % without touching the saved profile. */
export function WhatIfPanel({ deltaPerMonth }: { deltaPerMonth: number | null }) {
  const profile = useBudgetStore((s) => s.profile)
  const whatIf = useBudgetStore((s) => s.whatIf)
  const setWhatIf = useBudgetStore((s) => s.setWhatIf)
  const update = useBudgetStore((s) => s.update)

  const baseGross = annualGross(profile.income)
  const baseRent = profile.expenses.filter((e) => e.kind === 'housing').reduce((s, e) => s + annualize(e.amount, e.frequency) / 12, 0)
  const baseRetirement = profile.deductions.retirementPercent

  const gross = whatIf.annualGross ?? baseGross
  const rent = whatIf.monthlyHousing ?? baseRent
  const retirement = whatIf.retirementPercent ?? baseRetirement
  const active = Object.keys(whatIf).length > 0

  const grossMax = Math.max(50_000, Math.ceil((baseGross * 2) / 5_000) * 5_000)
  const rentMax = Math.max(3_000, Math.ceil((baseRent * 2) / 250) * 250)

  return (
    <div className="grid gap-5">
      <Slider label="Salary" value={gross} min={0} max={grossMax} step={1_000} format={(v) => `${money0(v)}/yr`} changed={whatIf.annualGross !== undefined}
        onChange={(v) => setWhatIf({ ...whatIf, annualGross: v })} />
      <Slider label="Rent / mortgage" value={rent} min={0} max={rentMax} step={25} format={(v) => `${money0(v)}/mo`} changed={whatIf.monthlyHousing !== undefined}
        onChange={(v) => setWhatIf({ ...whatIf, monthlyHousing: v })} />
      <Slider label="401(k) savings rate" value={retirement} min={0} max={50} step={1} format={(v) => `${v}%`} changed={whatIf.retirementPercent !== undefined}
        onChange={(v) => setWhatIf({ ...whatIf, retirementPercent: v })} />

      {active ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-teal-50 px-3 py-2 dark:bg-teal-950/40">
          <p className="text-sm text-teal-900 dark:text-teal-200">
            What-if view, not saved.
            {deltaPerMonth !== null && Math.abs(deltaPerMonth) >= 1 && (
              <> Take-home {deltaPerMonth > 0 ? 'up' : 'down'} <strong className="tabular-nums">{money0(Math.abs(deltaPerMonth))}</strong>/mo.</>
            )}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setWhatIf({})}>Reset</Button>
            <Button size="sm" variant="primary" onClick={() => {
              const next = applyWhatIf(profile, whatIf)
              update((p) => Object.assign(p, next))
              setWhatIf({})
            }}>Save to my plan</Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">Move a slider to see your budget update. Nothing is saved until you choose to.</p>
      )}
    </div>
  )
}
