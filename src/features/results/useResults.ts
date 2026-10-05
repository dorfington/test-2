import { useMemo } from 'react'
import { buildBudget } from '../../budget/budget'
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
    const budget = buildBudget(profile, tax, whatIf)
    const hasWhatIf = Object.keys(whatIf).length > 0
    const savedNet = hasWhatIf ? calculateTaxes(toTaxInput(profile)!).net : tax.net
    return { profile, whatIf, tax, budget, withholding: withholdingCheck(profile, tax), deltaPerMonth: hasWhatIf ? (tax.net - savedNet) / 12 : null }
  }, [profile, whatIf])
}
