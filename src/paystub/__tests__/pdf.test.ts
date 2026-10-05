// @vitest-environment node
import { jsPDF } from 'jspdf'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { linesFromTextItems, type TextItem } from '../lines'
import { parsePaystub } from '../parse'

/** Lays out a stub like payroll PDFs do: positioned text, two tables side by side. */
function makeStubPdf(): ArrayBuffer {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  doc.setFontSize(10)
  const row = (y: number, cells: [number, string][]) => cells.forEach(([x, t]) => doc.text(t, x, y, x > 150 && /\d/.test(t) ? { align: 'right' } : undefined))
  row(50, [[40, 'Pay Date: 10/02/2026'], [300, 'Pay Period: 09/14/2026 - 09/27/2026']])
  row(70, [[40, 'Federal Filing Status: Single'], [300, 'Work State: CO']])
  row(100, [[40, 'Earnings'], [180, 'Hours'], [240, 'Current'], [300, 'Deductions'], [470, 'Current'], [540, 'YTD']])
  row(118, [[40, 'Salary'], [180, '80.00'], [240, '2,500.00'], [300, 'Federal Withholding'], [470, '231.80'], [540, '4,404.20']])
  row(136, [[40, 'Gross Pay'], [240, '2,500.00'], [300, 'Social Security'], [470, '155.00'], [540, '2,945.00']])
  row(154, [[300, 'Medicare'], [470, '36.25'], [540, '688.75']])
  row(172, [[300, 'CO State Tax'], [470, '96.80'], [540, '1,839.20']])
  row(190, [[300, 'CO FAMLI'], [470, '11.00'], [540, '209.00']])
  row(208, [[300, '401(k)'], [470, '125.00'], [540, '2,375.00']])
  row(226, [[300, 'Medical Pre-Tax'], [470, '64.00'], [540, '1,216.00']])
  row(250, [[40, 'Net Pay'], [240, '1,780.15']])
  return doc.output('arraybuffer')
}

describe('PDF pay stub: pdf.js text layer -> rows -> parser', () => {
  it('reads every value from a payroll-style PDF', async () => {
    const pdf = await getDocument({ data: new Uint8Array(makeStubPdf()), useSystemFonts: true }).promise
    const content = await (await pdf.getPage(1)).getTextContent()
    const lines = linesFromTextItems(content.items as TextItem[])
    expect(lines).toContain('Salary 80.00 2,500.00 Federal Withholding 231.80 4,404.20')

    const d = parsePaystub(lines.join('\n'))
    expect(d.grossPay?.value).toBe(2500)
    expect(d.payFrequency?.value).toBe('biweekly')
    expect(d.payDate?.value).toBe('2026-10-02')
    expect(d.filingStatus?.value).toBe('single')
    expect(d.federalWithholding?.value).toBe(231.8)
    expect(d.stateWithholding?.value).toBe(96.8)
    expect(d.state?.value).toBe('CO')
    expect(d.retirement?.value).toBe(125)
    expect(d.healthInsurance?.value).toBe(64)
    expect(d.netPay?.value).toBe(1780.15)
  })
})
