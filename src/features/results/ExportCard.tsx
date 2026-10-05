import { useState } from 'react'
import type { Budget } from '../../budget/budget'
import { Button, Card } from '../../components/ui'
import type { TaxResult } from '../../engine'
import { downloadCsv, downloadPdf } from '../../export/download'
import type { WhatIf } from '../../model/derive'
import type { Profile } from '../../model/profile'

export function ExportCard({ profile, tax, budget, whatIf }: { profile: Profile; tax: TaxResult; budget: Budget; whatIf: WhatIf }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasWhatIf = Object.keys(whatIf).length > 0
  return (
    <Card title="Export">
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Download your pay breakdown, budget, goals and recommendations{hasWhatIf ? ' (including your current what-if changes)' : ''}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => downloadCsv(profile, tax, budget, whatIf)}>Download CSV</Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await downloadPdf(profile, tax, budget, whatIf)
            } catch {
              setError('The PDF could not be created. Try the CSV instead.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Preparing PDF…' : 'Download PDF'}
        </Button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-400">{error}</p>}
    </Card>
  )
}
