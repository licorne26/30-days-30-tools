import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download, Plus, ShieldCheck, TriangleAlert, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Chart, type Series } from './chart'
import {
  balances,
  dateOf,
  monthsText,
  periodOf,
  periods,
  schedule,
  summary,
  toCsv,
  yuan,
  type Loan,
  type Method,
  type Mode,
  type Prepayment,
  type Row,
  type Summary,
} from './mortgage'

const YEARS = [10, 20, 25, 30]
const MAX_PREPAY = 3
const METHODS: { value: Method; label: string }[] = [
  { value: 'annuity', label: '等额本息' },
  { value: 'equal-principal', label: '等额本金' },
]
const PLANS: { value: Mode; label: string }[] = [
  { value: 'none', label: '不提前还' },
  { value: 'shorten', label: '缩短年限' },
  { value: 'reduce', label: '减少月供' },
]

const inputCls =
  'border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm tabular-nums outline-none focus-visible:ring-[3px] aria-invalid:border-destructive'

type Pre = { amount: string; ym: string } // ym '' = next month
type Form = {
  amount: string
  years: string
  rate: string
  method: Method
  start: string // YYYY-MM
  paid: string // '' = from today's date
  pre: Pre[]
}

const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`
const parseYm = (s: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  return m ? { year: +m[1], month: +m[2] } : null
}

function defaults(): Form {
  const now = new Date()
  const idx = now.getFullYear() * 12 + now.getMonth() - 35 // 36 periods paid, the current month included
  return {
    amount: '100',
    years: '30',
    rate: '3.5',
    method: 'annuity',
    start: ym(Math.floor(idx / 12), (idx % 12) + 1),
    paid: '',
    pre: [{ amount: '20', ym: '' }],
  }
}

/** Every input lives in the URL, so a refresh or a shared link brings the same numbers back. */
function fromUrl(): Form {
  const d = defaults()
  const q = new URLSearchParams(location.search)
  const pre = q.getAll('pre').map((s) => {
    const [amount, when = ''] = s.split('@')
    return { amount, ym: when }
  })
  return {
    amount: q.get('amount') ?? d.amount,
    years: q.get('years') ?? d.years,
    rate: q.get('rate') ?? d.rate,
    method: q.get('method') === 'equal-principal' ? 'equal-principal' : 'annuity',
    start: q.get('start') ?? d.start,
    paid: q.get('paid') ?? d.paid,
    pre: q.has('amount') || pre.length ? pre.slice(0, MAX_PREPAY) : d.pre,
  }
}

function toUrl(f: Form) {
  const q = new URLSearchParams({ amount: f.amount, years: f.years, rate: f.rate, method: f.method, start: f.start })
  if (f.paid) q.set('paid', f.paid)
  for (const p of f.pre) q.append('pre', `${p.amount}@${p.ym}`)
  return `${location.pathname}?${q}`
}

/** Tween a number so a changed result rolls instead of jumping. */
function useRolling(target: number) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (reduced) return
    const start = from.current
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / 500)
      const v = start + (target - start) * (1 - Math.pow(1 - t, 3))
      from.current = v
      setShown(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced])
  return reduced ? target : shown
}

function Money({ value, className }: { value: number; className?: string }) {
  const v = useRolling(value)
  return <span className={cn('tabular-nums', className)}>{yuan(v)}</span>
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T | null
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="bg-muted inline-flex flex-wrap gap-1 rounded-lg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </label>
  )
}

const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
const dateText = (y: number, m: number) => `${y} 年 ${m} 月`

export function App() {
  const [f, setF] = useState<Form>(fromUrl)
  const [plan, setPlan] = useState<Mode>('shorten')
  const [open, setOpen] = useState<Set<number>>(new Set())

  useEffect(() => history.replaceState(null, '', toUrl(f)), [f])
  const set = (patch: Partial<Form>) => setF((p) => ({ ...p, ...patch }))

  const start = parseYm(f.start)
  const years = num(f.years)
  const amount = num(f.amount)
  const rate = num(f.rate)

  const calc = useMemo(() => {
    if (!start || !(amount > 0) || !(years >= 1 && years <= 40) || !(rate >= 0 && rate <= 30)) return null
    const base: Loan = {
      principal: amount * 1e4,
      years,
      annualRate: rate,
      method: f.method,
      startYear: start.year,
      startMonth: start.month,
      paid: 0,
    }
    const N = periods(base)
    const now = new Date()
    const auto = periodOf(base, now.getFullYear(), now.getMonth() + 1) // this month's payment counts as paid
    const paidRaw = f.paid.trim() === '' ? auto : num(f.paid)
    if (!Number.isFinite(paidRaw) || paidRaw < 0) return null
    const paid = Math.min(Math.max(0, Math.round(paidRaw)), N - 1)
    const loan: Loan = { ...base, paid }
    const pre: Prepayment[] = f.pre
      .map((p) => {
        const a = num(p.amount) * 1e4
        const w = parseYm(p.ym)
        const at = w ? Math.min(N, Math.max(paid + 1, periodOf(loan, w.year, w.month))) : paid + 1
        return { amount: a, at }
      })
      .filter((p) => p.amount > 0)
    const rows = { none: schedule(loan, pre, 'none'), shorten: schedule(loan, pre, 'shorten'), reduce: schedule(loan, pre, 'reduce') }
    const sums = { none: summary(loan, rows.none), shorten: summary(loan, rows.shorten), reduce: summary(loan, rows.reduce) }
    return { loan, pre, rows, sums, auto, N }
  }, [f, start, amount, years, rate])

  const invalid = (v: number, lo: number, hi: number) => !(v >= lo && v <= hi)

  const csv = (rows: Row[]) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    a.download = `还款计划-${PLANS.find((p) => p.value === plan)!.label}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const setPre = (i: number, patch: Partial<Pre>) => set({ pre: f.pre.map((p, k) => (k === i ? { ...p, ...patch } : p)) })

  return (
    <div className="space-y-6">
      <Card className="py-5">
        <CardContent className="space-y-5 px-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="贷款金额（万元）">
              <input inputMode="decimal" aria-label="贷款金额" value={f.amount} aria-invalid={invalid(amount, 0.0001, 1e5)} onChange={(e) => set({ amount: e.target.value })} className={inputCls} />
            </Field>
            <Field label="贷款年限（年）">
              <input inputMode="numeric" aria-label="贷款年限" value={f.years} aria-invalid={invalid(years, 1, 40)} onChange={(e) => set({ years: e.target.value })} className={inputCls} />
            </Field>
            <Field label="年利率（%）" hint="以你的合同利率为准">
              <input inputMode="decimal" aria-label="年利率" value={f.rate} aria-invalid={invalid(rate, 0, 30)} onChange={(e) => set({ rate: e.target.value })} className={inputCls} />
            </Field>
            <Field label="首次还款年月">
              <input type="month" aria-label="首次还款年月" value={f.start} onChange={(e) => set({ start: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">常用年限</span>
              <Segmented value={YEARS.includes(years) ? years : null} options={YEARS.map((y) => ({ value: y, label: `${y} 年` }))} onChange={(y) => set({ years: String(y) })} />
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">还款方式</span>
              <Segmented value={f.method} options={METHODS} onChange={(m) => set({ method: m })} />
            </div>
            <div className="grid w-40 gap-1.5">
              <Field label="已还期数" hint={f.paid.trim() === '' && calc ? `按今天算：${calc.loan.paid} 期` : undefined}>
                <input inputMode="numeric" aria-label="已还期数" placeholder={calc ? String(calc.auto) : ''} value={f.paid} onChange={(e) => set({ paid: e.target.value })} className={inputCls} />
              </Field>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <span className="text-sm font-medium">提前还款</span>
            {f.pre.map((p, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <span className="text-muted-foreground w-12 pb-2 text-sm">第 {i + 1} 笔</span>
                <label className="grid w-36 gap-1.5">
                  <span className="text-muted-foreground text-xs">金额（万元）</span>
                  <input inputMode="decimal" aria-label={`提前还款金额 ${i + 1}`} value={p.amount} onChange={(e) => setPre(i, { amount: e.target.value })} className={inputCls} />
                </label>
                <label className="grid w-44 gap-1.5">
                  <span className="text-muted-foreground text-xs">时间{p.ym === '' && '（下个月）'}</span>
                  <input type="month" aria-label={`提前还款时间 ${i + 1}`} value={p.ym} onChange={(e) => setPre(i, { ym: e.target.value })} className={inputCls} />
                </label>
                {p.ym !== '' && (
                  <Button variant="ghost" size="sm" onClick={() => setPre(i, { ym: '' })}>
                    下个月
                  </Button>
                )}
                {f.pre.length > 1 && (
                  <Button variant="ghost" size="icon" aria-label={`删除第 ${i + 1} 笔`} onClick={() => set({ pre: f.pre.filter((_, k) => k !== i) })}>
                    <X />
                  </Button>
                )}
              </div>
            ))}
            {f.pre.length < MAX_PREPAY && (
              <Button variant="outline" size="sm" onClick={() => set({ pre: [...f.pre, { amount: '', ym: '' }] })}>
                <Plus />
                再加一次
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!calc ? (
        <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm">
          <TriangleAlert className="size-4 shrink-0" />
          请把贷款金额、年限（1–40 年）、年利率、首次还款年月和已还期数填完整。
        </div>
      ) : (
        <>
          <Results calc={calc} />

          <Card className="py-5">
            <CardContent className="space-y-3 px-5">
              <h2 className="text-sm font-medium">剩余本金曲线</h2>
              <Chart
                from={calc.loan.paid}
                label={(p) => {
                  const d = dateOf(calc.loan, Math.max(1, p))
                  return `${d.year}年${d.month}月`
                }}
                series={
                  [
                    { key: 'none', label: '不提前还', color: 'var(--muted-foreground)', dash: '6 5', points: balances(calc.rows.none, calc.loan.paid) },
                    { key: 'shorten', label: '缩短年限', color: 'var(--success)', points: balances(calc.rows.shorten, calc.loan.paid) },
                    { key: 'reduce', label: '减少月供', color: 'var(--primary)', points: balances(calc.rows.reduce, calc.loan.paid) },
                  ] satisfies Series[]
                }
              />
            </CardContent>
          </Card>

          <Card className="py-5">
            <CardContent className="space-y-4 px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium">还款计划表</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented value={plan} options={PLANS} onChange={setPlan} />
                  <Button variant="outline" size="sm" onClick={() => csv(calc.rows[plan])}>
                    <Download />
                    导出 CSV
                  </Button>
                </div>
              </div>
              <Schedule rows={calc.rows[plan]} open={open} setOpen={setOpen} firstOpen={calc.rows[plan].find((r) => !r.past)?.year} />
            </CardContent>
          </Card>
        </>
      )}

      <div className="text-muted-foreground space-y-1.5 text-xs leading-relaxed">
        <p>计算按每月一期，月利率 = 年利率 ÷ 12；提前还款在当月正常还款之后，按剩余本金一次性还入。银行的实际计息和舍入方式可能不同，结果仅供估算，以银行为准。本工具不构成任何理财或贷款建议。</p>
        <p className="flex gap-1.5">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          所有数据只在你的浏览器里计算，不会上传到任何地方；输入保存在网址参数里，刷新或分享链接就能还原。
        </p>
      </div>
    </div>
  )
}

type Calc = {
  loan: Loan
  pre: Prepayment[]
  rows: Record<Mode, Row[]>
  sums: Record<Mode, Summary>
  auto: number
  N: number
}

function Results({ calc }: { calc: Calc }) {
  const { sums } = calc
  const n = sums.none
  const sh = sums.shorten
  const re = sums.reduce
  const earlier = n.lastPeriod - sh.lastPeriod
  const saveSh = n.remainingInterest - sh.remainingInterest
  const saveRe = n.remainingInterest - re.remainingInterest
  const lower = n.payment - re.payment
  const none = calc.pre.length === 0

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <ResultCard title="不提前还" tone="plain">
        <Stat label="剩余总利息" big={<Money value={n.remainingInterest} />} />
        <Stat label="每月月供" value={<Money value={n.payment} />} />
        <Stat label="结清时间" value={dateText(n.endYear, n.endMonth)} />
      </ResultCard>
      <ResultCard title="缩短年限" hint="月供不变" tone="good">
        <Stat label="比不还省利息" big={<Money value={saveSh} className="text-success" />} />
        <Stat label="剩余总利息" value={<Money value={sh.remainingInterest} />} />
        <Stat label="新的结清时间" value={`${dateText(sh.endYear, sh.endMonth)}${earlier > 0 ? `（提前 ${monthsText(earlier)}）` : ''}`} />
        <Stat label="每月月供" value={<Money value={sh.payment} />} />
      </ResultCard>
      <ResultCard title="减少月供" hint="年限不变" tone="good">
        <Stat label="比不还省利息" big={<Money value={saveRe} className="text-success" />} />
        <Stat label="剩余总利息" value={<Money value={re.remainingInterest} />} />
        <Stat label="新的月供" value={<Money value={re.payment} />} />
        <Stat label="每月少还" value={<Money value={lower} />} />
      </ResultCard>
      {none && <p className="text-muted-foreground text-xs md:col-span-3">还没有填提前还款金额，两种方案和“不提前还”一样。</p>}
    </div>
  )
}

function ResultCard({ title, hint, tone, children }: { title: string; hint?: string; tone: 'plain' | 'good'; children: React.ReactNode }) {
  return (
    <Card className={cn('gap-0 py-5', tone === 'good' && 'border-success/40')} data-result={title}>
      <CardContent className="space-y-3 px-5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{title}</h2>
          {hint && <Badge variant="secondary">{hint}</Badge>}
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, big }: { label: string; value?: React.ReactNode; big?: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      {big ? (
        <p className="text-2xl leading-tight font-semibold tracking-tight">
          {big}
          <span className="text-muted-foreground ml-1 text-sm font-normal">元</span>
        </p>
      ) : (
        <p className="text-sm font-medium">{value}</p>
      )}
    </div>
  )
}

function Schedule({
  rows,
  open,
  setOpen,
  firstOpen,
}: {
  rows: Row[]
  open: Set<number>
  setOpen: (s: Set<number>) => void
  firstOpen: number | undefined
}) {
  const groups = useMemo(() => {
    const g = new Map<number, Row[]>()
    for (const r of rows) g.set(r.year, [...(g.get(r.year) ?? []), r])
    return [...g]
  }, [rows])

  const isOpen = (y: number) => (open.has(y) ? true : open.has(-y) ? false : y === firstOpen)
  const toggle = (y: number) => {
    const next = new Set(open)
    next.delete(y)
    next.delete(-y)
    next.add(isOpen(y) ? -y : y)
    setOpen(next)
  }

  return (
    <div className="divide-y rounded-lg border text-sm">
      {groups.map(([year, rs]) => {
        const o = isOpen(year)
        const pay = rs.reduce((s, r) => s + r.payment + r.prepay, 0)
        const interest = rs.reduce((s, r) => s + r.interest, 0)
        return (
          <div key={year}>
            <button
              type="button"
              aria-expanded={o}
              aria-label={`${year} 年`}
              onClick={() => toggle(year)}
              className="hover:bg-accent/50 flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              {o ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              <span className="font-medium tabular-nums">{year} 年</span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                还款 {yuan(pay)} · 利息 {yuan(interest)}
              </span>
            </button>
            {o && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-right text-xs tabular-nums">
                  <thead className="text-muted-foreground">
                    <tr>
                      {['期数', '年月', '月供', '本金', '利息', '剩余本金'].map((h, i) => (
                        <th key={h} className={cn('px-3 py-1.5 font-normal', i < 2 && 'text-left')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rs.map((r) => (
                      <tr key={r.period} className={cn('border-t', r.past && 'text-muted-foreground', r.prepay > 0 && 'bg-success/10')}>
                        <td className="px-3 py-1.5 text-left">{r.period}</td>
                        <td className="px-3 py-1.5 text-left">
                          {r.year}-{String(r.month).padStart(2, '0')}
                        </td>
                        <td className="px-3 py-1.5">{yuan(r.payment)}</td>
                        <td className="px-3 py-1.5">{yuan(r.principal)}</td>
                        <td className="px-3 py-1.5">{yuan(r.interest)}</td>
                        <td className="px-3 py-1.5">
                          {yuan(r.balance)}
                          {r.prepay > 0 && <span className="text-success ml-2">提前还 {yuan(r.prepay)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
