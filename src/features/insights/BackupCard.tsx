import { useRef, useState } from 'react'
import { Button, Card, Field, Notice, TextInput } from '../../components/ui'
import { BackupError, createBackup, readBackup, type BackupPayload } from '../../finance/backup'
import { useBudgetStore } from '../../store/useBudgetStore'
import { useFinanceStore } from '../../store/useFinanceStore'

/** Save an encrypted backup of everything, or restore one (e.g. on a new phone). */
export function BackupCard() {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'save' | 'restore' | null>(null)
  const [msg, setMsg] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null)
  const [pending, setPending] = useState<BackupPayload | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const profile = useBudgetStore((s) => s.profile)
  const update = useBudgetStore((s) => s.update)
  const finance = useFinanceStore((s) => s.data)
  const replaceAll = useFinanceStore((s) => s.replaceAll)

  async function save() {
    setBusy('save')
    setMsg(null)
    try {
      const text = await createBackup({ profile, finance }, password)
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `take-home-budget-backup-${new Date().toISOString().slice(0, 10)}.thb`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMsg({ tone: 'good', text: 'Backup saved. Keep the password somewhere safe: without it the file cannot be opened.' })
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : "The backup couldn't be created." })
    } finally {
      setBusy(null)
    }
  }

  async function open(file: File | undefined) {
    if (!file) return
    setBusy('restore')
    setMsg(null)
    try {
      setPending(await readBackup(await file.text(), password))
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof BackupError ? e.message : "That file couldn't be read." })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title="Backup & restore">
      <div className="grid gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Your data lives only in this browser. Save an encrypted backup file (budget plan, accounts and transactions) to move to another device or keep a copy. It's
          encrypted on this device with your password (AES-256).
        </p>
        <Field label="Backup password" hint="At least 8 characters. It isn't stored anywhere and can't be recovered.">
          {(id, d) => <TextInput id={id} aria-describedby={d} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <input ref={fileRef} type="file" accept=".thb,application/json" className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { void open(e.target.files?.[0]); e.target.value = '' }} />
        {pending ? (
          <Notice tone="warn">
            <p>
              Restore this backup? It has {pending.finance.accounts.length} account{pending.finance.accounts.length === 1 ? '' : 's'} and {pending.finance.transactions.length} transactions. It
              <strong> replaces</strong> everything currently in this browser.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={() => {
                update((p) => Object.assign(p, pending.profile))
                replaceAll(pending.finance)
                setPending(null)
                setMsg({ tone: 'good', text: 'Backup restored.' })
              }}>Replace with backup</Button>
            </div>
          </Notice>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={password.length < 8 || busy !== null} onClick={() => void save()}>{busy === 'save' ? 'Encrypting…' : 'Back up'}</Button>
            <Button disabled={password.length < 8 || busy !== null} onClick={() => fileRef.current?.click()}>{busy === 'restore' ? 'Decrypting…' : 'Restore from backup'}</Button>
          </div>
        )}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      </div>
    </Card>
  )
}
