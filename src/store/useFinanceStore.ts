/**
 * Financial data (accounts, transactions...) in memory, saved to IndexedDB
 * after every change. Kept separate from the budget profile store because it
 * is much larger and lives in IndexedDB rather than localStorage.
 */
import { create } from 'zustand'
import { clearFinance, loadFinance, saveFinance } from '../finance/db'
import { linkTransfers, recategorize, type CategoryChoice } from '../finance/edit'
import { applyImport, undoImport, type PreparedImport } from '../finance/importer'
import { EMPTY_FINANCE, type Account, type FinanceData } from '../finance/types'

interface FinanceState {
  data: FinanceData
  loaded: boolean
  /** Problem loading or saving, shown on the Accounts page. */
  error: string | null
  load: () => Promise<void>
  addAccount: (a: Account) => void
  updateAccount: (id: string, patch: Partial<Account>) => void
  removeAccount: (id: string) => void
  importPrepared: (p: PreparedImport, account: Account) => void
  undoImport: (importId: string) => void
  recategorize: (txnId: string, choice: CategoryChoice, remember: boolean) => void
  replaceAll: (data: FinanceData) => void
  clearAll: () => Promise<void>
}

export const useFinanceStore = create<FinanceState>()((set, get) => {
  const commit = (data: FinanceData) => {
    set({ data })
    void saveFinance(data).then((ok) => {
      if (!ok) set({ error: "Couldn't save to this browser's storage. Your changes will last until you close the page." })
    })
  }
  return {
    data: structuredClone(EMPTY_FINANCE),
    loaded: false,
    error: null,
    load: async () => {
      if (get().loaded) return
      const { data, error } = await loadFinance()
      set({ data, loaded: true, error: error ?? null })
    },
    addAccount: (a) => commit({ ...get().data, accounts: [...get().data.accounts, a] }),
    updateAccount: (id, patch) => commit({ ...get().data, accounts: get().data.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }),
    removeAccount: (id) => {
      const d = get().data
      commit({
        ...d,
        accounts: d.accounts.filter((a) => a.id !== id),
        transactions: d.transactions.filter((t) => t.accountId !== id),
        balances: d.balances.filter((b) => b.accountId !== id),
        imports: d.imports.filter((i) => i.accountId !== id),
      })
    },
    importPrepared: (p, account) => {
      let d = get().data
      if (!d.accounts.some((a) => a.id === account.id)) d = { ...d, accounts: [...d.accounts, account] }
      commit(linkTransfers(applyImport(d, p)))
    },
    undoImport: (importId) => commit(undoImport(get().data, importId)),
    recategorize: (txnId, choice, remember) => commit(recategorize(get().data, txnId, choice, remember)),
    replaceAll: (data) => commit(data),
    clearAll: async () => {
      await clearFinance()
      set({ data: structuredClone(EMPTY_FINANCE) })
    },
  }
})
