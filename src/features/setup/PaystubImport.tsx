import { useRef, useState, type ReactNode } from 'react'
import { Button, Card, Notice, NumberInput, Segmented, Select } from '../../components/ui'
import { cx } from '../../lib/cx'
import { money } from '../../lib/format'
import { PAY_FREQUENCIES, PAY_FREQUENCY_LABELS, type PayFrequency } from '../../model/profile'
import { applyStub, reviewAnnualGross, reviewFromStub, type ReviewField, type StubReview } from '../../paystub/apply'
import type { Progress } from '../../paystub/extract'
import { parsePaystub } from '../../paystub/parse'
import { useBudgetStore } from '../../store/useBudgetStore'
import { getTaxYear, STATE_CODES, type FilingStatus, type StateCode } from '../../taxdata'

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; progress: Progress }
  | { kind: 'review'; review: StubReview; method: 'pdf-text' | 'ocr' }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string }

const STATUS_LABELS: Record<FilingStatus, string> = { single: 'Single', married: 'Married filing jointly', headOfHousehold: 'Head of household' }

/** "Start from a pay stub": photo or PDF -> on-device text -> parsed values -> user review -> profile. */
export function PaystubImport() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const update = useBudgetStore((s) => s.update)

  async function read(file: File | undefined) {
    if (!file) return
    setPhase({ kind: 'reading', progress: { stage: 'Starting' } })
    try {
      const { extractText } = await import('../../paystub/extract')
      const { text, method } = await extractText(file, (progress) => setPhase({ kind: 'reading', progress }))
      const data = parsePaystub(text)
      if (data.matchedLines < 2) {
        setPhase({
          kind: 'error',
          message:
            method === 'ocr'
              ? "Couldn't find pay stub details in that photo. Try again with the stub flat, in good light, filling the frame, or use the PDF from your payroll site."
              : "Couldn't find pay stub details in that PDF. Make sure it's an earnings statement.",
        })
        return
      }
      setPhase({ kind: 'review', review: reviewFromStub(data), method })
    } catch (e) {
      const loadFailed = e instanceof Error && /load|fetch|network|importScripts|worker/i.test(e.message + String(e))
      setPhase({
        kind: 'error',
        message: loadFailed
          ? "The pay stub reader didn't finish loading. Check your connection and try again."
          : "That file couldn't be read. Try a JPG/PNG photo or a PDF.",
      })
    }
  }

  const picker = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { void read(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => { void read(e.target.files?.[0]); e.target.value = '' }} />
    </>
  )

  return (
    <Card title="Start from a pay stub (optional)">
      {picker}
      {phase.kind === 'reading' ? (
        <div role="status" aria-live="polite" className="grid gap-2">
          <p className="text-sm text-slate-700 dark:text-slate-300">{phase.progress.stage}…</p>
          <div className="h-2 overflow-hidden rounded-full bg-(--c-track)">
            <div
              className={cx('h-full rounded-full bg-teal-700 transition-[width] dark:bg-teal-400', phase.progress.fraction === undefined && 'w-1/3 animate-pulse')}
              style={phase.progress.fraction !== undefined ? { width: `${Math.round(phase.progress.fraction * 100)}%` } : undefined}
            />
          </div>
        </div>
      ) : phase.kind === 'review' ? (
        <Review
          review={phase.review}
          method={phase.method}
          onChange={(review) => setPhase({ ...phase, review })}
          onCancel={() => setPhase({ kind: 'idle' })}
          onApply={() => {
            const r = phase.review
            update((p) => Object.assign(p, applyStub(p, r)))
            const count = Object.values(r).filter((v) => v && typeof v === 'object' && 'use' in v && (v as ReviewField<unknown>).use).length
            setPhase({ kind: 'done', count })
          }}
        />
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Snap a photo or upload the PDF of a recent pay stub to fill in your pay, deductions, state and the tax your employer withholds. You'll
            check every value before it's used.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => cameraRef.current?.click()}>Take a photo</Button>
            <Button onClick={() => fileRef.current?.click()}>Upload photo or PDF</Button>
          </div>
          {phase.kind === 'done' && <Notice tone="good">Filled in {phase.count} values from your pay stub. Look over each step before you continue.</Notice>}
          {phase.kind === 'error' && <Notice tone="warn">{phase.message}</Notice>}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            🔒 Read on this device. Your pay stub is never uploaded or stored; only the numbers you confirm are saved, in this browser.
          </p>
        </div>
      )}
    </Card>
  )
}

function Review({ review: r, method, onChange, onCancel, onApply }: {
  review: StubReview
  method: 'pdf-text' | 'ocr'
  onChange: (r: StubReview) => void
  onCancel: () => void
  onApply: () => void
}) {
  const data = getTaxYear(useBudgetStore.getState().profile.taxes.year)
  const set = <K extends keyof StubReview>(key: K, patch: Partial<NonNullable<StubReview[K]>>) =>
    onChange({ ...r, [key]: { ...(r[key] as object), ...patch } })
  const annual = reviewAnnualGross(r)

  const money$ = (key: 'grossPerPaycheck' | 'netPerPaycheck' | 'hourlyRate' | 'retirementPerPaycheck' | 'healthPerPaycheck' | 'hsaPerPaycheck' | 'federalWithheld' | 'stateWithheld' | 'localWithheld', label: string, opts: { suffix?: string; prefix?: string } = { prefix: '$' }) => {
    const f = r[key]
    if (!f) return null
    return (
      <Row key={key} label={label} field={f} onUse={(use) => set(key, { use })}>
        <NumberInput ariaLabel={label} prefix={opts.prefix} suffix={opts.suffix} step={0.01} value={f.value} onChange={(value) => set(key, { value })} />
      </Row>
    )
  }

  const locality = r.localityId ? data.localities.find((l) => l.id === r.localityId!.value) : undefined
  const nothing = !r.grossPerPaycheck && !r.hourlyRate && !r.federalWithheld

  return (
    <div className="grid gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {method === 'ocr' ? 'Read from your photo. Photos can be misread, so compare each value with your stub.' : 'Read from your PDF.'} Uncheck
        anything you don't want to use.
      </p>
      {r.notes.map((n) => (
        <Notice key={n} tone="info">{n}</Notice>
      ))}

      <Section title="Pay">
        {r.payFrequency && (
          <Row label="Paid" field={r.payFrequency} onUse={(use) => set('payFrequency', { use })}>
            <Select<PayFrequency> ariaLabel="Pay frequency" value={r.payFrequency.value}
              onChange={(value) => set('payFrequency', { value })}
              options={PAY_FREQUENCIES.map((f) => ({ value: f, label: PAY_FREQUENCY_LABELS[f] }))} />
          </Row>
        )}
        {r.hourlyRate && (
          <Segmented label="Pay type" value={r.payType} onChange={(payType) => onChange({ ...r, payType })}
            options={[{ value: 'salary', label: 'Use as salary' }, { value: 'hourly', label: 'Use as hourly' }]} />
        )}
        {r.payType === 'hourly' && r.hourlyRate ? (
          <>
            {money$('hourlyRate', 'Hourly rate')}
            {r.hoursPerWeek && (
              <Row label="Hours per week" field={r.hoursPerWeek} onUse={(use) => set('hoursPerWeek', { use })}>
                <NumberInput ariaLabel="Hours per week" suffix="hrs" step={0.25} value={r.hoursPerWeek.value} onChange={(value) => set('hoursPerWeek', { value })} />
              </Row>
            )}
          </>
        ) : (
          money$('grossPerPaycheck', 'Gross pay per paycheck')
        )}
        {money$('netPerPaycheck', 'Take-home (net) pay')}
        {annual !== undefined && <p className="text-sm text-slate-700 dark:text-slate-300">= <strong className="tabular-nums">{money(annual, false)}</strong> a year before taxes</p>}
      </Section>

      {(r.retirementPerPaycheck || r.healthPerPaycheck || r.hsaPerPaycheck) && (
        <Section title="Pre-tax deductions (per paycheck)">
          {money$('retirementPerPaycheck', '401(k) / 403(b)')}
          {money$('healthPerPaycheck', 'Health, dental & vision')}
          {money$('hsaPerPaycheck', 'HSA / FSA')}
        </Section>
      )}

      {(r.state || r.filingStatus || locality) && (
        <Section title="Taxes">
          {r.filingStatus && (
            <Row label="Filing status" field={r.filingStatus} onUse={(use) => set('filingStatus', { use })}>
              <Select<FilingStatus> ariaLabel="Filing status" value={r.filingStatus.value} onChange={(value) => set('filingStatus', { value })}
                options={(Object.keys(STATUS_LABELS) as FilingStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
            </Row>
          )}
          {r.state && (
            <Row label="State" field={r.state} onUse={(use) => set('state', { use })}>
              <Select<StateCode> ariaLabel="State" value={r.state.value} onChange={(value) => set('state', { value })}
                options={STATE_CODES.map((c) => ({ value: c, label: data.states[c].name })).sort((a, b) => a.label.localeCompare(b.label))} />
            </Row>
          )}
          {r.localityId && locality && (
            <Row label="Local tax" field={r.localityId} onUse={(use) => set('localityId', { use })}>
              <p className="py-2 text-sm text-slate-800 dark:text-slate-200">{locality.name}</p>
            </Row>
          )}
        </Section>
      )}

      {(r.federalWithheld || r.stateWithheld || r.localWithheld) && (
        <Section title="Tax withheld this paycheck (for the withholding check)">
          {money$('federalWithheld', 'Federal income tax')}
          {money$('stateWithheld', 'State income tax')}
          {money$('localWithheld', 'Local income tax')}
        </Section>
      )}

      {nothing && <Notice tone="warn">No pay amounts were found. You can cancel and enter them yourself.</Notice>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onApply}>Use these values</Button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <legend className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</legend>
      {children}
    </fieldset>
  )
}

function Row<T>({ label, field, onUse, children }: { label: string; field: ReviewField<T>; onUse: (use: boolean) => void; children: ReactNode }) {
  return (
    <div className={cx('grid gap-1.5', !field.use && 'opacity-50')}>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[auto_12rem_1fr]">
        <input type="checkbox" checked={field.use} onChange={(e) => onUse(e.target.checked)} aria-label={`Use ${label}`}
          className="h-4 w-4 accent-teal-700 dark:accent-teal-400" />
        <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
        <div className="col-span-2 sm:col-span-1">{children}</div>
      </div>
      {field.source && (
        <p className="ml-7 truncate font-mono text-xs text-slate-500 dark:text-slate-400" title={field.source}>
          from: {field.source}
        </p>
      )}
    </div>
  )
}
