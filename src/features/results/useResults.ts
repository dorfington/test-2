import { useMemo } from 'react'
import { buildBudget } from '../../budget/budget'
import { reconcile } from '../../budget/reconcile'
import { withholdingCheck } from '../../budget/withholding'
import { calculateTaxes } from '../../engine'
import { toTaxInput } from '../../model/derive'
import { useBudgetStore } from '../../store/useBudgetStore'

/** Taxes and budget for the saved profile with any what-if overrides applied. */
export function useResults() {
  const profile = useBudgetStore((s) => s.profile)
  const whatIf = useBudgetStore((s) => s.whatIf)
  return useMemo(() => {
    const input = toTaxInput(profile, whatIf)
    if (!input) return null
    const tax = calculateTaxes(input)
    const hasWhatIf = Object.keys(whatIf).length > 0
    const savedTax = hasWhatIf ? calculateTaxes(toTaxInput(profile)!) : tax
    // Your actual paycheck describes your pay as saved; a what-if moves it by the estimated change.
    const reconciliation = reconcile(profile, savedTax)
    const takeHomeAnnual = reconciliation ? reconciliation.householdAnnual + (tax.net - savedTax.net) : undefined
    const budget = buildBudget(profile, tax, whatIf, takeHomeAnnual)
    return {
      profile,
      whatIf,
      tax,
      budget,
      reconciliation,
      withholding: withholdingCheck(profile, savedTax),
      deltaPerMonth: hasWhatIf ? (tax.net - savedTax.net) / 12 : null,
    }
  }, [profile, whatIf])
}
