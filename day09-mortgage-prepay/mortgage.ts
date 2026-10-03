// Mortgage maths. Pure functions, no rounding in the middle: values are rounded only when shown.
// One period = one month, monthly rate = annual rate / 12.

export type Method = 'annuity' | 'equal-principal'
/** none: no prepayment · shorten: keep the payment, finish earlier · reduce: keep the term, lower the payment */
export type Mode = 'none' | 'shorten' | 'reduce'

export type Loan = {
  /** yuan */
  principal: number
  years: number
  /** percent per year, e.g. 3.5 */
  annualRate: number
  method: Method
  /** First payment: year and month (1–12). */
  startYear: number
  startMonth: number
  /** Periods already paid. */
  paid: number
}

/** A lump sum paid right after the regular payment of period `at` (absolute period number). */
export type Prepayment = { amount: number; at: number }

export type Row = {
  period: number
  year: number
  month: number
  payment: number
  principal: number
  interest: number
  /** Extra principal paid after this period's regular payment. */
  prepay: number
  /** Balance after the payment and any prepayment. */
  balance: number
  /** true for periods that are already behind us */
  past: boolean
}

export const periods = (l: Loan) => Math.round(l.years * 12)
export const monthlyRate = (l: Loan) => l.annualRate / 100 / 12

/** Year and month of a period (period 1 = the first payment month). */
export function dateOf(l: Loan, period: number) {
  const idx = l.startYear * 12 + (l.startMonth - 1) + (period - 1)
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** Period number of a calendar month. */
export function periodOf(l: Loan, year: number, month: number) {
  return year * 12 + (month - 1) - (l.startYear * 12 + (l.startMonth - 1)) + 1
}

/** Level payment for `balance` over `n` periods at monthly rate `r`. */
export function annuityPayment(balance: number, r: number, n: number) {
  if (n <= 0) return balance
  if (r === 0) return balance / n
  const g = Math.pow(1 + r, n)
  return (balance * r * g) / (g - 1)
}

/**
 * Every period of the loan, from the first one. Periods up to `loan.paid` follow the original plan;
 * after that the chosen prepayments are applied in time order.
 */
export function schedule(loan: Loan, prepayments: Prepayment[], mode: Mode): Row[] {
  const N = periods(loan)
  const r = monthlyRate(loan)
  const rows: Row[] = []
  const plan = mode === 'none' ? [] : [...prepayments].filter((p) => p.amount > 0).sort((a, b) => a.at - b.at)

  let balance = loan.principal
  let pay = annuityPayment(loan.principal, r, N) // annuity: current level payment
  let slice = loan.principal / N // equal principal: current principal per period

  for (let t = 1; t <= N && balance > 1e-9; t++) {
    const interest = balance * r
    let principal: number
    let payment: number
    if (loan.method === 'annuity') {
      payment = Math.min(pay, balance + interest)
      principal = payment - interest
    } else {
      principal = Math.min(slice, balance)
      payment = principal + interest
    }
    if (t === N) {
      // The last period of the original term clears whatever is left (floating point dust).
      principal = balance
      payment = principal + interest
    }
    balance -= principal

    let prepay = 0
    if (t > loan.paid) {
      for (const p of plan) {
        if (p.at !== t || balance <= 0) continue
        const amt = Math.min(p.amount, balance)
        prepay += amt
        balance -= amt
        if (balance < 1e-9) balance = 0
      }
      if (prepay > 0 && balance > 0 && mode === 'reduce') {
        const left = N - t
        if (loan.method === 'annuity') pay = annuityPayment(balance, r, left)
        else slice = balance / left
      }
    }
    const d = dateOf(loan, t)
    rows.push({ period: t, year: d.year, month: d.month, payment, principal, interest, prepay, balance, past: t <= loan.paid })
  }
  return rows
}

export type Summary = {
  /** Interest still to be paid from now on. */
  remainingInterest: number
  /** Payment in the first period after the last prepayment (or the next one when there is none). */
  payment: number
  /** Last period and its calendar month. */
  lastPeriod: number
  endYear: number
  endMonth: number
  /** Sum of the prepayments actually applied. */
  prepaid: number
}

export function summary(loan: Loan, rows: Row[]): Summary {
  const future = rows.filter((r) => !r.past)
  let lastPrepay = loan.paid
  for (const r of future) if (r.prepay > 0) lastPrepay = r.period
  const next = future.find((r) => r.period > lastPrepay) ?? future[0] ?? rows[rows.length - 1]
  const last = rows[rows.length - 1]
  return {
    remainingInterest: future.reduce((s, r) => s + r.interest, 0),
    payment: next?.payment ?? 0,
    lastPeriod: last?.period ?? 0,
    endYear: last?.year ?? loan.startYear,
    endMonth: last?.month ?? loan.startMonth,
    prepaid: future.reduce((s, r) => s + r.prepay, 0),
  }
}

/** Remaining balance after each period from `from` on, for the chart. */
export function balances(rows: Row[], from: number) {
  return rows.filter((r) => r.period >= from).map((r) => ({ period: r.period, balance: r.balance }))
}

/** 提前 N 年 M 个月 */
export function monthsText(months: number) {
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y ? `${y} 年` : '', m ? `${m} 个月` : ''].filter(Boolean).join(' ') || '0 个月'
}

export const yuan = (v: number) => v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** CSV with a byte order mark so Excel reads the Chinese headers correctly. */
export function toCsv(rows: Row[]) {
  const head = ['期数', '年月', '月供', '本金', '利息', '提前还款', '剩余本金']
  const f = (v: number) => v.toFixed(2)
  const lines = rows.map((r) =>
    [r.period, `${r.year}-${String(r.month).padStart(2, '0')}`, f(r.payment), f(r.principal), f(r.interest), f(r.prepay), f(r.balance)].join(','),
  )
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n'
}
