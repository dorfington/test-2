const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Whole dollars for large figures, cents below $1,000 (paychecks, small taxes). */
export const money = (n: number, cents = Math.abs(n) < 1000) => (cents ? usd2 : usd0).format(Math.abs(n) < 0.005 ? 0 : n)
export const money0 = (n: number) => usd0.format(Math.abs(n) < 0.5 ? 0 : n)
export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`
