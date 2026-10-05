import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cx } from '../lib/cx'

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-sm' : 'px-4 py-2.5 text-sm',
        variant === 'primary' && 'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400',
        variant === 'secondary' &&
          'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
        variant === 'danger' && 'text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950',
        className,
      )}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
  className?: string
}) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-800 dark:text-slate-200">
        {label}
      </label>
      {children(id, [hintId, errId].filter(Boolean).join(' ') || undefined)}
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}

const inputBase =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 aria-[invalid=true]:border-rose-500'

interface NumberInputProps {
  id?: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  step?: number
  min?: number
  max?: number
  invalid?: boolean
  describedBy?: string
  ariaLabel?: string
  placeholder?: string
}

/** Numeric input that shows blank instead of 0 and never emits NaN. */
export function NumberInput({ id, value, onChange, prefix, suffix, step = 1, min = 0, max, invalid, describedBy, ariaLabel, placeholder = '0' }: NumberInputProps) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">{prefix}</span>}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={value === 0 ? '' : value}
        onChange={(e) => {
          const v = e.target.valueAsNumber
          onChange(Number.isFinite(v) ? Math.max(min, max !== undefined ? Math.min(max, v) : v) : 0)
        }}
        className={cx(inputBase, 'tabular-nums', prefix && 'pl-7', suffix && 'pr-10')}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">{suffix}</span>}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props
  return <input type="text" {...rest} aria-invalid={invalid || undefined} className={cx(inputBase, className)} />
}

export function Select<T extends string>({
  id,
  value,
  onChange,
  options,
  describedBy,
  ariaLabel,
  invalid,
  className,
}: {
  id?: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; group?: string }[]
  describedBy?: string
  ariaLabel?: string
  invalid?: boolean
  className?: string
}) {
  const groups = [...new Set(options.map((o) => o.group))]
  const render = (os: typeof options) =>
    os.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))
  return (
    <select
      id={id}
      value={value}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value as T)}
      className={cx(inputBase, 'appearance-auto', className)}
    >
      {groups.length > 1
        ? groups.map((g) =>
            g ? (
              <optgroup key={g} label={g}>
                {render(options.filter((o) => o.group === g))}
              </optgroup>
            ) : (
              render(options.filter((o) => !o.group))
            ),
          )
        : render(options)}
    </select>
  )
}

/** Segmented control (radio group). */
export function Segmented<T extends string>({ value, onChange, options, label, compact }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800', compact ? 'w-auto' : 'w-full sm:w-auto')}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 rounded-lg py-1.5 font-medium transition-colors sm:flex-none',
            compact ? 'px-2 text-xs sm:px-3 sm:text-sm' : 'px-3 text-sm',
            value === o.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600',
          checked ? 'bg-teal-700 dark:bg-teal-500' : 'bg-slate-300 dark:bg-slate-700',
        )}
      >
        <span className={cx('absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </label>
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-xl border px-3 py-2.5 text-sm',
        tone === 'info' && 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
        tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
        tone === 'bad' && 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200',
        tone === 'good' && 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
      )}
    >
      {children}
    </div>
  )
}
