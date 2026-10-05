import { describe, expect, it } from 'vitest'
import { categorize, cleanPayee } from '../categorize'
import { applyImport, parseStatementText, prepareImport, transactionIds, undoImport } from '../importer'
import { EMPTY_FINANCE, type Account, type FinanceData } from '../types'
import * as F from './fixtures'

const acct = (kind: Account['kind'], id: string = kind): Account => ({ id, name: id, kind, last4: null, goal: null, createdAt: '2026-10-01' })

function importInto(data: FinanceData, account: Account, text: string, file = 'x.csv', importId = 'imp1') {
  const parsed = parseStatementText(text, file, account.kind)
  const p = prepareImport(parsed, account, data, { fileName: file, importId, now: new Date('2026-10-05T12:00:00Z') })
  return { p, data: applyImport(data, p) }
}

describe('cleanPayee', () => {
  it.each([
    ['NETFLIX.COM', 'Netflix'],
    ['WHOLEFDS AUS 10234', 'Whole Foods'],
    ['SQ *BLUE BOTTLE COFFEE OAKLAND CA', 'Blue Bottle Coffee'],
    ['TST* JOES PIZZA BROOKLYN NY', 'Joes Pizza'],
    ['AMAZON MKTPL*2K4LJ1AB3', 'Amazon'],
    ['STARBUCKS STORE 01234, AUSTIN', 'Starbucks'],
    ['PURCHASE AUTHORIZED ON 09/28 SAFEWAY #1234 OAKLAND CA S386271234 CARD 1234', 'Safeway'],
    ['RECURRING PAYMENT AUTHORIZED ON 09/27 HULU 877-8244858 CA S306271999 CARD 1234', 'Hulu'],
    ['CVS/PHARMACY #01234', 'Cvs/Pharmacy'],
    ['SHELL OIL 57444', 'Shell Oil'],
  ])('%s -> %s', (raw, want) => expect(cleanPayee(raw)).toBe(want))
})

describe('categorize', () => {
  const cat = (desc: string, amount: number, kind: Account['kind'] = 'checking') => {
    const c = categorize(desc, cleanPayee(desc), amount, kind, [])
    return c.type === 'expense' || c.type === 'refund' ? `${c.type}:${c.kind ?? '?'}` : c.type
  }
  it.each([
    ['NETFLIX.COM', -15.49, 'credit', 'expense:subscriptions'],
    ['WHOLEFDS AUS 10234', -86.12, 'credit', 'expense:groceries'],
    ['SHELL OIL 57444', -42.1, 'credit', 'expense:gas'],
    ['Payment Thank You-Mobile', 1200, 'credit', 'transfer'],
    ['AMAZON MKTPL*2K4LJ1AB3', 23.99, 'credit', 'refund:shopping'],
    ['ACME CORP PAYROLL PPD ID: 1234567890', 2692.31, 'checking', 'income'],
    ['CHASE CREDIT CRD AUTOPAY PPD ID: 4760039224', -1200, 'checking', 'transfer'],
    ['Online Transfer to SAV ...4421 transaction#: 1234', -300, 'checking', 'expense:emergencyFund'],
    ['AVALON APARTMENTS RENT WEB ID: 0001', -1850, 'checking', 'expense:housing'],
    ['COMCAST CABLE COMM', -79.99, 'checking', 'expense:phone'],
    ['VENMO PAYMENT 1023456789', -40, 'checking', 'expense:?'],
    ['STATE FARM RO 27 DES:CPC-CLIENT', -123.4, 'checking', 'expense:insurance'],
    ['DUKE ENERGY DES:BILL PAY', -96.6, 'checking', 'expense:utilities'],
    ['VANGUARD BUY INVESTMENT', -1280, 'checking', 'expense:investing'],
    ['DELTA AIR LINES ATLANTA', -412.3, 'credit', 'expense:travel'],
    ['UBER EATS help.uber.com', -31.18, 'credit', 'expense:dining'],
    ['LYFT *RIDE SUN 9PM', -18.4, 'credit', 'expense:gas'],
    ['CVS/PHARMACY #01234', -18.75, 'credit', 'expense:healthcare'],
    ['NAVIENT PAYMENT', -250, 'checking', 'expense:minDebt'],
    ['INTEREST CHARGE ON PURCHASES', -12.03, 'credit', 'expense:other'],
    ['ACH DEPOSIT INTERNET TRANSFER FROM ACCOUNT ENDING IN 1234', 200, 'credit', 'transfer'],
    ['Online Transfer from CHK ...1234', 300, 'savings', 'transfer'],
    ['INTEREST PAID', 3.12, 'savings', 'income'],
    ['RANDOM LLC 8812', -20, 'checking', 'expense:?'],
  ] as [string, number, Account['kind'], string][])('%s (%d, %s) -> %s', (desc, amount, kind, want) => {
    expect(cat(desc, amount, kind)).toBe(want)
  })

  it('your own rule wins over the built-in ones', () => {
    const c = categorize('VENMO PAYMENT 1023456789', 'Venmo', -40, 'checking', [{ payeeKey: 'VENMO', type: 'expense', category: 'needs', kind: 'housing' }])
    expect(c).toMatchObject({ type: 'expense', kind: 'housing', categorizedBy: 'rule' })
  })
})

describe('import pipeline', () => {
  it('imports, categorizes and records the balance', () => {
    const { p, data } = importInto(structuredClone(EMPTY_FINANCE), acct('checking'), F.CHASE_BANK_CSV)
    expect(p.transactions).toHaveLength(6)
    expect(p.record).toMatchObject({ added: 6, skipped: 0, firstDate: '2026-09-25', lastDate: '2026-09-30', format: 'csv' })
    expect(data.balances).toEqual([{ accountId: 'checking', date: '2026-09-30', balance: 5210.44 }])
    expect(data.transactions[0].date).toBe('2026-09-30') // newest first
  })

  it('re-importing the same or an overlapping file adds nothing twice', () => {
    let { data } = importInto(structuredClone(EMPTY_FINANCE), acct('credit'), F.CHASE_CARD_CSV)
    const again = importInto(data, acct('credit'), F.CHASE_CARD_CSV, 'x.csv', 'imp2')
    expect(again.p).toMatchObject({ skipped: 6 })
    expect(again.p.transactions).toHaveLength(0)
    // Overlap: one old row + one new row
    const overlap = `Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n09/28/2026,09/29/2026,NETFLIX.COM,Entertainment,Sale,-15.49,\n10/01/2026,10/02/2026,TARGET 1234,Shopping,Sale,-20.00,\n`
    data = again.data
    const o = importInto(data, acct('credit'), overlap, 'x.csv', 'imp3')
    expect(o.p).toMatchObject({ skipped: 1 })
    expect(o.p.transactions.map((t) => t.payee)).toEqual(['Target'])
  })

  it('keeps two identical purchases on the same day', () => {
    const ids = transactionIds('a', [
      { date: '2026-09-03', description: 'BLUE BOTTLE', amount: -4.5 },
      { date: '2026-09-03', description: 'BLUE BOTTLE', amount: -4.5 },
    ])
    expect(new Set(ids).size).toBe(2)
  })

  it('OFX duplicates are matched by FITID', () => {
    const { data } = importInto(structuredClone(EMPTY_FINANCE), acct('checking'), F.OFX_SGML, 'x.ofx')
    expect(data.transactions).toHaveLength(4)
    const again = importInto(data, acct('checking'), F.OFX_SGML, 'x.ofx', 'imp2')
    expect(again.p.skipped).toBe(4)
  })

  it('the same file into two different accounts is not a duplicate', () => {
    const { data } = importInto(structuredClone(EMPTY_FINANCE), acct('credit', 'card-a'), F.AMEX_CSV)
    const b = importInto(data, acct('credit', 'card-b'), F.AMEX_CSV, 'x.csv', 'imp2')
    expect(b.p.transactions).toHaveLength(4)
  })

  it('flipping signs in the preview flips every amount', () => {
    const parsed = parseStatementText(F.CHASE_BANK_CSV, 'x.csv', 'checking')
    const p = prepareImport(parsed, acct('checking'), structuredClone(EMPTY_FINANCE), { fileName: 'x.csv', importId: 'i', flipSigns: true })
    expect(p.transactions[0].amount).toBe(-2692.31)
  })

  it('undo removes exactly that import', () => {
    let { data } = importInto(structuredClone(EMPTY_FINANCE), acct('credit'), F.AMEX_CSV, 'a.csv', 'A')
    data = importInto(data, acct('checking'), F.CHASE_BANK_CSV, 'b.csv', 'B').data
    const after = undoImport(data, 'A')
    expect(after.transactions.every((t) => t.importId === 'B')).toBe(true)
    expect(after.imports.map((i) => i.id)).toEqual(['B'])
  })
})

describe('cleanPayee: cities', () => {
  it.each([
    ['DOORDASH*SWEETGREEN SAN FRANCISCO CA', 'DoorDash'],
    ['BLUE BOTTLE COFFEE SAN FRANCISCO CA', 'Blue Bottle Coffee'],
    ['SHAKE SHACK NEW YORK NY', 'Shake Shack'],
    ['CHIPOTLE 2345 AUSTIN TX', 'Chipotle'],
    ['AMC CA', 'Amc'],
  ])('%s -> %s', (raw, want) => expect(cleanPayee(raw)).toBe(want))
})
