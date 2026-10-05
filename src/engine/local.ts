import type { FilingStatus, LocalComponent, Locality, TaxYearData } from '../taxdata'
import { bracketTax, pick } from './brackets'
import type { LocalResult } from './types'

export interface LocalBases {
  status: FilingStatus
  /** State taxable income. */
  stateTaxable: number
  /** State income tax after credits. */
  stateTax: number
  /** Gross wages less Section 125 (401(k) deferrals stay taxable for most city wage taxes). */
  wages: number
  /** Filer(s) plus dependents, for per-person exemptions. */
  persons: number
}

export const CUSTOM_LOCALITY_ID = 'custom'

export function localitiesFor(data: TaxYearData, state: string): Locality[] {
  return data.localities.filter((l) => l.state === state)
}

export function componentTax(c: LocalComponent, b: LocalBases): number {
  let base = c.base === 'stateTaxable' ? b.stateTaxable : c.base === 'stateTax' ? b.stateTax : b.wages
  if (c.exemptionPerPerson) base -= c.exemptionPerPerson * b.persons
  base = Math.max(0, base)
  if (c.rate !== undefined) return base * c.rate
  if (c.brackets) return bracketTax(base, pick(c.brackets, b.status).value)
  if (c.tiers) {
    const tiers = pick(c.tiers, b.status).value
    const tier = tiers.find((t) => t.upTo === null || base <= t.upTo) ?? tiers[tiers.length - 1]
    return base * tier.rate
  }
  return 0
}

export function localTax(
  data: TaxYearData,
  state: string,
  localityId: string | null | undefined,
  customRate: number | undefined,
  bases: LocalBases,
): { result: LocalResult | null; warnings: string[] } {
  if (!localityId) return { result: null, warnings: [] }
  if (localityId === CUSTOM_LOCALITY_ID) {
    const rate = customRate ?? 0
    const tax = Math.max(0, bases.wages) * rate
    return {
      result: {
        id: CUSTOM_LOCALITY_ID,
        name: 'Custom local tax',
        items: [{ name: `Local wage tax (${(rate * 100).toFixed(3).replace(/\.?0+$/, '')}%)`, amount: tax }],
        tax,
        notes: ['Custom rate applied to wages. Check your city or school district for the exact rate and rules.'],
      },
      warnings: [],
    }
  }
  const loc = data.localities.find((l) => l.id === localityId)
  if (!loc) return { result: null, warnings: [`Local tax "${localityId}" is not available for ${data.year}; it was ignored.`] }
  if (loc.state !== state) {
    return { result: null, warnings: [`${loc.name} is not in the selected state; local tax was ignored.`] }
  }
  const items = loc.components.map((c) => ({ name: c.name, amount: componentTax(c, bases) }))
  return {
    result: { id: loc.id, name: loc.name, items, tax: items.reduce((s, i) => s + i.amount, 0), notes: loc.notes },
    warnings: [],
  }
}
