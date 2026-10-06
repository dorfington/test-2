/**
 * On-device storage for financial data (IndexedDB). Nothing here talks to a
 * server. The whole data set is small enough (thousands of rows) to load into
 * memory and save as one record, which keeps writes atomic.
 */
import { openDB, type IDBPDatabase } from 'idb'
import { EMPTY_FINANCE, FinanceDataSchema, type FinanceData } from './types'

const DB_NAME = 'take-home-budget'
const STORE = 'finance'
const KEY = 'data'

let dbPromise: Promise<IDBPDatabase> | null = null
const db = () =>
  (dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE)
    },
  }))

/** Loads and validates stored data; returns empty data if there is none or it's unreadable. */
export async function loadFinance(): Promise<{ data: FinanceData; error?: string }> {
  try {
    const raw = await (await db()).get(STORE, KEY)
    if (raw === undefined) return { data: structuredClone(EMPTY_FINANCE) }
    const parsed = FinanceDataSchema.safeParse(raw)
    if (parsed.success) return { data: parsed.data }
    return { data: structuredClone(EMPTY_FINANCE), error: 'Saved account data could not be read and was not loaded.' }
  } catch {
    return { data: structuredClone(EMPTY_FINANCE), error: "This browser doesn't allow saving account data (private browsing?). Imports will last until you close the page." }
  }
}

export async function saveFinance(data: FinanceData): Promise<boolean> {
  try {
    await (await db()).put(STORE, data, KEY)
    return true
  } catch {
    return false
  }
}

export async function clearFinance(): Promise<void> {
  try {
    await (await db()).delete(STORE, KEY)
  } catch {
    /* nothing stored */
  }
}
