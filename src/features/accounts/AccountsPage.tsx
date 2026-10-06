import { useMemo, useState } from 'react'
import { Button, Card, Notice, Select, TextInput } from '../../components/ui'
import { cx } from '../../lib/cx'
import { money, money0 } from '../../lib/format'
import { latestBalance } from '../../finance/analysis'
import { ACCOUNT_KIND_LABELS, type Account } from '../../finance/types'
import { useFinanceStore } from '../../store/useFinanceStore'
import { CATEGORY_OPTIONS, categoryLabel, choiceFromValue, choiceValue } from './categoryOptions'
import { UploadArea } from './UploadArea'

export function AccountsPage() {
  const loaded = useFinanceStore((s) => s.loaded)
  const error = useFinanceStore((s) => s.error)
  const data = useFinanceStore((s) => s.data)
  if (!loaded) return <p role="status" className="py-12 text-center text-sm text-slate-500">Loading your accounts…</p>
  return (
    <div className="grid gap-4">
      {error && <Notice tone="warn">{error}</Notice>}
      <p className="text-sm text-slate-600 dark:text-slate-300">
        🔒 Statements are read on this device and stored only in this browser. Account numbers aren't kept (at most the last 4 digits). Use{' '}
        <strong>Back up</strong> on the Insights tab to save an encrypted copy.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <UploadArea area="bank" />
        <UploadArea area="card" />
      </div>
      {data.accounts.length > 0 && (
        <>
          <AccountList />
          <TransactionList />
          <ImportHistory />
        </>
      )}
    </div>
  )
}

const GOAL_LABELS = { none: 'No goal', emergencyFund: 'Goal: emergency fund', savings: 'Goal: savings', debt: 'Goal: pay off this card' } as const

function AccountList() {
  const data = useFinanceStore((s) => s.data)
  const updateAccount = useFinanceStore((s) => s.updateAccount)
  const removeAccount = useFinanceStore((s) => s.removeAccount)
  return (
    <Card title="Your accounts">
      <ul className="grid gap-3">
        {data.accounts.map((a) => {
          const bal = latestBalance(data, a.id)
          const count = data.transactions.filter((t) => t.accountId === a.id).length
          const goalOptions = (a.kind === 'credit' ? (['none', 'debt'] as const) : (['none', 'emergencyFund', 'savings'] as const)).map((g) => ({ value: g, label: GOAL_LABELS[g] }))
          return (
            <li key={a.id} className="grid gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto_16rem_auto] sm:items-center dark:border-slate-800">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{a.name}{a.last4 ? <span className="text-slate-500"> ··{a.last4}</span> : null}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{ACCOUNT_KIND_LABELS[a.kind]} · {count} transactions</p>
              </div>
              <p className="text-sm tabular-nums text-slate-800 dark:text-slate-200">
                {bal ? <>{a.kind === 'credit' ? 'Owed ' : 'Balance '}<strong>{money0(Math.abs(bal.balance))}</strong> <span className="text-xs text-slate-500">({bal.date})</span></> : <span className="text-xs text-slate-500">No balance in files yet</span>}
              </p>
              <Select ariaLabel={`Goal for ${a.name}`} value={a.goal ?? 'none'} options={goalOptions}
                onChange={(v) => updateAccount(a.id, { goal: v === 'none' ? null : (v as Account['goal']) })} />
              <Button size="sm" variant="danger" onClick={() => {
                if (window.confirm(`Remove ${a.name} and its ${count} transactions from this device?`)) removeAccount(a.id)
              }}>Remove</Button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

const PAGE = 50

function TransactionList() {
  const data = useFinanceStore((s) => s.data)
  const recategorize = useFinanceStore((s) => s.recategorize)
  const [query, setQuery] = useState('')
  const [account, setAccount] = useState('all')
  const [month, setMonth] = useState('all')
  const [cat, setCat] = useState('all')
  const [shown, setShown] = useState(PAGE)
  const [remember, setRemember] = useState(true)

  const months = useMemo(() => [...new Set(data.transactions.map((t) => t.date.slice(0, 7)))].sort().reverse(), [data.transactions])
  const accountName = useMemo(() => new Map(data.accounts.map((a) => [a.id, a.name])), [data.accounts])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.transactions.filter(
      (t) =>
        (account === 'all' || t.accountId === account) &&
        (month === 'all' || t.date.startsWith(month)) &&
        (cat === 'all' || choiceValue(t) === cat) &&
        (!q || t.payee.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    )
  }, [data.transactions, query, account, month, cat])
  const uncategorized = data.transactions.filter((t) => t.type === 'expense' && !t.kind).length

  return (
    <Card title="Transactions">
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <TextInput aria-label="Search transactions" placeholder="Search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE) }} />
          <Select ariaLabel="Account" value={account} onChange={(v) => { setAccount(v); setShown(PAGE) }}
            options={[{ value: 'all', label: 'All accounts' }, ...data.accounts.map((a) => ({ value: a.id, label: a.name }))]} />
          <Select ariaLabel="Month" value={month} onChange={(v) => { setMonth(v); setShown(PAGE) }}
            options={[{ value: 'all', label: 'All months' }, ...months.map((m) => ({ value: m, label: new Date(m + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }))]} />
          <Select ariaLabel="Category" value={cat} onChange={(v) => { setCat(v); setShown(PAGE) }}
            options={[{ value: 'all', label: 'All categories' }, ...CATEGORY_OPTIONS]} />
        </div>
        {uncategorized > 0 && cat !== 'uncategorized' && (
          <Notice tone="info">
            {uncategorized} transaction{uncategorized > 1 ? 's need' : ' needs'} a category.{' '}
            <button type="button" className="font-medium underline" onClick={() => setCat('uncategorized')}>Show them</button>
          </Notice>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-teal-700 dark:accent-teal-400" />
          When I change a category, use it for every transaction from that merchant (now and in future imports)
        </label>
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No transactions match.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.slice(0, shown).map((t) => (
              <li key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-2 sm:grid-cols-[6rem_1fr_15rem_7rem]">
                <span className="hidden text-xs tabular-nums text-slate-500 sm:block dark:text-slate-400">{t.date}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-900 dark:text-slate-100" title={t.description}>{t.payee}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    <span className="sm:hidden">{t.date} · </span>{accountName.get(t.accountId)}
                    {t.categorizedBy !== 'auto' && <> · {t.categorizedBy === 'user' ? 'set by you' : 'your rule'}</>}
                  </span>
                </span>
                <span className={cx('text-right text-sm tabular-nums font-medium sm:order-last', t.amount > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200', t.type === 'transfer' && 'opacity-60')}>
                  {t.amount < 0 ? '−' : '+'}{money(Math.abs(t.amount), true)}
                </span>
                <div className="col-span-2 sm:col-span-1">
                  <Select ariaLabel={`Category for ${t.payee} on ${t.date}`} value={choiceValue(t)} options={CATEGORY_OPTIONS}
                    className={cx('py-1.5', choiceValue(t) === 'uncategorized' && 'border-amber-400 dark:border-amber-600')}
                    onChange={(v) => recategorize(t.id, choiceFromValue(v, t.amount), remember)} />
                  <span className="sr-only">{categoryLabel(t)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {filtered.length > shown && (
          <Button onClick={() => setShown((n) => n + PAGE)}>Show more ({filtered.length - shown} left)</Button>
        )}
      </div>
    </Card>
  )
}

function ImportHistory() {
  const data = useFinanceStore((s) => s.data)
  const undo = useFinanceStore((s) => s.undoImport)
  const name = new Map(data.accounts.map((a) => [a.id, a.name]))
  const imports = [...data.imports].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))
  if (!imports.length) return null
  return (
    <Card title="Imported files">
      <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
        {imports.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate text-slate-900 dark:text-slate-100">{i.fileName}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {name.get(i.accountId)} · {i.added} added{i.skipped ? `, ${i.skipped} duplicates skipped` : ''} · {i.firstDate} → {i.lastDate}
              </span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => {
              if (window.confirm(`Remove the ${i.added} transactions imported from ${i.fileName}?`)) undo(i.id)
            }}>Undo</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
