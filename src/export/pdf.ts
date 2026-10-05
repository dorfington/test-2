import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import type { Report } from './report'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
// jsPDF's built-in Helvetica has no U+2212 minus or middle dot, so stick to ASCII-safe text.
const fmt = (v: string | number) => (typeof v === 'number' ? usd.format(v) : v.replace(/[·]/g, '-').replace(/[–—]/g, '-').replace(/[’]/g, "'"))

/** Builds a text-based PDF report (selectable, searchable) from the report model. */
export function reportToPdf(report: Report): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const margin = 48
  const width = doc.internal.pageSize.getWidth() - margin * 2
  let y = margin

  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(17, 24, 39)
  doc.text(report.title, margin, y)
  y += 20
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(75, 85, 99)
  doc.text(fmt(`${report.subtitle} · generated ${report.generated}`), margin, y)
  y += 14
  if (report.scenario) {
    doc.setTextColor(15, 118, 110)
    doc.text(fmt(`What-if scenario (not saved): ${report.scenario}`), margin, y)
    y += 14
  }
  doc.setFontSize(8.5).setTextColor(107, 114, 128)
  const disclaimer = doc.splitTextToSize(report.notes[report.notes.length - 1], width)
  doc.text(disclaimer, margin, y)
  y += disclaimer.length * 11 + 10

  const pageHeight = doc.internal.pageSize.getHeight()
  for (const t of report.tables) {
    // Keep each table's title with at least a few of its rows.
    if (y > pageHeight - 120) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(17, 24, 39)
    doc.text(t.title, margin, y)
    const money = new Set(t.moneyCols ?? [])
    autoTable(doc, {
      startY: y + 8,
      margin: { left: margin, right: margin, bottom: 48 },
      head: [t.head],
      body: t.rows.map((r) => r.map((c, i) => (money.has(i) && typeof c === 'number' ? usd.format(c) : fmt(c)))),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, textColor: [31, 41, 55] },
      headStyles: { fillColor: [17, 94, 89], textColor: 255 },
      columnStyles: Object.fromEntries([...money].map((i) => [i, { halign: 'right' as const }])),
      didParseCell: (data) => {
        if (data.section === 'head' && money.has(data.column.index)) data.cell.styles.halign = 'right'
      },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      tableWidth: width,
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26
  }

  const notes = report.notes.slice(0, -1)
  if (notes.length) {
    if (y > pageHeight - 120) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(17, 24, 39)
    doc.text('About this estimate', margin, y)
    y += 14
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(75, 85, 99)
    for (const n of notes) {
      const lines = doc.splitTextToSize(`- ${fmt(n)}`, width)
      if (y + lines.length * 11 > pageHeight - 40) {
        doc.addPage()
        y = margin
      }
      doc.text(lines, margin, y)
      y += lines.length * 11 + 3
    }
  }
  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(156, 163, 175)
    doc.text('Estimates only - not tax advice.', margin, pageHeight - 24)
    doc.text(`Page ${i} of ${pages}`, doc.internal.pageSize.getWidth() - margin, pageHeight - 24, { align: 'right' })
  }
  return doc
}
