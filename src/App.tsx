import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { Button, Segmented } from './components/ui'
import { SetupFlow } from './features/setup/SetupFlow'
import { cx } from './lib/cx'
import { useBudgetStore, type Theme, type View } from './store/useBudgetStore'
import { useFinanceStore } from './store/useFinanceStore'

// Statement tools load only when those tabs are opened.
const AccountsPage = lazy(() => import('./features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const InsightsPage = lazy(() => import('./features/insights/InsightsPage').then((m) => ({ default: m.InsightsPage })))

const TABS: { id: View; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'insights', label: 'Insights' },
]

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function useResolvedDark(theme: Theme) {
  const systemDark = useSyncExternalStore(
    (cb) => {
      const q = darkQuery()
      q.addEventListener('change', cb)
      return () => q.removeEventListener('change', cb)
    },
    () => darkQuery().matches,
    () => false,
  )
  return theme === 'dark' || (theme === 'system' && systemDark)
}

export default function App() {
  const theme = useBudgetStore((s) => s.theme)
  const setTheme = useBudgetStore((s) => s.setTheme)
  const reset = useBudgetStore((s) => s.reset)
  const view = useBudgetStore((s) => s.view)
  const setView = useBudgetStore((s) => s.setView)
  const loadFinance = useFinanceStore((s) => s.load)
  const clearFinance = useFinanceStore((s) => s.clearAll)
  const dark = useResolvedDark(theme)

  useEffect(() => {
    void loadFinance()
  }, [loadFinance])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Take-Home Budget</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Your pay after taxes, and where every dollar goes</p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented<Theme>
              label="Color theme"
              compact
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
            <Button
              size="sm"
              variant="ghost"
              className="whitespace-nowrap"
              onClick={() => {
                if (window.confirm('Delete everything stored in this browser (your budget plan, accounts and transactions) and start over?')) {
                  reset()
                  void clearFinance()
                }
              }}
            >
              Start over
            </Button>
          </div>
        </div>
      </header>

      <nav aria-label="Sections" className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl gap-1 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={view === t.id ? 'page' : undefined}
              onClick={() => setView(t.id)}
              className={cx(
                '-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                view === t.id
                  ? 'border-teal-700 text-teal-800 dark:border-teal-400 dark:text-teal-300'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {view === 'budget' && <SetupFlow />}
        <Suspense fallback={<p role="status" className="py-12 text-center text-sm text-slate-500">Loading…</p>}>
          {view === 'accounts' && <AccountsPage />}
          {view === 'insights' && <InsightsPage goToAccounts={() => setView('accounts')} />}
        </Suspense>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-slate-500 dark:text-slate-400">
        <p>
          <strong className="font-semibold">Tax figures are estimates, not tax advice.</strong> They use published federal, state and local
          rates for the selected year and simplify some rules; your actual withholding and tax bill will differ.
        </p>
        <p className="mt-2">
          <strong className="font-semibold">Private by design:</strong> no accounts, no tracking or analytics. Everything you enter is saved only in
          this browser on this device and is never sent anywhere. Pay stubs and bank or card statements are read on your device and never uploaded.
        </p>
      </footer>
    </div>
  )
}
