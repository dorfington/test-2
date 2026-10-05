import { TaxYearSchema, type TaxYearData } from './schema'
import raw2025 from './2025.json'
import raw2026 from './2026.json'

/**
 * Registered tax years. To add a year: create <year>.json (copy the latest one,
 * update every number and source link), import it here and add it to RAW.
 */
const RAW: Record<number, unknown> = {
  2025: raw2025,
  2026: raw2026,
}

const cache = new Map<number, TaxYearData>()

export const TAX_YEARS = Object.keys(RAW)
  .map(Number)
  .sort((a, b) => b - a)

export const DEFAULT_TAX_YEAR = TAX_YEARS[0]

/** Returns the validated data for a tax year. Throws with a readable message if the file is invalid. */
export function getTaxYear(year: number): TaxYearData {
  const hit = cache.get(year)
  if (hit) return hit
  if (!(year in RAW)) throw new Error(`No tax data for ${year}. Available: ${TAX_YEARS.join(', ')}`)
  const parsed = TaxYearSchema.safeParse(RAW[year])
  if (!parsed.success) {
    throw new Error(`Tax data for ${year} is invalid:\n${parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`)
  }
  cache.set(year, parsed.data)
  return parsed.data
}

export * from './schema'
