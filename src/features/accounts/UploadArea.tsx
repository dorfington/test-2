import { useRef, useState } from 'react'
import { Button, Card, Field, Notice, Select, TextInput } from '../../components/ui'
import { cx } from '../../lib/cx'
import { money } from '../../lib/format'
import { newId } from '../../model/profile'
import { prepareImport } from '../../finance/importer'
import { ACCOUNT_KIND_LABELS, type Account, type AccountKind, type ParsedStatement } from '../../finance/types'
import { useFinanceStore } from '../../store/useFinanceStore'
import { categoryLabel } from './categoryOptions'

type Area = 'bank' | 'card'
const NEW = '__new__'

interface Pending {
  file: File
  parsed: ParsedStatement
}

/** Upload area for one kind of statement, with a preview before anything is saved. */
export function UploadArea({ area }: { area: Area }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null)
  const accounts = useFinanceStore((s) => s.data.accounts).filter((a) => (area === 'card' ? a.kind === 'credit' : a.kind !== 'credit'))

  async function pick(files: File[]) {
    if (!files.length) return
    setBusy(true)
    setMessage(null)
    const { readStatementFile } = await import('../../finance/readFile')
    const read: Pending[] = []
    for (const file of files) {
      try {
        read.push({ file, parsed: await readStatementFile(file, area === 'card' ? 'credit' : 'checking') })
      } catch {
        read.push({ file, parsed: { format: 'csv', transactions: [], signsInferred: false, warnings: [`${file.name} couldn't be read.`] } })
      }
    }
    setQueue(read)
    setBusy(false)
  }

  const current = queue[0]
  return (
    <Card title={area === 'bank' ? 'Bank statements' : 'Credit card statements'}>
      <input ref={inputRef} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden
        accept=".csv,.ofx,.qfx,.qbo,.pdf,text/csv,application/pdf,application/x-ofx"
        onChange={(e) => {
          // Copy the files before clearing the input: FileList is live and empties when value is reset.
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void pick(files)
        }} />
      {current ? (
        <ImportPreview
          key={current.file.name + queue.length}
          area={area}
          pending={current}
          remaining={queue.length - 1}
          onDone={(text) => {
            if (text) setMessage({ tone: 'good', text })
            setQueue((q) => q.slice(1))
          }}
        />
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {area === 'bank' ? 'Checking and savings accounts.' : 'Credit cards.'} Download your transactions from your {area === 'bank' ? "bank's" : "card issuer's"} website as{' '}
            <strong>CSV</strong> or <strong>OFX/QFX</strong> (most accurate), or upload a <strong>PDF statement</strong>. You can pick several files; duplicates are skipped.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? 'Reading…' : 'Upload statements'}
            </Button>
            {accounts.length > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">{accounts.length} account{accounts.length > 1 ? 's' : ''} added</span>}
          </div>
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      )}
    </Card>
  )
}

function ImportPreview({ area, pending, remaining, onDone }: { area: Area; pending: Pending; remaining: number; onDone: (msg: string | null) => void }) {
  const { file, parsed } = pending
  const data = useFinanceStore((s) => s.data)
  const importPrepared = useFinanceStore((s) => s.importPrepared)
  const candidates = data.accounts.filter((a) => (area === 'card' ? a.kind === 'credit' : a.kind !== 'credit'))
  const byLast4 = parsed.last4 ? candidates.find((a) => a.last4 === parsed.last4) : undefined
  const [accountId, setAccountId] = useState<string>(byLast4?.id ?? candidates[0]?.id ?? NEW)
  const defaultKind: AccountKind = area === 'card' ? 'credit' : parsed.suggestedKind === 'savings' ? 'savings' : 'checking'
  const [newName, setNewName] = useState(defaultName(file.name, parsed.last4, defaultKind))
  const [newKind, setNewKind] = useState<AccountKind>(defaultKind)
  const [flip, setFlip] = useState(false)
  const [ids] = useState(() => ({ importId: `imp-${newId()}`, accountId: `acct-${newId()}`, createdAt: new Date().toISOString() }))

  const account: Account =
    accountId === NEW
      ? { id: ids.accountId, name: newName.trim() || 'My account', kind: newKind, last4: parsed.last4 ?? null, goal: null, createdAt: ids.createdAt }
      : candidates.find((a) => a.id === accountId)!
  const prepared = prepareImport(parsed, account, data, { fileName: file.name, flipSigns: flip, importId: ids.importId })
  const rows = prepared.transactions
  const out = rows.filter((t) => t.amount < 0)
  const inn = rows.filter((t) => t.amount > 0)
  const sample = [...rows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 6)
  const nothing = parsed.transactions.length === 0

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{file.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {parsed.format.toUpperCase()}
          {remaining > 0 ? ` · ${remaining} more file${remaining > 1 ? 's' : ''} after this` : ''}
        </p>
      </div>
      {parsed.warnings.map((w) => (
        <Notice key={w} tone={nothing ? 'warn' : 'info'}>{w}</Notice>
      ))}

      {!nothing && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Account">
              {(id) => (
                <Select id={id} value={accountId} onChange={setAccountId}
                  options={[...candidates.map((a) => ({ value: a.id, label: `${a.name}${a.last4 ? ` ··${a.last4}` : ''}` })), { value: NEW, label: '+ New account' }]} />
              )}
            </Field>
            {accountId === NEW && (
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Field label="Name">{(id) => <TextInput id={id} value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />}</Field>
                {area === 'bank' && (
                  <Field label="Type">
                    {(id) => (
                      <Select<AccountKind> id={id} value={newKind} onChange={setNewKind}
                        options={(['checking', 'savings', 'other'] as AccountKind[]).map((k) => ({ value: k, label: ACCOUNT_KIND_LABELS[k] }))} />
                    )}
                  </Field>
                )}
              </div>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-sm dark:bg-slate-800/60">
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">New</dt><dd className="font-semibold tabular-nums">{rows.length}</dd></div>
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">Already imported</dt><dd className="font-semibold tabular-nums">{prepared.skipped}</dd></div>
            <div><dt className="text-xs text-slate-500 dark:text-slate-400">Dates</dt><dd className="font-semibold tabular-nums">{prepared.record.firstDate?.slice(5) ?? '–'} → {prepared.record.lastDate?.slice(5) ?? '–'}</dd></div>
          </dl>

          {rows.length > 0 && (
            <div className="grid gap-2">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <strong>Check the direction:</strong> {area === 'card' ? 'purchases' : 'bills and purchases'} should be <strong>money out (−)</strong> and{' '}
                {area === 'card' ? 'payments and refunds' : 'paychecks and deposits'} <strong>money in (+)</strong>. {out.length} out, {inn.length} in.
              </p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
                {sample.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-slate-900 dark:text-slate-100">{t.payee}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{t.date} · {categoryLabel(t)}</span>
                    </span>
                    <span className={cx('shrink-0 tabular-nums font-medium', t.amount < 0 ? 'text-slate-800 dark:text-slate-200' : 'text-emerald-700 dark:text-emerald-400')}>
                      {t.amount < 0 ? '−' : '+'}{money(Math.abs(t.amount), true)}
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <Button size="sm" onClick={() => setFlip((f) => !f)}>{flip ? 'Undo flip' : 'Signs look backwards? Flip them'}</Button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => onDone(null)}>{nothing ? 'Close' : 'Skip this file'}</Button>
        {!nothing && (
          <Button variant="primary" disabled={rows.length === 0 && !prepared.balance} onClick={() => {
            importPrepared(prepared, account)
            onDone(`Imported ${rows.length} transaction${rows.length === 1 ? '' : 's'} into ${account.name}${prepared.skipped ? ` (${prepared.skipped} already there)` : ''}.`)
          }}>
            {rows.length ? `Import ${rows.length}` : 'Nothing new'}
          </Button>
        )}
      </div>
    </div>
  )
}

function defaultName(fileName: string, last4: string | undefined, kind: AccountKind): string {
  const known = fileName.match(/chase|amex|american express|capital ?one|discover|citi|wells|bofa|bank of america|apple|ally|usaa|schwab|sofi|marcus/i)?.[0]
  const brand = known ? known.replace(/\b\w/g, (c) => c.toUpperCase()) : ''
  return [brand, ACCOUNT_KIND_LABELS[kind].toLowerCase(), last4 ? `··${last4}` : ''].filter(Boolean).join(' ').replace(/^\w/, (c) => c.toUpperCase())
}
