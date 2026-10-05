import type { FilingStatus, TaxYearData } from '../taxdata'
import type { Earner, FicaResult } from './types'

/** Wages subject to FICA: Section 125 and payroll HSA contributions are exempt; 401(k) deferrals are not. */
export const ficaWages = (e: Earner) => Math.max(0, e.wages - e.section125 - e.hsa)

/**
 * Employee FICA. Social Security is capped per worker. Additional Medicare Tax
 * is computed on combined wages against the filing-status threshold, which is
 * what is owed on the return (employers withhold it only above $200,000 per worker).
 */
export function fica(data: TaxYearData['fica'], status: FilingStatus, earners: Earner[]): FicaResult {
  const { socialSecurity: ss, medicare: mc } = data
  let socialSecurity = 0
  let medicareWages = 0
  for (const e of earners) {
    const w = ficaWages(e)
    socialSecurity += Math.min(w, ss.wageBase) * ss.rate
    medicareWages += w
  }
  const medicare = medicareWages * mc.rate
  const additionalMedicare = Math.max(0, medicareWages - mc.additionalThreshold[status]) * mc.additionalRate
  return { socialSecurity, medicare, additionalMedicare, total: socialSecurity + medicare + additionalMedicare }
}
