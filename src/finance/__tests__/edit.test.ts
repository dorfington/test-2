import { describe, expect, it } from 'vitest'
import { forgetRule, linkTransfers, recategorize } from '../edit'
import { applyImport, parseStatementText, prepareImport } from '../importer'
import { EMPTY_FINANCE, type Account, type FinanceData } from '../types'

const acct = (id: string, kind: Account['kind']): Account => ({ id, name: id, kind, last4: null, goal: null, createdAt: '2026-10-01' })

function load(files: [Account, string][]): FinanceData {
  let data: FinanceData = { ...structuredClone(EMPTY_FINANCE), accounts: files.map(([a]) => a) }
  files.forEach(([a, text], i) => {
    const p = prepareImport(parseStatementText(text, 'f.csv', a.kind), a, data, { fileName: 'f.csv', importId: `i${i}` })
    data = applyImport(data, p)
  })
  return data
}

const CHECKING = `Date,Description,Amount
09/01/2026,VENMO PAYMENT 111,-40.00
09/08/2026,VENMO PAYMENT 222,-40.00
09/10/2026,VENMO CASHOUT,25.00
09/12/2026,ONLINE PMT MYBANK VISA,-512.33
09/14/2026,TO SAVINGS 4421,-200.00
`
const CARD = `Date,Description,Amount
09/05/2026,TACO STAND,-12.00
09/14/2026,MOBILE PYMT RECEIVED,512.33
`
const SAVINGS = `Date,Description,Amount
09/15/2026,TRANSFER IN FROM 1234,200.00
`

describe('recategorize', () => {
  it('one transaction only', () => {
    const data = load([[acct('chk', 'checking'), CHECKING]])
    const id = data.transactions.find((t) => t.description === 'VENMO PAYMENT 111')!.id
    const after = recategorize(data, id, { type: 'expense', kind: 'housing' }, false)
    const venmo = after.transactions.filter((t) => t.payee === 'Venmo' && t.amount === -40)
    expect(venmo.map((t) => t.kind).sort()).toEqual(['housing', null])
    expect(after.rules).toEqual([])
  })

  it('remembered: becomes a rule, re-labels that merchant, skips hand-set rows, applies to future imports', () => {
    let data = load([[acct('chk', 'checking'), CHECKING]])
    const [a, b] = data.transactions.filter((t) => t.payee === 'Venmo' && t.amount === -40)
    data = recategorize(data, b.id, { type: 'expense', kind: 'entertainment' }, false) // hand-set first
    data = recategorize(data, a.id, { type: 'expense', kind: 'housing' }, true)
    expect(data.rules).toEqual([{ payeeKey: 'VENMO', type: 'expense', category: 'needs', kind: 'housing' }])
    const byId = (id: string) => data.transactions.find((t) => t.id === id)!
    expect(byId(a.id)).toMatchObject({ kind: 'housing', categorizedBy: 'user' })
    expect(byId(b.id)).toMatchObject({ kind: 'entertainment', categorizedBy: 'user' })
    // The +25 Venmo cash-out from the same merchant becomes a refund in that category.
    expect(data.transactions.find((t) => t.amount === 25)).toMatchObject({ type: 'refund', kind: 'housing', categorizedBy: 'rule' })
    // Future import uses the rule
    const next = prepareImport(parseStatementText('Date,Description,Amount\n10/01/2026,VENMO PAYMENT 333,-40.00\n', 'f.csv', 'checking'), acct('chk', 'checking'), data, { fileName: 'f.csv', importId: 'later' })
    expect(next.transactions[0]).toMatchObject({ kind: 'housing', categorizedBy: 'rule' })
    expect(forgetRule(data, 'VENMO').rules).toEqual([])
  })
})

describe('linkTransfers', () => {
  it('matches a card payment the rules did not recognize, and savings moves', () => {
    const data = load([
      [acct('chk', 'checking'), CHECKING],
      [acct('card', 'credit'), CARD],
      [acct('sav', 'savings'), SAVINGS],
    ])
    const pmt = data.transactions.find((t) => t.description === 'ONLINE PMT MYBANK VISA')!
    expect(pmt.type).toBe('expense') // "MYBANK VISA" isn't a known issuer
    const linked = linkTransfers(data)
    const find = (d: string) => linked.transactions.find((t) => t.description === d)!
    expect(find('ONLINE PMT MYBANK VISA').type).toBe('transfer')
    expect(find('MOBILE PYMT RECEIVED').type).toBe('transfer')
    // Checking -> savings: the outflow stays as savings, the inflow is ignored.
    expect(find('TO SAVINGS 4421')).toMatchObject({ type: 'expense', kind: 'emergencyFund' })
    expect(find('TRANSFER IN FROM 1234').type).toBe('transfer')
    // Unrelated rows untouched
    expect(find('TACO STAND').type).toBe('expense')
  })

  it('does not pair amounts that just happen to match without any payment wording', () => {
    const data = load([
      [acct('chk', 'checking'), 'Date,Description,Amount\n09/01/2026,GROCERY OUTLET,-50.00\n'],
      [acct('card', 'credit'), 'Date,Description,Amount\n09/02/2026,STORE REFUND,50.00\n'],
    ])
    expect(linkTransfers(data)).toBe(data)
  })
})
