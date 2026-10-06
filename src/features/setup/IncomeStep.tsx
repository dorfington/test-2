import { Card, Field, NumberInput, Segmented, Select } from '../../components/ui'
import { money } from '../../lib/format'
import { annualGross, periods } from '../../model/derive'
import { PAY_FREQUENCIES, PAY_FREQUENCY_LABELS, type PayFrequency } from '../../model/profile'
import type { Errors } from '../../model/validate'
import { useBudgetStore } from '../../store/useBudgetStore'
import { PaystubImport } from './PaystubImport'

export function IncomeStep({ errors }: { errors: Errors }) {
  const income = useBudgetStore((s) => s.profile.income)
  const update = useBudgetStore((s) => s.update)
  const gross = annualGross(income)
  const p = periods(gross, income.payFrequency)

  return (
    <div className="grid gap-4">
      <PaystubImport />
      <Card title="Your income">
        <div className="grid gap-5">
          <Segmented
            label="Pay type"
            value={income.payType}
            onChange={(v) => update((d) => void (d.income.payType = v))}
            options={[
              { value: 'salary', label: 'Annual salary' },
              { value: 'hourly', label: 'Hourly' },
            ]}
          />

          {income.payType === 'salary' ? (
            <Field label="Annual salary (before taxes)" error={errors.annualSalary}>
              {(id, d) => (
                <NumberInput id={id} describedBy={d} prefix="$" step={1000} value={income.annualSalary} invalid={!!errors.annualSalary}
                  onChange={(v) => update((p) => void (p.income.annualSalary = v))} />
              )}
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Hourly rate" error={errors.hourlyRate}>
                {(id, d) => (
                  <NumberInput id={id} describedBy={d} prefix="$" step={0.25} value={income.hourlyRate} invalid={!!errors.hourlyRate}
                    onChange={(v) => update((p) => void (p.income.hourlyRate = v))} />
                )}
              </Field>
              <Field label="Hours per week" error={errors.hoursPerWeek}>
                {(id, d) => (
                  <NumberInput id={id} describedBy={d} suffix="hrs" step={1} max={168} value={income.hoursPerWeek} invalid={!!errors.hoursPerWeek}
                    onChange={(v) => update((p) => void (p.income.hoursPerWeek = v))} />
                )}
              </Field>
            </div>
          )}

          <Field label="How often are you paid?">
            {(id, d) => (
              <Select<PayFrequency> id={id} describedBy={d} value={income.payFrequency}
                onChange={(v) => update((p) => void (p.income.payFrequency = v))}
                options={PAY_FREQUENCIES.map((f) => ({ value: f, label: PAY_FREQUENCY_LABELS[f] }))} />
            )}
          </Field>

          {gross > 0 && (
            <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800/60">
              {([['Per year', p.year], ['Per month', p.month], ['Per paycheck', p.paycheck]] as const).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{money(v)}</dd>
                </div>
              ))}
              <p className="col-span-3 text-xs text-slate-500 dark:text-slate-400">Gross pay, before taxes and deductions</p>
            </dl>
          )}
        </div>
      </Card>
    </div>
  )
}
