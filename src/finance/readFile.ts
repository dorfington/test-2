/**
 * Reads a statement file on the device: CSV/OFX/QFX as text, PDFs via pdf.js.
 * Loaded on demand (pdf.js is only fetched for PDFs).
 */
import { parseStatementText } from './importer'
import type { AccountKind, ParsedStatement } from './types'

export async function readStatementFile(file: File, accountKind: AccountKind): Promise<ParsedStatement> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) return parseStatementText(await file.text(), file.name, accountKind)

  const [{ default: workerUrl }, pdfjs, { linesFromTextItems }, { parsePdfStatementText }] = await Promise.all([
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('pdfjs-dist'),
    import('../paystub/lines'),
    import('./parse/pdf'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const lines: string[] = []
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const content = await (await doc.getPage(i)).getTextContent()
    lines.push(...linesFromTextItems(content.items as Parameters<typeof linesFromTextItems>[0]))
  }
  if (lines.join('').replace(/\s/g, '').length < 40) {
    return { format: 'pdf', transactions: [], signsInferred: true, warnings: ['This PDF has no readable text (it may be a scan). Download a CSV or OFX/QFX from your bank instead.'] }
  }
  return parsePdfStatementText(lines, accountKind)
}
