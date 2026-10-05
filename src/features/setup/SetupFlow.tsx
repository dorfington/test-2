import { lazy, Suspense, useState } from 'react'
import { Button } from '../../components/ui'
import { cx } from '../../lib/cx'
import { VALIDATORS, isStepValid, type StepId } from '../../model/validate'
import { STEPS, useBudgetStore, type Step } from '../../store/useBudgetStore'
import { ExpensesStep } from './ExpensesStep'
import { IncomeStep } from './IncomeStep'
import { TaxStep } from './TaxStep'

// The dashboard (charts, exports) loads only when you reach results.
const ResultsPage = lazy(() => import('../results/ResultsPage').then((m) => ({ default: m.ResultsPage })))

const LABELS: Record<Step, string> = { income: 'Income', taxes: 'Taxes', expenses: 'Expenses', results: 'Results' }

export function SetupFlow() {
  const step = useBudgetStore((s) => s.step)
  const setStep = useBudgetStore((s) => s.setStep)
  const completed = useBudgetStore((s) => s.completed)
  const complete = useBudgetStore((s) => s.complete)
  const profile = useBudgetStore((s) => s.profile)
  // Errors are shown only after the user tries to continue from a step.
  const [attempted, setAttempted] = useState<Partial<Record<StepId, boolean>>>({})

  const index = STEPS.indexOf(step)
  const errors = step !== 'results' && attempted[step] ? VALIDATORS[step](profile) : {}
  /** A step can be opened if every step before it is valid (or the flow was completed once). */
  const reachable = (i: number) => STEPS.slice(0, i).every((s) => s === 'results' || isStepValid(s, profile)) && (completed || i <= index + 1)

  const go = (target: Step) => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (target === 'results') complete()
    else setStep(target)
  }

  const next = () => {
    if (step === 'results') return
    if (!isStepValid(step, profile)) {
      setAttempted((a) => ({ ...a, [step]: true }))
      return
    }
    go(STEPS[index + 1])
  }

  return (
    <div className="grid gap-6">
      <nav aria-label="Setup steps">
        <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {STEPS.map((s, i) => {
            const current = s === step
            const done = i < index || (completed && s !== step && (s === 'results' || isStepValid(s, profile)))
            const canOpen = !current && reachable(i)
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={!canOpen}
                  aria-current={current ? 'step' : undefined}
                  onClick={() => go(s)}
                  className={cx(
                    'flex w-full flex-col items-start gap-1 rounded-xl border px-2.5 py-2 text-left transition-colors sm:px-3',
                    current
                      ? 'border-teal-700 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/40'
                      : 'border-slate-200 bg-white enabled:hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900',
                    !canOpen && !current && 'opacity-60',
                  )}
                >
                  <span
                    className={cx(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                      current ? 'bg-teal-700 text-white dark:bg-teal-400 dark:text-slate-950' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
                    )}
                    aria-hidden
                  >
                    {done && !current ? '✓' : i + 1}
                  </span>
                  <span className="text-xs font-medium text-slate-800 sm:text-sm dark:text-slate-200">{LABELS[s]}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {step === 'income' && <IncomeStep errors={errors} />}
      {step === 'taxes' && <TaxStep errors={errors} />}
      {step === 'expenses' && <ExpensesStep errors={errors} />}
      {step === 'results' && (
        <Suspense fallback={<p className="py-12 text-center text-sm text-slate-500" role="status">Building your budget…</p>}>
          <ResultsPage onEdit={(s) => go(s)} />
        </Suspense>
      )}

      {step !== 'results' && (
        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 dark:border-slate-800 dark:bg-slate-950/90 sm:dark:bg-transparent">
          <Button variant="ghost" disabled={index === 0} onClick={() => go(STEPS[index - 1])}>
            Back
          </Button>
          {Object.keys(errors).length > 0 && (
            <p className="text-sm text-rose-700 dark:text-rose-400" role="status">
              Fix the highlighted fields to continue.
            </p>
          )}
          <Button variant="primary" onClick={next}>
            {step === 'expenses' ? 'See my budget' : 'Continue'}
          </Button>
        </div>
      )}
    </div>
  )
}
