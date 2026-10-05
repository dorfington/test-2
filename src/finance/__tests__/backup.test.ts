// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../../model/profile'
import { BackupError, createBackup, readBackup } from '../backup'
import { clearFinance, loadFinance, saveFinance } from '../db'
import { EMPTY_FINANCE, type FinanceData } from '../types'

const finance: FinanceData = {
  ...structuredClone(EMPTY_FINANCE),
  accounts: [{ id: 'a', name: 'Checking', kind: 'checking', last4: '1234', goal: null, createdAt: '2026-10-01' }],
  transactions: [{ id: 't', accountId: 'a', date: '2026-09-30', description: 'NETFLIX.COM', payee: 'Netflix', amount: -15.49, type: 'expense', category: 'wants', kind: 'subscriptions', categorizedBy: 'auto', importId: 'i' }],
}
const payload = { profile: { ...structuredClone(DEFAULT_PROFILE), income: { ...DEFAULT_PROFILE.income, annualSalary: 85_000 } }, finance }
const fast = { iterations: 100_000 }

describe('encrypted backup', () => {
  it('round-trips with the right password', async () => {
    const file = await createBackup(payload, 'correct horse', fast)
    const back = await readBackup(file, 'correct horse')
    expect(back.profile.income.annualSalary).toBe(85_000)
    expect(back.finance).toEqual(finance)
  })

  it('stores nothing readable: no merchant names, amounts or salary in the file', async () => {
    const file = await createBackup(payload, 'correct horse', fast)
    expect(file).not.toMatch(/NETFLIX|Netflix|15\.49|85000|Checking/)
    expect(JSON.parse(file)).toMatchObject({ app: 'take-home-budget', cipher: 'AES-GCM', kdf: { name: 'PBKDF2', iterations: 100_000 } })
  })

  it('uses a fresh salt and IV every time', async () => {
    const a = JSON.parse(await createBackup(payload, 'correct horse', fast))
    const b = JSON.parse(await createBackup(payload, 'correct horse', fast))
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
  })

  it('rejects a wrong password, a tampered file and non-backup files', async () => {
    const file = await createBackup(payload, 'correct horse', fast)
    await expect(readBackup(file, 'wrong horse')).rejects.toThrow(BackupError)
    const t = JSON.parse(file)
    const bytes = Uint8Array.from(atob(t.data), (c) => c.charCodeAt(0))
    bytes[10] ^= 1
    t.data = btoa(String.fromCharCode(...bytes))
    await expect(readBackup(JSON.stringify(t), 'correct horse')).rejects.toThrow(/Wrong password, or the file was changed/)
    await expect(readBackup('{"hello":1}', 'x')).rejects.toThrow(/isn't a Take-Home Budget backup/)
  })

  it('requires a password of 8+ characters and the default strength', async () => {
    await expect(createBackup(payload, 'short')).rejects.toThrow(/8 characters/)
    const { BACKUP_ITERATIONS } = await import('../backup')
    expect(BACKUP_ITERATIONS).toBeGreaterThanOrEqual(600_000)
  })
})

describe('IndexedDB storage', () => {
  it('saves, loads and clears', async () => {
    expect((await loadFinance()).data).toEqual(EMPTY_FINANCE)
    expect(await saveFinance(finance)).toBe(true)
    expect((await loadFinance()).data).toEqual(finance)
    await clearFinance()
    expect((await loadFinance()).data).toEqual(EMPTY_FINANCE)
  })

  it('ignores invalid stored data instead of crashing', async () => {
    await saveFinance({ ...finance, transactions: [{ broken: true }] } as never)
    const r = await loadFinance()
    expect(r.data).toEqual(EMPTY_FINANCE)
    expect(r.error).toMatch(/could not be read/)
    await clearFinance()
  })
})
