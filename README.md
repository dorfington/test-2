# Take-Home Budget

**Live site: https://dorfington.github.io/test-2/**

A browser-only budget planner: enter salary, state and expenses; it estimates take-home pay and builds a budget. No backend.

> Tax figures are estimates, not tax advice.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + component tests
npm run typecheck
npm run build
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` runs typecheck, lint, tests and the build on every pull request. On pushes to `main`, it publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves (**Settings → Pages → Source: Deploy from a branch → `gh-pages` / root**). The site updates a minute or so after each merge.

The build uses relative asset paths (`base: './'` in `vite.config.ts`), so it works at `https://<user>.github.io/<repo>/` or on a custom domain without changes.

## Using it

1. **Income:** an annual salary, or an hourly rate × hours per week, plus how often you're paid.
2. **Taxes:** filing status, tax year, state, local tax, children, spouse income (married filing jointly), and pre-tax deductions (401(k)/403(b) %, employer match, health premiums, HSA/FSA).
3. **Expenses:** needs, wants and savings & debt (weekly, monthly or yearly), plus optional goals.
4. **Results:**
   - take-home pay per paycheck, month and year
   - a donut of where every dollar goes
   - your split against 50/30/20 and your personalized target
   - recommendations and goal timelines
   - what-if sliders for salary, rent and 401(k) %
   - the gross-to-take-home breakdown
   - CSV/PDF export

Click any step in the stepper to change it later. Everything is saved in your browser's localStorage, and nothing is sent anywhere. "Start over" clears it.

## Pay stub import

On the Income step, **Take a photo** or **Upload photo or PDF** of a recent pay stub. It's read **on the device**: nothing is uploaded.

- **PDFs with a text layer** (downloads from ADP, Workday, Gusto, etc.) are read exactly with pdf.js.
- **Photos and scanned PDFs** are read with Tesseract OCR in a web worker. The engine (~4 MB, one variant chosen for the device's WebAssembly support) and English data (~3 MB) are served from this site (`ocr-assets.ts` copies them from `node_modules` at build time), not from a CDN, and load only on first use.
- `src/paystub/parse.ts` splits each printed row into "label + amounts" segments, so side-by-side tables are read correctly. It then picks out:
  - gross pay and YTD, net pay, pay date, and frequency (from the period dates, the stated frequency or standard hours)
  - hourly rate and hours
  - 401(k)/403(b), with Roth flagged separately
  - health/dental/vision premiums and HSA/FSA
  - federal, state and local withholding
  - the state and the filing status
- Every value is shown with the stub text it came from, and you confirm or edit it before it's applied. A value that couldn't be read is left out, never treated as $0.
- **Withholding check:** tax withheld per paycheck × paychecks per year is compared with the estimated tax, to show a likely refund or balance due.

Tests use hand-written stub layouts, a generated PDF read with pdf.js, and real Tesseract output from a scanned and a photographed stub (`src/paystub/__tests__`).

## Bank & credit card statements

The **Accounts** tab has upload areas for bank statements (checking and savings) and credit card statements; **Insights** analyses them. Everything stays on the device: files are read in the browser, and data is stored in IndexedDB. Account numbers are never stored (at most the last 4 digits).

- **Formats:**
  - **CSV** is read by header name. Tested with Chase (bank and card), Amex, Capital One, Discover, Bank of America (with its summary preamble), Citi, Wells Fargo (no header), Apple Card and US Bank layouts.
  - **OFX/QFX** works in both SGML and XML, using FITIDs and the ledger balance.
  - **PDF statements** are best-effort: signs come from section headings and CR marks, years from the statement period, and the closing balance is read. An import preview shows money in vs. out, with a one-tap flip.
- **Duplicates:** matched by FITID, or by account + date + amount + description + occurrence. Overlapping or repeated imports add nothing twice, and two identical same-day purchases are both kept. Any import can be undone.
- **Categorizing (`src/finance/categorize.ts`):**
  - Your own rules come first.
  - Card payments and transfers are ignored, so purchases aren't counted twice. Matching pairs across your accounts are detected too.
  - Moves to savings or brokerage accounts count as saving.
  - Paychecks and interest count as income, and card credits as refunds.
  - Everything else is matched against merchant patterns for the budget's own categories.
  - Change a category once and it's remembered for that merchant.
- **Insights (`src/finance/analysis.ts`):**
  - actual vs. your plan for any month
  - month-by-month income, spending, saving and savings rate (complete months detected)
  - goal progress from linked accounts' balances
  - recurring charges, with price increases (fixed-price charges only) and possibly canceled ones
  - **Fill in my budget**, from your average real spending
- **Backup (`src/finance/backup.ts`):** an encrypted `.thb` file holding your plan and all account data. It uses PBKDF2-SHA256 (600,000 iterations) and AES-256-GCM in the browser, and can be restored on another device.

## Budget rules

- **Base for 50/30/20:** take-home pay plus pre-tax payroll deductions. Your 401(k)/HSA counts as savings and your health premiums count as needs. The employer match is extra savings, shown separately.
- **Personalized targets:** at or under 50% needs, the plain 50/30/20 split. Above that, needs stay where they are, and the rest goes 40% to savings and 60% to wants. Savings stays between 10 and 20 points of income when there is room.
- **Flags:**
  - spending over take-home pay
  - no emergency fund
  - housing over 30% of gross pay
  - wants over target or savings under target
  - unassigned money
  - a savings goal behind its deadline
  - debt payments that don't cover the interest
- **Goals:**
  - The emergency fund uses your "Emergency fund" lines.
  - The savings goal uses your other savings lines, except extra debt payments.
  - Debt payoff uses minimum plus extra debt payments, with standard amortization at your APR.

## Layout

```
src/taxdata/        one JSON file per tax year + Zod schema (validated on load)
src/engine/         pure tax functions: federal, FICA, state, local, state payroll
src/budget/         budget split, targets, flags, goals (pure)
src/model/          profile schema, conversions, validation, what-if
src/store/          Zustand store persisted to localStorage
src/features/       setup steps and the results dashboard
src/export/         one report model -> CSV and PDF (jsPDF, loaded on demand)
src/finance/        statements: parsers, import/dedupe, categorization, analysis, IndexedDB, encrypted backup
src/paystub/        pay stub reading (pdf.js text layer or on-device OCR) and parsing
```

## Tax engine

`calculateTaxes(input)` in `src/engine/calculate.ts` returns annual figures:

1. **Federal AGI** = wages − 401(k)/403(b) − Section 125 − payroll HSA.
2. **Federal tax** = brackets on (AGI − standard deduction), less the Child Tax Credit (including the refundable part).
3. **FICA**: Social Security on wages less Section 125/HSA, capped per worker; Medicare plus the 0.9% Additional Medicare Tax above the filing-status threshold.
4. **State tax** starts from federal AGI, adds back pre-tax items the state doesn't exclude (PA: 401(k); NJ: Section 125 and HSA; CA: HSA), then applies the state's standard deduction, exemptions (deductions or credits, with phase-outs), federal-tax deduction (AL/MO/OR), brackets, NY-style recapture, Utah's credit, and Vermont's minimum tax.
5. **Local tax**: NYC/Yonkers, Maryland and Indiana counties, Philadelphia, Pittsburgh, Michigan and Ohio cities, Kansas City, St. Louis, Louisville, Lexington, Wilmington, Birmingham, Portland Metro/Multnomah, or a custom wage-tax rate.
6. **State payroll programs**: CA SDI, NY PFL/SDI, NJ UI/TDI/FLI, WA PFML + WA Cares, MA/CT/OR/CO/DE/ME/MN paid leave, RI TDI, AK/PA employee UI, OR transit tax.

What it does not model is listed in each state's `notes` in the data file and is shown in the app.

## Updating tax data each year

All numbers live in `src/taxdata/<year>.json`; the logic has none.

1. Copy the latest file to `<new year>.json` and set `year` and `lastReviewed`.
2. Update every figure, and the `sources` link next to it, from the official publications:
   - Federal: the IRS inflation-adjustment Rev. Proc. (brackets, standard deduction, CTC) and the 401(k) limit release.
   - FICA: the SSA wage base.
   - States: each state's revenue department; the Tax Foundation's annual table is a useful cross-check.
   - Localities and state payroll programs: the agency linked in each entry.
3. Register the file in `src/taxdata/index.ts`.
4. Run `npm test`. Schema validation catches structural mistakes, such as unsorted brackets or a missing state. Add a test for any new official worked example you find.

## How the tests were checked

The expected values come from official publications. Each one is cited in the test:

| Check | Source |
| --- | --- |
| Tax at the midpoints of 2025 tax table rows (single/MFJ/HoH) | IRS 2025 Form 1040 Tax Table |
| Base amounts of the 2026 rate tables, all statuses | IRS Rev. Proc. 2025-32 |
| Worked example (MFJ, $125,000 → $4,768.10) and schedule X/Y/Z bases | CA FTB 2025 Tax Rate Schedules |
| Rate schedule bases and every recapture worksheet constant | NY IT-201 instructions (2025) |
| NYC schedule bases | NY IT-201 instructions |
| Schedule II bases | Comptroller of Maryland, Withholding Tax Facts 2025 |
| 2026 formula (5.21% × income − $966) and deduction phase-out | SC DOR / H.4216 fiscal impact statement |
| County rates | Indiana DOR Departmental Notice #1 |

The end-to-end examples in `calculate.test.ts` are worked by hand from those tables; the arithmetic is written in the comments.
