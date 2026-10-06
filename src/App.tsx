import { useEffect, useSyncExternalStore } from 'react'
import { Button, Segmented } from './components/ui'
import { SetupFlow } from './features/setup/SetupFlow'
import { useBudgetStore, type Theme } from './store/useBudgetStore'

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
  const dark = useResolvedDark(theme)

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
                if (window.confirm('Clear all your entries and start over?')) reset()
              }}
            >
              Start over
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <SetupFlow />
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-slate-500 dark:text-slate-400">
        <p>
          <strong className="font-semibold">Tax figures are estimates, not tax advice.</strong> They use published federal, state and local
          rates for the selected year and simplify some rules; your actual withholding and tax bill will differ.
        </p>
        <p className="mt-2">
          <strong className="font-semibold">Private by design:</strong> no accounts, no tracking or analytics. Everything you enter is saved only in
          this browser on this device and is never sent anywhere. Pay stubs are read on your device and never uploaded.
        </p>
      </footer>
    </div>
  )
}
