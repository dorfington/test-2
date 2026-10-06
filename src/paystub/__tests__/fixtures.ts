/** Text as it comes out of real stub layouts (PDF text layer or OCR). */

// ADP-style, salaried, biweekly, California. Rate column comes before hours.
export const ADP_CA = `ACME CORPORATION Earnings Statement
Period Beginning: 09/14/2026 Period Ending: 09/27/2026 Pay Date: 10/02/2026
Filing Status: Single
Earnings rate hours this period year to date
Regular 40.8654 80.00 3,269.23 62,115.37
Gross Pay $3,269.23 62,115.37
Statutory Deductions
Federal Income Tax -310.06 5,891.14
Social Security Tax -195.25 3,709.75
Medicare Tax -45.66 867.54
CA State Income Tax -136.50 2,593.50
CA SDI -42.50 807.50
Other Deductions
401(K) -196.15 3,726.85
Medical -95.00 1,805.00
Dental -15.00 285.00
Vision -10.00 190.00
HSA -50.00 950.00
401K ER Match 98.08 1,863.52
Net Pay $2,173.11`

// Gusto-style, hourly with overtime, weekly, New York City.
export const GUSTO_NYC = `Pay period: Sep 28, 2026 - Oct 4, 2026 Pay day: Oct 9, 2026
Earnings Hours Rate Current YTD
Regular Hours 38.50 22.00 847.00 32,186.00
Overtime 2.00 33.00 66.00 990.00
Gross Earnings 913.00 33,176.00
Employee Taxes
Federal Income Tax 58.12 2,208.56
Social Security 56.61 2,056.91
Medicare 13.24 481.05
NY Withholding 37.85 1,438.30
NYC Withholding 26.10 991.80
NY Paid Family Leave 3.94 143.32
NY Disability 0.60 22.80
Pre-Tax Deductions
Medical Insurance 42.00 1,596.00
401k 45.65 1,658.80
Roth 401k 20.00 760.00
Net Pay 609.89`

// Phone photo of a semimonthly stub (Texas), OCR'd: two tables side by side, an O for a 0.
export const OCR_SIDE_BY_SIDE = `PAY DATE 10/15/2026   PERIOD 10/01/2026 - 10/15/2026
EARNINGS CURRENT YTD   DEDUCTIONS CURRENT YTD
Salary 2,916.67 55,416.73   FED W/H 301.12 5,721.28
GROSS PAY 2,916.67 55,416.73   SOC SEC 180.83 3,435.77
NET PAY 2,112.43   MEDICARE 42.29 803.51
403(b) 175.00 3,325.00   Dental 12.5O 237.50   Med Ins 88.00 1,672.00
Work State: TX   Fed Marital Status: Married`

// Real Tesseract output (this app's OCR settings) for a generated two-column stub:
// a clean scan, and a tilted, blurred "phone photo" of the same stub.
// Note how the right column's state tax row merges with the left column's header row.
export const TESSERACT_SCAN = "NORTHWIND TRADERS LLC\nEarnings Statement\nEmployee: Jordan Lee                                                                 Pay Date: 10/02/2026\nPay Period: 09/14/2026 - 09/27/2026                                                 Federal Filing Status: Single\nEarnings                  Hours          Current                 YTD         Taxes                                           Current                YTD\nSalary                            80.00           2,692.31            51,153.89           Federal Income Tax                               221.42            4,206.98\nGross Pay                               2,692.31         51,153.89        Social Security                              157.53         2,993.07\n]                                                                      Medicare                                          36.84             699.96\n_Pre-TaxDeductions ~~~ Current ~~ YTD gizie Income Tax                             117.22           2,227.18\n401(k)                                             134.62          2,557.78\nMedical                                             88.50          1,681.50         Net Pay                                                      1,884.93\nDental                                               11.25            213.75\nHSA                                                 40.00            760.00\n"

export const TESSERACT_PHOTO = "NORTHWIND TRADERS LLC\nEamings Statement\nEmployee: Jordan Lee                                                                             Pay Date: 10/02/2026\nPay Period: 09/14/2026 - 09/27/2026                                                  Federal Filing Status: Single\nEarnings                   Hours           Current                   YTD         Taxes                                               Current                 YTD\nSalary                            80.00           2,692.31            51,153.89           Federal Income Tax                               221.42            4,206.98\nGross Pay                                   2,692.31          51,153.89         Social Security                                  157.53          2,993.07\nMedicare                                              36.84              699.96\nPreTaxDeductions  Cument ~~ YTD yi state income Tax                            n722 222118\n401(k)                                                 134.62          2,557.78\nMedical                                                      88.50            1,681.50           Net Pay                                                                 1,884.93\nDental                                                   11.25             213.75\nHSA                                                     40.00             760.00\n"
