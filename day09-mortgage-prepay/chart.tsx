import { useRef, useState } from 'react'

import { cn } from '@/lib/utils'

export type Series = { key: string; label: string; color: string; dash?: string; points: { period: number; balance: number }[] }

const W = 720
const H = 300
const PAD = { l: 64, r: 16, t: 14, b: 34 }

/** A "nice" step for axis ticks. */
function niceStep(max: number, count: number) {
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / mag
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag
}

const wan = (v: number) => `${Math.round(v / 1e4)}万`

/**
 * Remaining principal over time for each plan. Hover (or touch) shows the balances of every plan
 * for that month. `from` is the first period on the axis; `label(period)` turns a period into a date.
 */
export function Chart({ series, from, label }: { series: Series[]; from: number; label: (period: number) => string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const last = Math.max(from + 1, ...series.map((s) => s.points[s.points.length - 1]?.period ?? from))
  const max = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.balance)))
  const step = niceStep(max, 4)
  const top = Math.ceil(max / step) * step
  const x = (p: number) => PAD.l + ((p - from) / (last - from)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b)

  const years = Math.max(1, Math.round((last - from) / 12 / 5)) // about five ticks on the x axis
  const xticks: number[] = []
  for (let p = from; p <= last; p += years * 12) xticks.push(p)

  function at(clientX: number) {
    const r = ref.current!.getBoundingClientRect()
    const px = ((clientX - r.left) / r.width) * W
    setHover(Math.min(last, Math.max(from, Math.round(from + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (last - from)))))
  }

  const value = (s: Series, p: number) => {
    const pt = s.points.find((q) => q.period === p)
    return pt ? pt.balance : p > (s.points[s.points.length - 1]?.period ?? 0) ? 0 : null
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <svg width="26" height="8" aria-hidden>
              <line x1="0" y1="4" x2="26" y2="4" stroke={s.color} strokeWidth="3" strokeDasharray={s.dash} strokeLinecap="round" />
            </svg>
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="剩余本金曲线"
          className="h-auto w-full touch-pan-y select-none"
          onPointerMove={(e) => at(e.clientX)}
          onPointerDown={(e) => at(e.clientX)}
          onPointerLeave={() => setHover(null)}
        >
          {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth="1" />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-[12px]">
                {wan(v)}
              </text>
            </g>
          ))}
          {xticks.map((p) => (
            <text key={p} x={x(p)} y={H - 10} textAnchor="middle" className="fill-muted-foreground text-[12px]">
              {label(p)}
            </text>
          ))}
          {series.map((s) => (
            <polyline
              key={s.key}
              data-series={s.key}
              pathLength={1}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeDasharray={s.dash}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.points.map((p) => `${x(p.period).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ')}
            />
          ))}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-foreground/40" strokeWidth="1" />
              {series.map((s) => {
                const v = value(s, hover)
                return v == null ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r="4" fill={s.color} className="stroke-background" strokeWidth="2" />
              })}
            </g>
          )}
        </svg>
        {hover != null && (
          <div
            className={cn(
              'bg-popover text-popover-foreground pointer-events-none absolute top-2 rounded-md border px-3 py-2 text-xs shadow-md',
              x(hover) > W / 2 ? 'right-3' : 'left-16',
            )}
          >
            <p className="mb-1 font-medium">{label(hover)}</p>
            {series.map((s) => {
              const v = value(s, hover)
              return (
                <p key={s.key} className="flex items-center gap-2 tabular-nums">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}：{v == null ? '—' : `${(v / 1e4).toFixed(2)} 万`}
                </p>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
