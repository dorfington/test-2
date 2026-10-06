/**
 * Turns the text of a pay stub (from a PDF text layer or OCR) into values the
 * budget can use. Pure and heuristic: every value keeps the line it came from
 * so the user can check it before anything is applied.
 *
 * Stubs are laid out as rows of "label  current  [YTD]" and often place two
 * tables side by side, so each line is split into segments of
 * (label words, numbers) and every segment is classified on its own.
 */
import { STATE_CODES, type FilingStatus, type StateCode } from '../taxdata'
import type { PayFrequency } from '../model/profile'

export interface Found<T> {
  value: T
  /** Stub text the value was read from (several lines joined with " + " when summed). */
  source: string
}

export interface PaystubData {
  payDate?: Found<string>
  payFrequency?: Found<PayFrequency>
  grossPay?: Found<number>
  grossYtd?: Found<number>
  netPay?: Found<number>
  hourlyRate?: Found<number>
  /** Regular hours in this pay period. */
  hours?: Found<number>
  retirement?: Found<number>
  rothRetirement?: Found<number>
  healthInsurance?: Found<number>
  hsa?: Found<number>
  federalWithholding?: Found<number>
  socialSecurity?: Found<number>
  medicare?: Found<number>
  stateWithholding?: Found<number>
  localWithholding?: Found<number>
  state?: Found<StateCode>
  filingStatus?: Found<FilingStatus>
  /** How many stub lines had any recognizable value (0 means "not a pay stub" or unreadable). */
  matchedLines: number
}

interface Segment {
  label: string
  nums: number[]
  /** Numbers as printed, for display. */
  numText: string[]
  /** Original text of the whole line. */
  line: string
}

/** Just this segment's text ("Federal Income Tax 221.42 4,206.98"), not the neighbouring column's. */
const segText = (seg: Segment) => `${seg.label} ${seg.numText.join(' ')}`.trim()

const STATE_NAMES: Record<string, StateCode> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
}

/** Fixes common OCR slips inside numeric tokens (O→0, S→5, l/I→1) without touching words. */
function cleanNumericToken(tok: string): string {
  if (!/\d/.test(tok) || !/[.,]/.test(tok)) return tok
  if ((tok.match(/\d/g) ?? []).length < 2) return tok
  return tok.replace(/[Oo]/g, '0').replace(/[S]/g, '5').replace(/[lI]/g, '1')
}

/** Money/quantity token: must carry a decimal point (stubs print .00); integers like "401" stay label words. */
const NUM_RE = /^\(?[-–]?\$?\d{1,3}(?:,\d{3})*\.\d{1,4}\)?-?$|^\(?[-–]?\$?\d+\.\d{1,4}\)?-?$/

function toNumber(tok: string): number {
  return Math.abs(Number(tok.replace(/[()$,–-]/g, '')))
}

const DATE_TOKEN = /^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{4}-\d{2}-\d{2}$/

export function segmentLine(line: string): Segment[] {
  const tokens = line
    .replace(/\$\s+(?=\d)/g, '$')
    .split(/\s+/)
    .filter(Boolean)
    .map(cleanNumericToken)
  const segs: Segment[] = []
  let label: string[] = []
  let nums: number[] = []
  let numText: string[] = []
  for (const t of tokens) {
    if (NUM_RE.test(t) && !DATE_TOKEN.test(t)) {
      nums.push(toNumber(t))
      numText.push(t)
    } else {
      if (nums.length) {
        segs.push({ label: label.join(' '), nums, numText, line })
        label = []
        nums = []
        numText = []
      }
      label.push(t)
    }
  }
  if (nums.length) segs.push({ label: label.join(' '), nums, numText, line })
  return segs
}

// ---------- dates and frequency ----------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** All dates in a string, in order, as ISO yyyy-mm-dd. */
export function findDates(s: string): string[] {
  const out: { i: number; iso: string }[] = []
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = (y: number) => (y < 100 ? 2000 + y : y)
  for (const m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    const [mo, d, y] = [Number(m[1]), Number(m[2]), year(Number(m[3]))]
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push({ i: m.index!, iso: `${y}-${pad(mo)}-${pad(d)}` })
  }
  for (const m of s.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push({ i: m.index!, iso: `${m[1]}-${m[2]}-${m[3]}` })
  for (const m of s.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi)) {
    out.push({ i: m.index!, iso: `${m[3]}-${pad(MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1)}-${pad(Number(m[2]))}` })
  }
  return out.sort((a, b) => a.i - b.i).map((x) => x.iso)
}

const DATE_SRC = String.raw`(?:\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})`
const PAY_DATE_PHRASE = new RegExp(String.raw`\b(?:pay|check|advice|deposit)\s*(?:date|day)\b\s*[:\-]?\s*` + DATE_SRC, 'i')

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** Pay frequency from a pay period's length in days (inclusive). */
export function frequencyFromDays(days: number): PayFrequency | undefined {
  if (days >= 6 && days <= 8) return 'weekly'
  if (days >= 13 && days <= 14) return 'biweekly'
  if (days >= 15 && days <= 16) return 'semimonthly'
  if (days >= 27 && days <= 31) return 'monthly'
  return undefined
}

/** Salaried stubs often print standard hours for the period. */
function frequencyFromHours(h: number): PayFrequency | undefined {
  const near = (x: number) => Math.abs(h - x) < 0.6
  if (near(40) || near(37.5)) return 'weekly'
  if (near(80) || near(75)) return 'biweekly'
  if (near(86.67) || near(81.25)) return 'semimonthly'
  if (near(173.33) || near(162.5)) return 'monthly'
  return undefined
}

// ---------- classification ----------

const EXCLUDE_STATE_PROGRAMS = /\b(sdi|disab\w*|pfl|fli|family|paid\s*leave|unemploy\w*|ui|sui|suta|workers?\s*comp|wa\s*cares|transit|famli|tdi|vpdi)\b/i
const LOCAL_RE = /\b(city|local|nyc|yonkers|school|eit|occupational|municipal|county|lst|wage\s*tax|phila\w*)\b/i

type Kind =
  | 'gross' | 'net' | 'earningsRow'
  | 'retirement' | 'roth' | 'health' | 'hsa'
  | 'federal' | 'socialSecurity' | 'medicare' | 'state' | 'local'

function classify(label: string): Kind | null {
  const l = label.toLowerCase()
  if (!l.trim()) return null
  if (/\bnet\b/.test(l) && !/gross/.test(l)) return 'net'
  if (/\b(gross|total\s*(gross|earnings|pay))\b/.test(l)) return 'gross'
  if (/\b(employer|er|company)\b.*\b(match|contrib)|\bmatch\b/.test(l)) return null
  if (/roth/.test(l)) return 'roth'
  if (/(^|[^a-z0-9])(401\s*\(?k\)?|403\s*\(?b\)?|457\s*\(?b?\)?|tsp|retire\w*|deferred\s*comp|pension)(?![a-z0-9])/.test(l) && !/loan/.test(l)) return 'retirement'
  if (/\b(hsa|fsa|health\s*savings|flex\w*\s*spend\w*|dep\w*\s*care)\b/.test(l)) return 'hsa'
  if (/\b(social\s*security|soc\s*sec|oasdi|ss\s*tax|fica\s*-?\s*ss|ss)\b/.test(l)) return 'socialSecurity'
  if (/\b(medicare|mcare|medi|fica\s*-?\s*med|med\s*tax)\b/.test(l)) return 'medicare'
  if (/\b(medical|health|dental|vision|med|dent|vis|hlth)\b/.test(l) && !/\btax\b/.test(l.replace(/pre-?\s*tax/g, ''))) return 'health'
  if (/\b(fed\w*|fitw?|fwt)\b/.test(l) && !/\b(unemploy\w*|futa)\b/.test(l)) {
    if (/\b(fed\w*\s*(income|inc|withh\w*|w\/?h|wh|it|tax)|fitw?|fwt)\b/.test(l)) return 'federal'
  }
  if (EXCLUDE_STATE_PROGRAMS.test(l)) return null
  if (LOCAL_RE.test(l) && /\b(tax|w\/?h|wh|withh\w*|eit|it)\b|nyc|yonkers|phila/.test(l)) return 'local'
  if (/\b(state|sit|swt|st\s*(w\/?h|wh|tax|inc\w*)|withh\w*|w\/?h|income\s*tax)\b/.test(l) && stateIn(label)) return 'state'
  if (/\b(state\s*(income\s*)?tax|sit|swt)\b/.test(l)) return 'state'
  // "Income tax" that isn't federal or local is the state's, even if OCR garbled the state's name.
  if (/\b(income|inc)\s*tax\b/.test(l)) return 'state'
  if (/\b(regular|salary|hourly|reg|base\s*pay|straight\s*time)\b/.test(l)) return 'earningsRow'
  return null
}

function stateIn(label: string): StateCode | undefined {
  const lower = label.toLowerCase()
  for (const [name, code] of Object.entries(STATE_NAMES).sort((a, b) => b[0].length - a[0].length)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return code
  }
  for (const m of label.matchAll(/\b([A-Z]{2})\b/g)) {
    if ((STATE_CODES as readonly string[]).includes(m[1]) && !['IN', 'OR', 'ME', 'OH', 'HI'].includes(m[1])) return m[1] as StateCode
  }
  // Ambiguous two-letter codes that are also words count only next to tax words.
  const amb = label.match(/\b(IN|OR|ME|OH|HI)\b(?=\s*(state|sit|swt|st\b|w\/?h|wh|withh|income|tax))/)
  return amb ? (amb[1] as StateCode) : undefined
}

// ---------- main ----------

export function parsePaystub(text: string): PaystubData {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const out: PaystubData = { matchedLines: 0 }
  const sums: Partial<Record<'retirement' | 'roth' | 'health' | 'hsa' | 'local', { value: number; sources: string[] }>> = {}
  const matched = new Set<string>()
  const set = <K extends keyof PaystubData>(key: K, value: PaystubData[K]) => {
    if (out[key] === undefined) out[key] = value
  }
  const add = (key: keyof typeof sums, value: number, source: string) => {
    const s = (sums[key] ??= { value: 0, sources: [] })
    s.value += value
    s.sources.push(source)
  }

  // Header order for earnings rows ("Rate Hours" vs "Hours Rate").
  const header = lines.find((l) => /\brate\b/i.test(l) && /\bhours?\b/i.test(l))
  const rateFirst = header ? header.toLowerCase().search(/\brate\b/) < header.toLowerCase().search(/\bhours?\b/) : false

  for (const line of lines) {
    const lower = line.toLowerCase()

    // Dates, frequency and filing status live in free text, not number columns.
    const dates = findDates(line)
    if (!out.payDate && dates.length && /\b(pay|check|advice|deposit)\s*(date|day)\b/i.test(line)) {
      const m = line.match(/\b(pay|check|advice|deposit)\s*(date|day)\b/i)!
      const after = findDates(line.slice(m.index!))
      if (after.length) set('payDate', { value: after[0], source: line.match(PAY_DATE_PHRASE)?.[0] ?? line })
    }
    if (!out.payFrequency) {
      const f = lower.match(/\b(bi-?weekly|semi-?monthly|weekly|monthly|every\s*(two|2)\s*weeks|twice\s*a\s*month)\b/)
      if (f && /\b(pay\s*)?(frequency|period|schedule|cycle)\b|\bpaid\b/.test(lower)) {
        const v = f[1].replace(/[-\s]/g, '')
        const freq: PayFrequency = v.startsWith('bi') || v.startsWith('every') ? 'biweekly' : v.startsWith('semi') || v.startsWith('twice') ? 'semimonthly' : v === 'weekly' ? 'weekly' : 'monthly'
        set('payFrequency', { value: freq, source: line })
      } else if (/\bperiod\b|\bbegin|\bstart|\bend(ing)?\b|\bfrom\b|\bthrough\b|\s[-–]\s/.test(lower) && dates.length >= 2) {
        // Drop the pay date itself (keyword + its date), keeping the period's start and end.
        const nonPayDates = findDates(line.replace(PAY_DATE_PHRASE, ' '))
        if (nonPayDates.length >= 2) {
          const freq = frequencyFromDays(dayDiff(nonPayDates[0], nonPayDates[1]) + 1)
          if (freq) set('payFrequency', { value: freq, source: `Pay period ${nonPayDates[0]} to ${nonPayDates[1]} (${dayDiff(nonPayDates[0], nonPayDates[1]) + 1} days)` })
        }
      }
    }
    const fs = lower.match(/\b(?:marital|filing)\s*status\s*[:-]?\s*(married\s*filing\s*jointly|married|single|head\s*of\s*household|mfj|hoh|s|m)\b/) ??
      lower.match(/\bfed(?:eral)?\s*[:-]\s*(married|single|head\s*of\s*household)\b/)
    if (fs && !/separate/.test(lower)) {
      const v = fs[1].replace(/\s+/g, ' ')
      const status: FilingStatus = v.startsWith('h') ? 'headOfHousehold' : v.startsWith('m') ? 'married' : 'single'
      set('filingStatus', { value: status, source: line.substr(fs.index!, fs[0].length) })
      matched.add(line)
    }

    for (const seg of segmentLine(line)) {
      // A table header from a neighbouring column can run into this label ("... Current YTD IL State Income Tax").
      const headerEnd = [...seg.label.matchAll(/\b(current|ytd|year\s*to\s*date|this\s*period|amount|hours|rate)\b/gi)].pop()
      if (headerEnd && headerEnd.index! + headerEnd[0].length < seg.label.length) seg.label = seg.label.slice(headerEnd.index! + headerEnd[0].length).trim()
      const kind = classify(seg.label)
      if (!kind) continue
      const current = seg.nums[0]
      const ytd = seg.nums.length >= 2 ? seg.nums[seg.nums.length - 1] : undefined
      matched.add(line)
      switch (kind) {
        case 'gross':
          if (!out.grossPay && current > 0) {
            set('grossPay', { value: current, source: segText(seg) })
            if (ytd !== undefined && ytd >= current) set('grossYtd', { value: ytd, source: segText(seg) })
          }
          break
        case 'net':
          set('netPay', { value: current, source: segText(seg) })
          break
        case 'earningsRow': {
          // Hours, rate and amount: the two that multiply to the third.
          if (seg.nums.length >= 3 && !out.hourlyRate) {
            const [a, b, amt] = seg.nums
            if (amt > 0 && Math.abs(a * b - amt) <= Math.max(0.02 * amt, 1)) {
              let [hours, rate] = rateFirst ? [b, a] : [a, b]
              if (frequencyFromHours(rate) && !frequencyFromHours(hours)) [hours, rate] = [rate, hours]
              if (/\b(salary)\b/i.test(seg.label) || frequencyFromHours(hours)) {
                // Salaried stubs list standard hours: use them for frequency only.
                const freq = frequencyFromHours(hours)
                if (freq) set('payFrequency', { value: freq, source: `${hours} hours this period (${segText(seg)})` })
              }
              if (!/\bsalary\b/i.test(seg.label)) {
                set('hourlyRate', { value: rate, source: segText(seg) })
                set('hours', { value: hours, source: segText(seg) })
              }
            }
          }
          break
        }
        case 'retirement':
          add('retirement', current, segText(seg))
          break
        case 'roth':
          add('roth', current, segText(seg))
          break
        case 'health':
          add('health', current, segText(seg))
          break
        case 'hsa':
          add('hsa', current, segText(seg))
          break
        case 'federal':
          set('federalWithholding', { value: current, source: segText(seg) })
          break
        case 'socialSecurity':
          set('socialSecurity', { value: current, source: segText(seg) })
          break
        case 'medicare':
          set('medicare', { value: current, source: segText(seg) })
          break
        case 'state': {
          if (!out.stateWithholding) {
            set('stateWithholding', { value: current, source: segText(seg) })
            const st = stateIn(seg.label)
            if (st) set('state', { value: st, source: segText(seg) })
          }
          break
        }
        case 'local':
          add('local', current, segText(seg))
          break
      }
    }
  }

  const fromSum = (k: keyof typeof sums) => (sums[k] ? { value: round2(sums[k]!.value), source: [...new Set(sums[k]!.sources)].join(' + ') } : undefined)
  out.retirement = fromSum('retirement')
  out.rothRetirement = fromSum('roth')
  out.healthInsurance = fromSum('health')
  out.hsa = fromSum('hsa')
  out.localWithholding = fromSum('local')
  for (const k of Object.keys(out) as (keyof PaystubData)[]) if (out[k] === undefined) delete out[k]

  // State from anywhere on the stub if the tax line didn't name it (e.g. "Work State: CA").
  if (!out.state) {
    const l = lines.find((x) => /\b(work|resident|tax|withholding)\s*state\b/i.test(x))
    const st = l ? stateIn(l.replace(/.*\bstate\b\s*[:-]?/i, '')) : undefined
    if (l && st) out.state = { value: st, source: l }
  }
  out.matchedLines = matched.size
  return out
}

const round2 = (n: number) => Math.round(n * 100) / 100

export const WEEKS_PER_PERIOD: Record<PayFrequency, number> = { weekly: 1, biweekly: 2, semimonthly: 52 / 24, monthly: 52 / 12 }
