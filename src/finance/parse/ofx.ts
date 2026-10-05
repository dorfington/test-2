/**
 * OFX / QFX (Quicken, Money) files: SGML (OFX 1.x, unclosed leaf tags) and
 * XML (OFX 2.x). Amounts in OFX are already signed from the account holder's
 * point of view (card purchases negative), and each transaction has a FITID
 * that makes duplicate detection exact.
 */
import type { ParsedStatement, RawTxn } from '../types'
import { parseDate, parseMoney } from './util'

function tag(block: string, name: string): string | undefined {
  // Leaf value runs until the next tag (SGML) or its closing tag (XML).
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))
  return m ? decode(m[1].trim()) : undefined
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")

export const looksLikeOfx = (text: string) => /<OFX>|OFXHEADER|<\?OFX/i.test(text.slice(0, 2000))

export function parseOfxStatement(text: string): ParsedStatement {
  const warnings: string[] = []
  const isCard = /<CCSTMTRS>|<CCACCTFROM>/i.test(text)
  const acctType = text.match(/<ACCTTYPE>\s*([A-Z]+)/i)?.[1]?.toUpperCase()
  const acctId = text.match(/<ACCTID>\s*([^<\r\n]+)/i)?.[1]?.trim()
  const txns: RawTxn[] = []

  for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)) {
    const b = m[1]
    const date = parseDate(tag(b, 'DTPOSTED') ?? tag(b, 'DTUSER') ?? '')
    const amount = parseMoney(tag(b, 'TRNAMT') ?? '')
    if (!date || amount === null || amount === 0) continue
    const name = tag(b, 'NAME') ?? ''
    const memo = tag(b, 'MEMO') ?? ''
    // NAME is often cut at 32 characters; MEMO sometimes has the rest.
    const description = (name && memo && !name.includes(memo) && memo.toUpperCase().startsWith(name.toUpperCase().slice(0, 8)) ? memo : name || memo).replace(/\s+/g, ' ').trim()
    txns.push({ date, description, amount, fitid: tag(b, 'FITID') })
  }

  let balance: ParsedStatement['balance']
  const ledger = text.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i)?.[1]
  if (ledger) {
    const amt = parseMoney(tag(ledger, 'BALAMT') ?? '')
    const date = parseDate(tag(ledger, 'DTASOF') ?? '')
    // Card balances: issuers disagree on the sign; store what you owe as negative.
    if (amt !== null && date) balance = { date, amount: isCard ? -Math.abs(amt) : amt }
  }
  if (!txns.length) warnings.push('No transactions were found in this OFX/QFX file.')

  return {
    format: 'ofx',
    transactions: txns,
    balance,
    suggestedKind: isCard ? 'credit' : acctType === 'SAVINGS' || acctType === 'MONEYMRKT' ? 'savings' : acctType === 'CHECKING' ? 'checking' : undefined,
    last4: acctId?.match(/(\d{4})\D*$/)?.[1],
    signsInferred: false,
    warnings,
  }
}
