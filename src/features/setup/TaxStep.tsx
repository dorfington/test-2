import { CUSTOM_LOCALITY_ID, localitiesFor } from '../../engine'
import { Card, Field, Notice, NumberInput, Select, Toggle } from '../../components/ui'
import { DEDUCTION_FREQUENCIES, type DeductionFrequency } from '../../model/profile'
import type { Errors } from '../../model/validate'
import { useBudgetStore } from '../../store/useBudgetStore'
import { getTaxYear, STATE_CODES, TAX_YEARS, type FilingStatus, type StateCode } from '../../taxdata'

const STATUS_LABELS: Record<FilingStatus, string> = { single: 'Single', married: 'Married filing jointly', headOfHousehold: 'Head of household' }
const FREQ_LABELS: Record<DeductionFrequency, string> = { paycheck: 'per paycheck', monthly: 'per month', yearly: 'per year' }
const NONE = '__none__'

/** States where every resident owes a county tax, so leaving it blank understates tax. */
const COUNTY_REQUIRED: Partial<Record<StateCode, string>> = { MD: 'Maryland', IN: 'Indiana' }

export function TaxStep({ errors }: { errors: Errors }) {
  const taxes = useBudgetStore((s) => s.profile.taxes)
  const ded = useBudgetStore((s) => s.profile.deductions)
  const update = useBudgetStore((s) => s.update)
  const data = getTaxYear(taxes.year)
  const states = STATE_CODES.map((c) => ({ value: c, label: data.states[c].name })).sort((a, b) => a.label.localeCompare(b.label))
  const locals = taxes.state ? localitiesFor(data, taxes.state) : []
  const stateData = taxes.state ? data.states[taxes.state] : null

  return (
    <div className="grid gap-4">
      <Card title="Filing and location">
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Filing status">
              {(id, d) => (
                <Select<FilingStatus> id={id} describedBy={d} value={taxes.filingStatus}
                  onChange={(v) => update((p) => void (p.taxes.filingStatus = v))}
                  options={(Object.keys(STATUS_LABELS) as FilingStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
              )}
            </Field>
            <Field label="Tax year">
              {(id, d) => (
                <Select id={id} describedBy={d} value={String(taxes.year)}
                  onChange={(v) => update((p) => void (p.taxes.year = Number(v)))}
                  options={TAX_YEARS.map((y) => ({ value: String(y), label: String(y) }))} />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="State you live in" error={errors.state}>
              {(id, d) => (
                <Select id={id} describedBy={d} invalid={!!errors.state} value={taxes.state ?? NONE}
                  onChange={(v) =>
                    update((p) => {
                      p.taxes.state = v === NONE ? null : (v as StateCode)
                      p.taxes.localityId = null
                    })
                  }
                  options={[{ value: NONE, label: 'Choose a state…' }, ...states]} />
              )}
            </Field>
            {taxes.state && (
              <Field label="Local income tax" hint={locals.length === 0 ? 'No local taxes are built in for this state. Use "Other" if your city has one.' : undefined}>
                {(id, d) => (
                  <Select id={id} describedBy={d} value={taxes.localityId ?? NONE}
                    onChange={(v) => update((p) => void (p.taxes.localityId = v === NONE ? null : v))}
                    options={[
                      { value: NONE, label: 'None' },
                      ...locals.map((l) => ({ value: l.id, label: l.name })),
                      { value: CUSTOM_LOCALITY_ID, label: 'Other (enter a rate)' },
                    ]} />
                )}
              </Field>
            )}
          </div>

          {taxes.localityId === CUSTOM_LOCALITY_ID && (
            <Field label="Local wage tax rate" hint="Applied to your wages (e.g. a Pennsylvania earned income tax or an Ohio city tax)." error={errors.customLocalRatePercent}>
              {(id, d) => (
                <NumberInput id={id} describedBy={d} suffix="%" step={0.05} max={10} value={taxes.customLocalRatePercent} invalid={!!errors.customLocalRatePercent}
                  onChange={(v) => update((p) => void (p.taxes.customLocalRatePercent = v))} />
              )}
            </Field>
          )}

          {taxes.state && COUNTY_REQUIRED[taxes.state] && !taxes.localityId && (
            <Notice tone="warn">Every {COUNTY_REQUIRED[taxes.state]} resident pays a county income tax. Choose your county for an accurate estimate.</Notice>
          )}
          {stateData && stateData.type === 'none' && <Notice tone="good">{stateData.name} doesn't tax wages.</Notice>}

          <Field label="Children under 17" hint="Used for the Child Tax Credit and state dependent exemptions.">
            {(id, d) => (
              <NumberInput id={id} describedBy={d} step={1} max={20} value={taxes.dependents}
                onChange={(v) => update((p) => void (p.taxes.dependents = Math.round(v)))} />
            )}
          </Field>

          {taxes.filingStatus === 'married' && (
            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 dark:bg-slate-800/60">
              <Field label="Spouse's annual income" hint="Optional. Leave blank for a single-income household.">
                {(id, d) => (
                  <NumberInput id={id} describedBy={d} prefix="$" step={1000} value={taxes.spouseIncome}
                    onChange={(v) => update((p) => void (p.taxes.spouseIncome = v))} />
                )}
              </Field>
              <Field label="Spouse's 401(k)/403(b)">
                {(id, d) => (
                  <NumberInput id={id} describedBy={d} suffix="%" step={1} max={100} value={taxes.spouseRetirementPercent}
                    onChange={(v) => update((p) => void (p.taxes.spouseRetirementPercent = v))} />
                )}
              </Field>
            </div>
          )}
        </div>
      </Card>

      <Card title="Pre-tax deductions">
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="401(k) / 403(b) contribution" hint="Percent of each paycheck (traditional, pre-tax)." error={errors.retirementPercent}>
              {(id, d) => (
                <NumberInput id={id} describedBy={d} suffix="%" step={1} max={100} value={ded.retirementPercent} invalid={!!errors.retirementPercent}
                  onChange={(v) => update((p) => void (p.deductions.retirementPercent = v))} />
              )}
            </Field>
            <Field label="Employer match" hint="Counted as savings, not take-home pay.">
              {(id, d) => (
                <NumberInput id={id} describedBy={d} suffix="%" step={0.5} max={100} value={ded.employerMatchPercent}
                  onChange={(v) => update((p) => void (p.deductions.employerMatchPercent = v))} />
              )}
            </Field>
          </div>
          <DeductionRow label="Health insurance premium" hint="Your share, taken from pay before tax." field="healthInsurance" />
          <DeductionRow label="HSA / FSA contribution" hint="Payroll contributions only." field="hsa" />
          {stateData && (stateData.taxes401k || stateData.taxesHsa || stateData.taxesSection125) && (
            <Notice tone="info">
              {stateData.name} taxes some of these:{' '}
              {[stateData.taxes401k && '401(k)/403(b)', stateData.taxesSection125 && 'health premiums (Section 125)', stateData.taxesHsa && 'HSA']
                .filter(Boolean)
                .join(', ')}
              . The estimate accounts for this.
            </Notice>
          )}
          {stateData && stateData.payrollTaxes.length > 0 && (
            <Toggle
              checked={taxes.includeStatePayroll}
              onChange={(v) => update((p) => void (p.taxes.includeStatePayroll = v))}
              label={`Include ${stateData.name} payroll deductions`}
              hint={stateData.payrollTaxes.map((t) => t.name).join(', ')}
            />
          )}
        </div>
      </Card>
    </div>
  )
}

function DeductionRow({ label, hint, field }: { label: string; hint: string; field: 'healthInsurance' | 'hsa' }) {
  const value = useBudgetStore((s) => s.profile.deductions[field])
  const update = useBudgetStore((s) => s.update)
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <div className="flex gap-2">
          <div className="flex-1">
            <NumberInput id={id} describedBy={d} prefix="$" step={10} value={value.amount}
              onChange={(v) => update((p) => void (p.deductions[field].amount = v))} />
          </div>
          <div className="w-36 shrink-0 sm:w-40">
            <Select<DeductionFrequency> ariaLabel={`${label} frequency`} value={value.frequency}
              onChange={(v) => update((p) => void (p.deductions[field].frequency = v))}
              options={DEDUCTION_FREQUENCIES.map((f) => ({ value: f, label: FREQ_LABELS[f] }))} />
          </div>
        </div>
      )}
    </Field>
  )
}

