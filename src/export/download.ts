import type { Budget } from '../budget/budget'
import type { TaxResult } from '../engine'
import type { WhatIf } from '../model/derive'
import type { Profile } from '../model/profile'
import { reportToCsv } from './csv'
import { buildReport } from './report'

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

const filename = (ext: string) => `take-home-budget-${new Date().toISOString().slice(0, 10)}.${ext}`

export function downloadCsv(profile: Profile, tax: TaxResult, budget: Budget, whatIf: WhatIf) {
  const csv = reportToCsv(buildReport(profile, tax, budget, whatIf))
  save(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename('csv'))
}

/** jsPDF is loaded on demand so it isn't in the main bundle. */
export async function downloadPdf(profile: Profile, tax: TaxResult, budget: Budget, whatIf: WhatIf) {
  const { reportToPdf } = await import('./pdf')
  const doc = reportToPdf(buildReport(profile, tax, budget, whatIf))
  save(doc.output('blob'), filename('pdf'))
}
