import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { DEFAULT_PROFILE, ProfileSchema, makeExpense, STARTER_EXPENSE_KINDS, type Expense, type Profile } from '../model/profile'
import type { WhatIf } from '../model/derive'

export type Step = 'income' | 'taxes' | 'expenses' | 'results'
export const STEPS: Step[] = ['income', 'taxes', 'expenses', 'results']
export type Theme = 'system' | 'light' | 'dark'
export type View = 'budget' | 'accounts' | 'insights'
export const VIEWS: View[] = ['budget', 'accounts', 'insights']

interface BudgetState {
  profile: Profile
  step: Step
  /** True once the user has reached results; unlocks jumping to any step. */
  completed: boolean
  theme: Theme
  /** Top-level tab. */
  view: View
  setView: (v: View) => void
  /** Unsaved "what if" slider values. */
  whatIf: WhatIf
  setStep: (s: Step) => void
  update: (fn: (p: Profile) => void) => void
  addExpense: (e: Expense) => void
  updateExpense: (id: string, patch: Partial<Expense>) => void
  removeExpense: (id: string) => void
  setWhatIf: (w: WhatIf) => void
  setTheme: (t: Theme) => void
  complete: () => void
  reset: () => void
}

/** localStorage that never throws (private mode, blocked storage, quota). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* not persisted; the app still works for this session */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

const freshProfile = (): Profile => ({
  ...structuredClone(DEFAULT_PROFILE),
  expenses: STARTER_EXPENSE_KINDS.map((k) => makeExpense(k)),
})

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      profile: freshProfile(),
      step: 'income',
      completed: false,
      theme: 'system',
      view: 'budget',
      setView: (view) => set({ view }),
      whatIf: {},
      setStep: (step) => set({ step }),
      update: (fn) =>
        set((s) => {
          const profile = structuredClone(s.profile)
          fn(profile)
          return { profile }
        }),
      addExpense: (e) => set((s) => ({ profile: { ...s.profile, expenses: [...s.profile.expenses, e] } })),
      updateExpense: (id, patch) =>
        set((s) => ({
          profile: { ...s.profile, expenses: s.profile.expenses.map((x) => (x.id === id ? { ...x, ...patch } : x)) },
        })),
      removeExpense: (id) =>
        set((s) => ({ profile: { ...s.profile, expenses: s.profile.expenses.filter((x) => x.id !== id) } })),
      setWhatIf: (whatIf) => set({ whatIf }),
      setTheme: (theme) => set({ theme }),
      complete: () => set({ completed: true, step: 'results' }),
      reset: () => set({ profile: freshProfile(), step: 'income', completed: false, whatIf: {} }),
    }),
    {
      name: 'take-home-budget',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ profile: s.profile, step: s.step, completed: s.completed, theme: s.theme, view: s.view }),
      // Validate whatever was stored; fall back to defaults field-by-field rather than crash.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<BudgetState>
        const parsed = ProfileSchema.safeParse(p.profile)
        return {
          ...current,
          profile: parsed.success ? parsed.data : current.profile,
          step: parsed.success && p.step && (STEPS as string[]).includes(p.step) ? p.step : current.step,
          completed: parsed.success && p.completed === true,
          theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : current.theme,
          view: p.view && VIEWS.includes(p.view) ? p.view : current.view,
        }
      },
    },
  ),
)
