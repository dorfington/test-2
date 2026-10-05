import type { Report } from './report'

/** RFC 4180 field: quote when needed; neutralize leading =,+,-,@ in text so spreadsheets don't run it as a formula. */
export function csvField(v: string | number): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  let s = v
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function reportToCsv(report: Report): string {
  const lines: string[] = []
  const row = (cells: (string | number)[]) => lines.push(cells.map(csvField).join(','))
  row([report.title])
  row([report.subtitle])
  row(['Generated', report.generated])
  if (report.scenario) row(['What-if scenario (not saved)', report.scenario])
  for (const t of report.tables) {
    lines.push('')
    row([t.title])
    row(t.head)
    t.rows.forEach(row)
  }
  lines.push('')
  row(['Notes'])
  report.notes.forEach((n) => row([n]))
  // BOM so Excel opens UTF-8 correctly; CRLF per RFC 4180.
  return '﻿' + lines.join('\r\n') + '\r\n'
}
