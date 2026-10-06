import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, makeExpense } from '../../model/profile'
import { actualVsBudget, applySuggestions, completeMonths, findRecurring, goalBalances, missingCardAccounts, monthlySummaries, suggestBudget } from '../analysis'
import { linkTransfers } from '../edit'
import { applyImport, parseStatementText, prepareImport } from '../importer'
import { EMPTY_FINANCE, type Account, type FinanceData } from '../types'

const acct = (id: string, kind: Account['kind'], goal: Account['goal'] = null): Account => ({ id, name: id, kind, last4: null, goal, createdAt: '2026-01-01' })

/** Three full months (Jul–Sep 2026) of a checking account and a card. */
function history(): FinanceData {
  const chk: string[] = ['Date,Description,Amount,Balance']
  const card: string[] = ['Date,Description,Amount']
  const months = ['07', '08', '09']
  months.forEach((m, i) => {
    chk.push(`${m}/01/2026,AVALON APARTMENTS RENT,-1800.00,`)
    chk.push(`${m}/02/2026,ACME CORP PAYROLL,2700.00,`)
    chk.push(`${m}/16/2026,ACME CORP PAYROLL,2700.00,`)
    chk.push(`${m}/18/2026,TO SAVINGS 4421,-500.00,`)
    chk.push(`${m}/25/2026,CHASE CREDIT CRD AUTOPAY,-600.00,`)
    chk.push(`${m}/28/2026,DUKE ENERGY,-${90 + i * 10}.00,${i === 2 ? '3500.00' : ''}`)
    card.push(`${m}/05/2026,NETFLIX.COM,-${i === 2 ? '17.99' : '15.49'}`)
    card.push(`${m}/09/2026,KROGER #123,-200.00`)
    card.push(`${m}/20/2026,KROGER #123,-150.00`)
    card.push(`${m}/12/2026,CHIPOTLE 2345,-25.00`)
    card.push(`${m}/25/2026,PAYMENT THANK YOU,600.00`)
    if (i < 2) card.push(`${m}/03/2026,PLANET FITNESS,-24.99`) // canceled after August
  })
  card.push('09/30/2026,KROGER #123,30.00') // refund
  let data: FinanceData = { ...structuredClone(EMPTY_FINANCE), accounts: [acct('chk', 'checking'), acct('card', 'credit', 'debt'), acct('sav', 'savings', 'emergencyFund')] }
  for (const [a, text] of [[data.accounts[0], chk.join('\n')], [data.accounts[1], card.join('\n')]] as const) {
    data = applyImport(data, prepareImport(parseStatementText(text, 'f.csv', a.kind), a, data, { fileName: 'f.csv', importId: a.id }))
  }
  data.balances.push({ accountId: 'sav', date: '2026-09-30', balance: 4200 }, { accountId: 'card', date: '2026-09-30', balance: -850 })
  return linkTransfers(data)
}

describe('monthly summaries', () => {
  const data = history()
  const s = monthlySummaries(data)
  it('detects complete months', () => {
    expect([...completeMonths(data.transactions)]).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(completeMonths([{ date: '2026-07-10' }, { date: '2026-09-20' }] as never)).toEqual(new Set(['2026-08']))
  })

  it('counts income, spending by bucket, savings; ignores card payments; nets refunds', () => {
    const sep = s.find((m) => m.month === '2026-09')!
    expect(sep.income).toBe(5400)
    // needs: rent 1800 + energy 110 + groceries 350 - 30 refund = 2230
    expect(sep.spending.needs).toBe(2230)
    // wants: Netflix 17.99 + Chipotle 25
    expect(sep.spending.wants).toBe(42.99)
    expect(sep.saved).toBe(500)
    expect(sep.net).toBe(5400 - 2230 - 42.99 - 500)
    expect(sep.savingsRate).toBeCloseTo(500 / 5400, 6)
    expect(sep.byKind.groceries).toBe(320)
  })
})

describe('actual vs budget', () => {
  it('compares each planned line with the month', () => {
    const p = structuredClone(DEFAULT_PROFILE)
    p.expenses = [makeExpense('housing', { amount: 1800 }), makeExpense('groceries', { amount: 250 }), makeExpense('dining', { amount: 100 })]
    const sep = monthlySummaries(history()).find((m) => m.month === '2026-09')!
    const { rows, totals } = actualVsBudget(p, sep)
    const row = (k: string) => rows.find((r) => r.key === k)!
    expect(row('groceries')).toMatchObject({ planned: 250, actual: 320, diff: 70 })
    expect(row('dining')).toMatchObject({ planned: 100, actual: 25, diff: -75 })
    expect(row('utilities')).toMatchObject({ planned: 0, actual: 110 }) // unplanned spending shows up
    expect(totals.needs).toEqual({ planned: 2050, actual: 2230 })
  })
})

describe('fill in my budget', () => {
  it('averages complete months per kind and applies them as monthly lines', () => {
    const p = structuredClone(DEFAULT_PROFILE)
    p.expenses = [makeExpense('groceries', { amount: 50, frequency: 'weekly' }), makeExpense('groceries', { amount: 10 })]
    const { months, suggestions } = suggestBudget(p, history())
    expect(months).toEqual(['2026-07', '2026-08', '2026-09'])
    const g = suggestions.find((s) => s.kind === 'groceries')!
    expect(g.monthly).toBe(Math.round((350 + 350 + 320) / 3))
    expect(g.planned).toBe(Math.round((50 * 52) / 12 + 10))
    const after = applySuggestions(p, [g], () => 'new')
    expect(after.expenses.filter((e) => e.kind === 'groceries')).toEqual([expect.objectContaining({ amount: 340, frequency: 'monthly' })])
  })
})

describe('recurring charges', () => {
  const rec = findRecurring(history(), new Date('2026-10-05'))
  const by = (p: string) => rec.find((r) => r.payee === p)
  it('finds monthly bills and subscriptions', () => {
    expect(by('Netflix')).toMatchObject({ cadence: 'monthly', count: 3, kind: 'subscriptions' })
    expect(by('Avalon Apartments Rent')).toMatchObject({ cadence: 'monthly', amount: 1800 })
  })
  it('flags a price increase', () => {
    expect(by('Netflix')!.priceIncrease).toEqual({ from: 15.49, to: 17.99 })
  })
  it('flags a subscription that stopped charging', () => {
    expect(by('Planet Fitness')).toBeUndefined() // only 2 charges: not enough to call monthly
    const rec4 = findRecurring({ ...history(), transactions: history().transactions.filter((t) => t.payee !== 'Netflix' || t.date < '2026-09-01') }, new Date('2026-10-05'))
    expect(rec4.find((r) => r.payee === 'Netflix')).toBeUndefined()
  })
  it('a stale monthly charge is marked as possibly canceled', () => {
    const data = history()
    const old = data.transactions.filter((t) => t.payee === 'Kroger')
    expect(old.length).toBeGreaterThan(3)
    const gym = ['05', '06', '07'].map((m, i) => ({ ...data.transactions[0], id: `g${i}`, date: `2026-${m}-03`, payee: 'Gym Co', description: 'GYM CO', amount: -30, type: 'expense' as const }))
    const r = findRecurring({ ...data, transactions: [...data.transactions, ...gym] }, new Date('2026-10-05')).find((x) => x.payee === 'Gym Co')!
    expect(r.stale).toBe(true)
  })
  it('does not treat irregular shopping as recurring', () => {
    expect(by('Kroger')).toBeUndefined() // twice a month, different amounts
    expect(by('Chipotle')).toMatchObject({ cadence: 'monthly' }) // same lunch on the 12th each month really is recurring
  })
})

describe('goals and gaps', () => {
  it('reads goal progress from linked accounts', () => {
    expect(goalBalances(history())).toEqual({ emergencyFund: 4200, savings: null, debt: 850 })
  })
  it('warns when card payments exist but no card account was imported', () => {
    const data = history()
    expect(missingCardAccounts(data)).toBe(0)
    const noCard = { ...data, accounts: data.accounts.filter((a) => a.kind !== 'credit'), transactions: data.transactions.filter((t) => t.accountId !== 'card') }
    expect(missingCardAccounts(noCard)).toBe(3)
  })
})

describe('recurring: price increases only for fixed-price charges', () => {
  it('a variable bill is recurring but never flagged as a price increase', () => {
    const data = history()
    const util = findRecurring(data, new Date('2026-10-05')).find((r) => r.payee === 'Duke Energy')!
    expect(util).toMatchObject({ cadence: 'monthly' })
    expect(util.priceIncrease).toBeNull() // 90, 100, 110
  })
  it('savings transfers are not listed as charges', () => {
    expect(findRecurring(history(), new Date('2026-10-05')).some((r) => r.kind === 'emergencyFund')).toBe(false)
  })
})
