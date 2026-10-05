/**
 * Categorizes transactions into the budget's own categories (needs / wants /
 * savings and expense kinds), and separates income, refunds and transfers
 * (including credit card payments) so nothing is counted twice.
 *
 * Order: your own rules (learned from your corrections) -> transfers and
 * card payments -> income -> merchant patterns -> uncategorized.
 */
import { EXPENSE_KINDS, type Category, type ExpenseKind } from '../model/profile'
import type { AccountKind, Rule, TxnType } from './types'

export interface Categorization {
  type: TxnType
  category: Category | null
  kind: ExpenseKind | null
  categorizedBy: 'auto' | 'rule' | 'user'
}

// ---------- payee cleanup ----------

const PREFIXES = [
  /^(pos|debit card|check ?card|visa|recurring|ach|ppd|web|electronic)\s+(purchase|debit|credit|pmt|payment|withdrawal|transaction)?\s*(authorized on \d{1,2}\/\d{1,2})?\s*/i,
  /^purchase (authorized )?on \d{1,2}\/\d{1,2}\s*/i,
  /^(pos|ach|debit|dbt|chk|checkcard|card)\s+\d{4}\s*/i,
  /^(sq|tst|sp|pp|dd|ic|py|par|pos|fs|bt|in|ck|gp|tm)\s?\*\s*/i,
  /^paypal\s*\*\s*/i,
]

const SUFFIXES = [
  /\s+(#|store\s*#?|no\.?)\s*\d+.*$/i, // store numbers and everything after
  /\s+\d{3}[-.\s]?\d{3}[-.\s]?\d{4}.*$/, // phone numbers
  /\s+x{2,}\d{2,4}.*$/i, // masked card/account numbers
  /\s+\d{5,}.*$/, // long reference numbers
  /\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?.*$/, // dates
  // "CITY ST": one-word city, or a two-word city with a known first word (San Jose, New York, St Louis...).
  /\s+(?:(?:SAN|SANTA|LOS|LAS|NEW|ST|SAINT|FORT|FT|EL|PALO|LONG|SALT|KANSAS|OKLAHOMA|JERSEY|CORPUS|BATON|COLORADO|GRAND|SIOUX|ANN|BEVERLY|CEDAR|DES|PORT|WEST|EAST|NORTH|SOUTH|MOUNT|MT|LA|LE|BOCA|CAPE|DALY|ELK|HOT|IOWA|LAKE|MESA|OVERLAND|PEMBROKE|ROUND|SILVER|SIMI|THOUSAND|VIRGINIA|WEST)\s+)?[A-Z][A-Za-z.']*\s+(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$/i,
  /\s+(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])$/, // trailing state
  /\s*\*\s*[A-Z0-9]{6,}$/i, // "AMZN Mktp US*2K4LJ1"
  /\s+\d{2,4}$/, // short store numbers ("CHIPOTLE 2345")
  /\.com\b.*$/i,
]

const KNOWN: [RegExp, string][] = [
  [/\bamzn|amazon\b(?!\s*prime)/i, 'Amazon'],
  [/amazon\s*prime|prime\s*video/i, 'Amazon Prime'],
  [/\bnetflix/i, 'Netflix'],
  [/\bspotify/i, 'Spotify'],
  [/apple\.com\/bill|apple\s*services/i, 'Apple'],
  [/\buber\s*\*?\s*eats|ubereats/i, 'Uber Eats'],
  [/\buber\b/i, 'Uber'],
  [/\blyft\b/i, 'Lyft'],
  [/\bdoordash|dd\s*\*?doordash/i, 'DoorDash'],
  [/\bstarbucks/i, 'Starbucks'],
  [/\bwhole\s*f(oo)?ds|wholefds/i, 'Whole Foods'],
  [/\btrader\s*joe/i, "Trader Joe's"],
  [/\bwal-?mart|wm\s*supercenter/i, 'Walmart'],
  [/\btarget\b/i, 'Target'],
  [/\bcostco/i, 'Costco'],
  [/\bvenmo/i, 'Venmo'],
  [/\bzelle/i, 'Zelle'],
  [/\bcash\s*app|square\s*cash/i, 'Cash App'],
]

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Llc|Inc|Co)\b\.?/g, (w) => w.toUpperCase())

/** "SQ *BLUE BOTTLE COFFEE #123 OAKLAND CA" -> "Blue Bottle Coffee". */
export function cleanPayee(description: string): string {
  for (const [re, name] of KNOWN) if (re.test(description)) return name
  let s = description.replace(/\s+/g, ' ').trim()
  for (const re of PREFIXES) s = s.replace(re, '')
  for (let pass = 0; pass < 2; pass++) {
    for (const re of SUFFIXES) {
      const next = s.replace(re, '')
      if (next.trim()) s = next // never strip the whole name
    }
  }
  s = s.replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim()
  const words = s.split(' ').slice(0, 4).join(' ')
  return titleCase(words || description.slice(0, 30))
}

/** Grouping key for rules and recurring detection. */
export const payeeKey = (payee: string) => payee.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

// ---------- rules ----------

const CARD_ISSUERS = /chase\s*card|chase\s*credit|amex|american\s*express|capital\s*one|citi\s*(card|cards)?|discover|barclay|synchrony|apple\s*card|applecard|gs\s*bank|goldman|wells\s*fargo\s*card|bk\s*of\s*amer|bank\s*of\s*america\s*(visa|card)|us\s*bank\s*card|cardmember\s*serv|credit\s*card/i
const CARD_PAYMENT = /\b(payment|pymt|pmt|epay|e-payment|autopay|auto\s*pay|crcardpmt|card\s*pmt)\b/i
const ON_CARD_PAYMENT = /payment|thank you|autopay|auto pay|pymt/i
const TRANSFER = /\b(transfer|xfer|tfr|trnsfr)\b|\bonline\s*banking\s*(transfer|payment\s*to\s*(sav|chk))|\bfrom\s*(checking|savings|share)\b|\bto\s*(checking|share)\b/i
const TO_SAVINGS = /\b(to\s*(sav|savings|share\s*sav)|savings\s*(xfer|transfer|deposit))\b/i
const BROKERAGE = /\b(vanguard|fidelity|schwab|robinhood|betterment|wealthfront|acorns|stash|e\s*\*?\s*trade|m1\s*finance|coinbase|ally\s*invest|merrill|edward\s*jones|tiaa|sofi\s*invest)\b/i
const PAYROLL = /\b(payroll|dir\s*dep|direct\s*dep(osit)?|salary|paychex|adp|gusto|intuit\s*payroll|wages|net\s*pay|ppd\s*pay|bamboo\s*hr|workday|trinet|justworks|rippling)\b/i
const OTHER_INCOME = /\b(interest\s*(paid|payment|earned)|int\s*paid|dividend|irs\s*treas|tax\s*ref|refund|cashback|cash\s*back|reward)\b/i
const P2P = /\b(venmo|zelle|cash\s*app|square\s*cash|paypal)\b/i

const MERCHANTS: [ExpenseKind, RegExp][] = [
  ['housing', /\b(rent|apartments?|apts?|property\s*(mgmt|management)|mortgage|mtg|hoa|homeowners?\s*assoc|rentcafe|appfolio|yardi|bilt|avail\s*rent|rocket\s*mortgage|mr\.?\s*cooper|loan\s*servic\w*)\b/i],
  ['utilities', /\b(electric|energy|power|gas\s*(co|company|service)|natural\s*gas|water|sewer|pg&?e|con\s*ed|comed|duke\s*energy|xcel|national\s*grid|eversource|dominion|fpl|socalgas|atmos|waste\s*(mgmt|management)|republic\s*services|utilit(y|ies)|util)\b/i],
  ['phone', /\b(verizon|at&?t|t-?mobile|sprint|comcast|xfinity|spectrum|cox\s*comm\w*|centurylink|frontier\s*comm\w*|google\s*fi|mint\s*mobile|visible|cricket|optimum|starlink|fios|internet|wireless)\b/i],
  ['insurance', /\b(geico|progressive|state\s*farm|allstate|liberty\s*mutual|usaa|farmers\s*ins\w*|nationwide|lemonade|insurance|ins\s*prem\w*|metlife|prudential)\b/i],
  ['car', /\b(auto\s*loan|toyota\s*(fin|financial)|honda\s*(fin|financial)|ford\s*credit|gm\s*financial|ally\s*(auto|paymt)|carmax\s*auto|tesla\s*(finance|motors)|nissan\s*(fin|motor\s*acc)|hyundai\s*(capital|motor\s*fin)|jiffy\s*lube|autozone|firestone|valvoline|pep\s*boys|o'?reilly\s*auto|car\s*wash|dmv)\b/i],
  ['minDebt', /\b(navient|nelnet|mohela|aidvantage|great\s*lakes|sallie\s*mae|sofi\s*loan|student\s*ln|dept\s*(of\s*)?education|affirm|klarna|afterpay|lendingclub|upstart|prosper|personal\s*loan)\b/i],
  ['subscriptions', /\b(netflix|spotify|hulu|disney\s*\+?|disneyplus|hbo|max\.com|paramount|peacock|apple\s*one|icloud|youtube\s*(premium|tv)|google\s*\*?\s*(storage|one|youtube)|amazon\s*prime|prime\s*video|audible|kindle\s*unl\w*|sirius|patreon|substack|nytimes|ny\s*times|wsj|adobe|microsoft\s*(365|\*)|dropbox|chatgpt|openai|anthropic|claude\.ai|planet\s*fitness|equinox|peloton|gym|fitness|crunch|orangetheory|duolingo|headspace|calm\.com)\b/i],
  ['groceries', /\b(whole\s*foods|wholefds|trader\s*joe'?s?|kroger|safeway|publix|aldi|wegmans|h-?e-?b|costco|sam'?s\s*club|food\s*lion|giant\s*(eagle|food)?|stop\s*&?\s*shop|sprouts|meijer|winco|ralphs|albertsons|vons|fred\s*meyer|harris\s*teeter|hy-?vee|instacart|grocery|groceries|supermarket|food\s*4\s*less|shoprite|market\s*basket|piggly|smart\s*&\s*final)\b/i],
  ['dining', /\b(doordash|uber\s*eats|grubhub|postmates|caviar|seamless|starbucks|dunkin|mcdonald'?s?|chipotle|chick-?fil-?a|taco\s*bell|wendy'?s|burger\s*king|subway|panera|domino'?s|pizza|sweetgreen|shake\s*shack|restaurant|cafe|caf[eé]|coffee|grill|kitchen|diner|sushi|taqueria|brewing|brewery|bakery|deli|bistro|tavern|pub|bar\b|eatery|noodle|ramen|bbq|wingstop|panda\s*express|five\s*guys|in-?n-?out|culver|jersey\s*mike|jimmy\s*john|popeyes|kfc|arby|sonic\s*drive|dutch\s*bros|peet'?s|tim\s*hortons|blue\s*bottle)\b/i],
  ['gas', /\b(shell|exxon|mobil|chevron|bp|sunoco|citgo|marathon|valero|speedway|wawa|sheetz|quiktrip|qt|circle\s*k|7-?eleven|arco|phillips\s*66|conoco|texaco|casey'?s|gas|fuel|uber|lyft|mta|metro|transit|bart|clipper|ventra|parking|parkmobile|spothero|toll|e-?z\s*pass|sunpass|fastrak|ipass)\b/i],
  ['healthcare', /\b(cvs|walgreens|rite\s*aid|pharmacy|dental|dentist|dds|medical|hospital|clinic|doctor|md\b|urgent\s*care|labcorp|quest\s*diag\w*|kaiser|optum|optometr\w*|eye\s*care|therap\w*|physicians?|pediatric\w*|dermatolog\w*|orthodont\w*|chiropract\w*|health)\b/i],
  ['travel', /\b(airlines?|delta\s*air|united\s*air|american\s*air|southwest|jetblue|alaska\s*air|spirit\s*air|frontier\s*air|airbnb|vrbo|marriott|hilton|hyatt|ihg|holiday\s*inn|hotels?|motel|inn\b|resort|expedia|booking\.com|hotels\.com|kayak|priceline|amtrak|greyhound|hertz|avis|enterprise\s*rent|budget\s*rent|national\s*car|turo|tsa\s*pre)\b/i],
  ['entertainment', /\b(amc|regal|cinemark|cinema|theat(er|re)|ticketmaster|stubhub|seatgeek|eventbrite|live\s*nation|steam\s*(games|purchase)|steampowered|playstation|xbox|nintendo|bowl(ing)?|museum|concert|golf|top\s*golf|dave\s*&\s*buster)\b/i],
  ['shopping', /\b(amazon|amzn|target|walmart|wal-?mart|best\s*buy|apple\s*store|ikea|home\s*depot|lowe'?s|etsy|ebay|nordstrom|macy'?s|kohl'?s|tj\s*maxx|marshalls|ross\s*stores|old\s*navy|gap\b|zara|h&m|uniqlo|nike|sephora|ulta|wayfair|chewy|petco|petsmart|dollar\s*tree|dollar\s*general|shein|temu|costco\s*online|bed\s*bath|michaels|hobby\s*lobby|staples|office\s*depot|rei\b|dick'?s\s*sporting|apple\.com(?!\/bill))\b/i],
]
const FEES = /\b(fee|overdraft|nsf|interest\s*charge|finance\s*charge|late\s*charge|annual\s*fee|service\s*charge)\b/i

const expense = (kind: ExpenseKind): Categorization => ({ type: 'expense', kind, category: EXPENSE_KINDS[kind].category, categorizedBy: 'auto' })

export function categorize(description: string, payee: string, amount: number, accountKind: AccountKind, rules: Rule[]): Categorization {
  const key = payeeKey(payee)
  const rule = rules.find((r) => r.payeeKey === key)
  if (rule) return { type: rule.type, category: rule.category, kind: rule.kind, categorizedBy: 'rule' }

  const d = description
  const inflow = amount > 0

  // Card payments: excluded on both sides (the card's purchases are what count).
  if (accountKind === 'credit' && inflow && ON_CARD_PAYMENT.test(d)) return { type: 'transfer', category: null, kind: null, categorizedBy: 'auto' }
  if (accountKind !== 'credit' && !inflow && CARD_PAYMENT.test(d) && CARD_ISSUERS.test(d)) return { type: 'transfer', category: null, kind: null, categorizedBy: 'auto' }

  // Money moved to savings or investments is saving, not spending.
  if (!inflow && BROKERAGE.test(d)) return expense('investing')
  if (!inflow && TO_SAVINGS.test(d) && accountKind !== 'savings') return expense('emergencyFund')
  if (TRANSFER.test(d) && !P2P.test(d)) return { type: 'transfer', category: null, kind: null, categorizedBy: 'auto' }

  if (inflow) {
    if (accountKind === 'credit') {
      // Money back on a card is a refund of a purchase: it reduces that category's spending.
      const m = MERCHANTS.find(([, re]) => re.test(d))
      return { type: 'refund', kind: m ? m[0] : null, category: m ? EXPENSE_KINDS[m[0]].category : null, categorizedBy: 'auto' }
    }
    if (PAYROLL.test(d) || OTHER_INCOME.test(d) || P2P.test(d)) return { type: 'income', category: null, kind: null, categorizedBy: 'auto' }
    const m = MERCHANTS.find(([, re]) => re.test(d))
    if (m) return { type: 'refund', kind: m[0], category: EXPENSE_KINDS[m[0]].category, categorizedBy: 'auto' }
    return { type: 'income', category: null, kind: null, categorizedBy: 'auto' }
  }

  for (const [kind, re] of MERCHANTS) if (re.test(d)) return expense(kind)
  if (FEES.test(d)) return { type: 'expense', kind: 'other', category: 'needs', categorizedBy: 'auto' }
  return { type: 'expense', category: null, kind: null, categorizedBy: 'auto' }
}
