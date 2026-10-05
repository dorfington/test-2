import { Button, Card, Field, NumberInput, Select, TextInput } from '../../components/ui'
import { CATEGORY_DOT } from '../../lib/categoryStyles'
import { money } from '../../lib/format'
import { annualize } from '../../model/derive'
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EXPENSE_FREQUENCIES,
  EXPENSE_KIND_KEYS,
  EXPENSE_KINDS,
  makeExpense,
  type Category,
  type Expense,
  type ExpenseFrequency,
} from '../../model/profile'
import type { Errors } from '../../model/validate'
import { useBudgetStore } from '../../store/useBudgetStore'

const FREQ_LABELS: Record<ExpenseFrequency, string> = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

export function ExpensesStep({ errors }: { errors: Errors }) {
  const expenses = useBudgetStore((s) => s.profile.expenses)
  const addExpense = useBudgetStore((s) => s.addExpense)
  const used = new Set(expenses.map((e) => e.kind))

  return (
    <div className="grid gap-4">
      {CATEGORIES.map((cat) => {
        const rows = expenses.filter((e) => e.category === cat)
        const monthly = rows.reduce((s, e) => s + annualize(e.amount, e.frequency) / 12, 0)
        const suggestions = EXPENSE_KIND_KEYS.filter((k) => k !== 'other' && EXPENSE_KINDS[k].category === cat && !used.has(k))
        return (
          <Card
            key={cat}
            title={
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${CATEGORY_DOT[cat]}`} aria-hidden />
                {CATEGORY_LABELS[cat]}
              </span>
            }
            action={<span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{money(monthly)}/mo</span>}
          >
            {rows.length > 0 ? (
              <ul className="grid gap-3">
                {rows.map((e) => (
                  <ExpenseRow key={e.id} expense={e} error={errors[`expense-${e.id}`]} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nothing here yet.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestions.map((k) => (
                <Button key={k} size="sm" onClick={() => addExpense(makeExpense(k))}>
                  + {EXPENSE_KINDS[k].label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => addExpense(makeExpense('other', { category: cat }))}>
                + Custom
              </Button>
            </div>
          </Card>
        )
      })}
      <GoalsCard errors={errors} />
    </div>
  )
}

function ExpenseRow({ expense: e, error }: { expense: Expense; error?: string }) {
  const updateExpense = useBudgetStore((s) => s.updateExpense)
  const removeExpense = useBudgetStore((s) => s.removeExpense)
  return (
    <li className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_9rem_auto] sm:items-start dark:border-slate-800">
      <div className="col-span-2 sm:col-span-1">
        <TextInput aria-label="Expense name" placeholder="Name" value={e.name} invalid={!!error} maxLength={80}
          onChange={(ev) => updateExpense(e.id, { name: ev.target.value })} />
        {error && <p role="alert" className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-400">{error}</p>}
      </div>
      <NumberInput ariaLabel={`${e.name || 'Expense'} amount`} prefix="$" step={10} value={e.amount} onChange={(v) => updateExpense(e.id, { amount: v })} />
      <Select<ExpenseFrequency> ariaLabel={`${e.name || 'Expense'} frequency`} value={e.frequency}
        onChange={(v) => updateExpense(e.id, { frequency: v })}
        options={EXPENSE_FREQUENCIES.map((f) => ({ value: f, label: FREQ_LABELS[f] }))} />
      <Select<Category> ariaLabel={`${e.name || 'Expense'} category`} value={e.category}
        onChange={(v) => updateExpense(e.id, { category: v })}
        options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
      <Button variant="danger" size="sm" className="justify-self-end sm:mt-1" aria-label={`Remove ${e.name || 'expense'}`} onClick={() => removeExpense(e.id)}>
        Remove
      </Button>
    </li>
  )
}

function GoalsCard({ errors }: { errors: Errors }) {
  const goals = useBudgetStore((s) => s.profile.goals)
  const update = useBudgetStore((s) => s.update)
  return (
    <Card title="Goals (optional)">
      <div className="grid gap-6">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Emergency fund</legend>
          <Field label="Target" hint="Often 3–6 months of needs.">
            {(id, d) => <NumberInput id={id} describedBy={d} prefix="$" step={500} value={goals.emergencyFund.target} onChange={(v) => update((p) => void (p.goals.emergencyFund.target = v))} />}
          </Field>
          <Field label="Saved so far">
            {(id, d) => <NumberInput id={id} describedBy={d} prefix="$" step={100} value={goals.emergencyFund.saved} onChange={(v) => update((p) => void (p.goals.emergencyFund.saved = v))} />}
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Savings goal</legend>
          <Field label="What for?">
            {(id) => <TextInput id={id} placeholder="e.g. House down payment" maxLength={80} value={goals.savings.name} onChange={(e) => update((p) => void (p.goals.savings.name = e.target.value))} />}
          </Field>
          <Field label="Target">
            {(id, d) => <NumberInput id={id} describedBy={d} prefix="$" step={500} value={goals.savings.target} onChange={(v) => update((p) => void (p.goals.savings.target = v))} />}
          </Field>
          <Field label="Saved so far">
            {(id, d) => <NumberInput id={id} describedBy={d} prefix="$" step={100} value={goals.savings.saved} onChange={(v) => update((p) => void (p.goals.savings.saved = v))} />}
          </Field>
          <Field label="Deadline" error={errors.savingsDeadline}>
            {(id, d) => (
              <TextInput id={id} aria-describedby={d} type="date" value={goals.savings.deadline ?? ''} invalid={!!errors.savingsDeadline}
                onChange={(e) => update((p) => void (p.goals.savings.deadline = e.target.value || null))} />
            )}
          </Field>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Debt payoff</legend>
          <Field label="Which debt?">
            {(id) => <TextInput id={id} placeholder="e.g. Credit card" maxLength={80} value={goals.debt.name} onChange={(e) => update((p) => void (p.goals.debt.name = e.target.value))} />}
          </Field>
          <Field label="Balance">
            {(id, d) => <NumberInput id={id} describedBy={d} prefix="$" step={100} value={goals.debt.balance} onChange={(v) => update((p) => void (p.goals.debt.balance = v))} />}
          </Field>
          <Field label="Interest rate (APR)">
            {(id, d) => <NumberInput id={id} describedBy={d} suffix="%" step={0.1} max={100} value={goals.debt.aprPercent} onChange={(v) => update((p) => void (p.goals.debt.aprPercent = v))} />}
          </Field>
        </fieldset>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Progress uses your "Emergency fund", "Investing" and "Extra debt payments" lines plus minimum debt payments.
        </p>
      </div>
    </Card>
  )
}
