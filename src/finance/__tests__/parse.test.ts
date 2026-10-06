import { describe, expect, it } from 'vitest'
import { parseCsvRows, parseCsvStatement } from '../parse/csv'
import { parseOfxStatement } from '../parse/ofx'
import { parsePdfStatementText } from '../parse/pdf'
import { parseDate, parseMoney } from '../parse/util'
import * as F from './fixtures'

const amounts = (s: { transactions: { amount: number }[] }) => s.transactions.map((t) => t.amount)

describe('helpers', () => {
  it.each([
    ['$1,234.56', 1234.56],
    ['(12.34)', -12.34],
    ['-12.34', -12.34],
    ['12.34-', -12.34],
    ['−7.00', -7],
    ['5.00 CR', -5],
    ['', null],
    ['abc', null],
  ])('parseMoney(%s) = %s', (raw, want) => expect(parseMoney(raw)).toBe(want))

  it.each([
    ['09/28/2026', '2026-09-28'],
    ['9/2/26', '2026-09-02'],
    ['2026-09-28', '2026-09-28'],
    ['20260915120000[-5:EST]', '2026-09-15'],
    ['Sep 14, 2026', '2026-09-14'],
    ['13/40/2026', null],
  ])('parseDate(%s) = %s', (raw, want) => expect(parseDate(raw)).toBe(want))

  it('CSV rows handle quotes, commas and newlines inside quotes', () => {
    expect(parseCsvRows('a,"b, c","say ""hi"""\r\n1,"multi\nline",3')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', 'multi\nline', '3'],
    ])
  })
})

describe('CSV exports: money out is always negative', () => {
  it('Chase card (purchases already negative)', () => {
    const s = parseCsvStatement(F.CHASE_CARD_CSV, 'credit')
    expect(amounts(s)).toEqual([-15.49, -86.12, -42.1, 1200, 23.99, -6.45])
    expect(s.transactions[5].description).toBe('STARBUCKS STORE 01234, AUSTIN')
    expect(s.signsInferred).toBe(false)
  })

  it('Chase checking, with running balance', () => {
    const s = parseCsvStatement(F.CHASE_BANK_CSV, 'checking')
    expect(amounts(s)[0]).toBe(2692.31)
    expect(amounts(s)[3]).toBe(-1850)
    expect(s.balance).toEqual({ date: '2026-09-30', amount: 5210.44 })
  })

  it('Amex (purchases positive -> flipped)', () => {
    const s = parseCsvStatement(F.AMEX_CSV, 'credit')
    expect(amounts(s)).toEqual([-412.3, -31.18, 950, -11.99])
    expect(s.signsInferred).toBe(true)
  })

  it('Capital One debit/credit columns and last 4 digits', () => {
    const s = parseCsvStatement(F.CAPITAL_ONE_CSV, 'credit')
    expect(amounts(s)).toEqual([-54.21, 600, -18.75])
    expect(s.last4).toBe('4821')
  })

  it('Discover (purchases positive -> flipped)', () => {
    expect(amounts(parseCsvStatement(F.DISCOVER_CSV, 'credit'))).toEqual([-64.2, 300, -28.5])
  })

  it('Bank of America: skips the summary block and the beginning-balance row', () => {
    const s = parseCsvStatement(F.BOFA_BANK_CSV, 'checking')
    expect(amounts(s)).toEqual([3000, -123.4, -96.6, -1280])
    expect(s.balance).toEqual({ date: '2026-09-30', amount: 2500 })
  })

  it('Citi debit/credit where credits are written negative', () => {
    expect(amounts(parseCsvStatement(F.CITI_CSV, 'credit'))).toEqual([-45.1, 250, -18.4])
  })

  it('Wells Fargo: no header row', () => {
    const s = parseCsvStatement(F.WELLS_FARGO_CSV, 'checking')
    expect(amounts(s)).toEqual([-62.18, 1850, -14.99])
    expect(s.transactions[1].description).toMatch(/^ACME INC DIR DEP/)
  })

  it('Apple Card "Amount (USD)" (purchases positive -> flipped)', () => {
    expect(amounts(parseCsvStatement(F.APPLE_CARD_CSV, 'credit'))).toEqual([-9.99, 200, -14.25])
  })

  it('explains a file without recognizable columns', () => {
    const s = parseCsvStatement('name,age\nbob,3', 'checking')
    expect(s.transactions).toEqual([])
    expect(s.warnings[0]).toMatch(/columns/)
  })
})

describe('OFX / QFX', () => {
  it('SGML checking file: FITIDs, MEMO, entities, ledger balance, last 4', () => {
    const s = parseOfxStatement(F.OFX_SGML)
    expect(s.suggestedKind).toBe('checking')
    expect(s.last4).toBe('6789')
    expect(s.transactions.map((t) => [t.date, t.amount, t.fitid])).toEqual([
      ['2026-09-03', -4.5, '2026090301'],
      ['2026-09-03', -4.5, '2026090302'],
      ['2026-09-15', 2692.31, '2026091501'],
      ['2026-09-16', -65, '2026091601'],
    ])
    expect(s.transactions[3].description).toBe('PG&E WEB ONLINE')
    expect(s.balance).toEqual({ date: '2026-09-30', amount: 3123.81 })
  })

  it('XML credit card file: card balance stored as owed (negative)', () => {
    const s = parseOfxStatement(F.QFX_XML_CARD)
    expect(s.suggestedKind).toBe('credit')
    expect(s.last4).toBe('9876')
    expect(amounts(s)).toEqual([-120.4, 500])
    expect(s.balance).toEqual({ date: '2026-09-30', amount: -1840.22 })
  })
})

describe('PDF statements (best effort)', () => {
  it('checking: sections give the sign, the period gives years across New Year', () => {
    const s = parsePdfStatementText(F.PDF_CHECKING_LINES, 'checking')
    expect(s.transactions.map((t) => [t.date, t.amount])).toEqual([
      ['2026-12-31', 2692.31],
      ['2026-12-20', -1850],
      ['2027-01-03', -79.99],
      ['2027-01-10', -98.4],
    ])
    expect(s.balance).toEqual({ date: '2027-01-15', amount: 4613.92 })
    expect(s.last4).toBe('4421')
  })

  it('card: two dates per row, payments and CR credits are money in, purchases out', () => {
    const s = parsePdfStatementText(F.PDF_CARD_LINES, 'credit')
    expect(s.transactions.map((t) => [t.date, t.description, t.amount])).toEqual([
      ['2026-08-25', 'PAYMENT THANK YOU', 900],
      ['2026-08-18', 'TST* JOES PIZZA BROOKLYN NY', -32.4],
      ['2026-09-02', 'SQ *BLUE BOTTLE COFFEE OAKLAND CA', -5.75],
      ['2026-09-10', 'NORDSTROM #123', 1],
    ])
    expect(s.balance).toEqual({ date: '2026-09-15', amount: -1234.56 })
    expect(s.last4).toBe('9876')
    expect(s.signsInferred).toBe(true)
  })
})
