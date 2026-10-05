import { describe, expect, it } from 'vitest'
import raw2026 from '../2026.json'
import { getTaxYear, STATE_CODES, TAX_YEARS, TaxYearSchema } from '..'

describe('tax data files', () => {
  it.each(TAX_YEARS)('%d validates against the schema', (year) => {
    expect(() => getTaxYear(year)).not.toThrow()
    expect(getTaxYear(year).year).toBe(year)
  })

  it.each(TAX_YEARS)('%d covers all 50 states + DC, each with at least one source link', (year) => {
    const d = getTaxYear(year)
    expect(Object.keys(d.states).sort()).toEqual([...STATE_CODES].sort())
    for (const s of Object.values(d.states)) expect(s.sources.length).toBeGreaterThan(0)
    for (const l of d.localities) expect(l.sources.length).toBeGreaterThan(0)
  })

  it('locality ids are unique', () => {
    for (const year of TAX_YEARS) {
      const ids = getTaxYear(year).localities.map((l) => l.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('rejects a file with unsorted brackets', () => {
    const bad = structuredClone(raw2026) as typeof raw2026
    bad.federal.brackets.single.reverse()
    expect(TaxYearSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a file missing a state', () => {
    const bad = structuredClone(raw2026) as { states: Record<string, unknown> }
    delete bad.states.OH
    expect(TaxYearSchema.safeParse(bad).success).toBe(false)
  })

  it('throws a readable error for an unknown year', () => {
    expect(() => getTaxYear(1999)).toThrow(/No tax data for 1999/)
  })
})
