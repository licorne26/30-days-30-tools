import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Eraser,
  FileArchive,
  Grid3x3,
  ImageUp,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { BASE_NAME, drawBand, exportImages, saveBlob, zipFiles, type Format, type Source } from './render'
import {
  byName,
  commonWidth,
  layout as buildLayout,
  maxOverlap,
  mosaicCell,
  scaledHeight,
  segments,
  type Bars,
  type Layout,
  type Overlap,
  type Rect,
  type Size,
} from './stitch'
import type { Job, WorkerMessage } from './stitch.worker'

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp']
const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: 'png', label: 'PNG', hint: '文字最清楚' },
  { value: 'jpg', label: 'JPG', hint: '体积小' },
]
/** Manual fine-tuning range around the automatic overlap. */
const NUDGE = 200

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; hint?: string }[]
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
          {o.hint && <span className="text-muted-foreground ml-1 text-xs font-normal">{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

function Dropzone({ compact, busy, onFiles }: { compact: boolean; busy: boolean; onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false)
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onFiles([...e.dataTransfer.files])
      }}
      className={cn(
        'flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed text-center transition-colors',
        compact ? 'px-3 py-3' : 'flex-col px-6 py-14',
        dragging ? 'border-foreground/40 bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <div className={cn('bg-muted grid shrink-0 place-items-center rounded-full', compact ? 'size-8' : 'size-12')}>
        {busy ? <Loader2 className="text-muted-foreground size-4 animate-spin" /> : <ImageUp className="text-muted-foreground size-5" />}
      </div>
      {compact ? (
        <p className="text-sm font-medium">
          继续添加<span className="text-muted-foreground font-normal">（拖入、点击或粘贴）</span>
        </p>
      ) : (
        <div>
          <p className="font-medium">拖入多张截图，或点击选择</p>
          <p className="text-muted-foreground mt-1 text-sm">
            聊天记录、网页都行，按截图顺序自动排好；也可以按{' '}
            <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">⌘ V</kbd> /{' '}
            <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">Ctrl V</kbd> 一张张粘贴
          </p>
        </div>
      )}
      <input
        type="file"
        accept={ACCEPT.join(',')}
        multiple
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </label>
  )
}

type Item = { id: string; file: File; url: string; bitmap: ImageBitmap }

/** Thumbnails in stitching order. Drag one (mouse or finger) to move it; the order updates live. */
function Thumbs({
  items,
  onMove,
  onRemove,
}: {
  items: Item[]
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
}) {
  const refs = useRef(new Map<string, HTMLDivElement>())
  const drag = useRef<{ id: string; x: number; y: number; active: boolean } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  function onPointerDown(e: React.PointerEvent, id: string) {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { id, x: e.clientX, y: e.clientY, active: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return
      d.active = true
      setDragId(d.id)
    }
    // Move to whichever slot's centre is nearest the pointer.
    let best = -1
    let dist = Infinity
    items.forEach((it, i) => {
      const r = refs.current.get(it.id)?.getBoundingClientRect()
      if (!r) return
      const dd = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
      if (dd < dist) [best, dist] = [i, dd]
    })
    const from = items.findIndex((it) => it.id === d.id)
    if (best >= 0 && best !== from) onMove(from, best)
  }

  function onPointerUp() {
    drag.current = null
    setDragId(null)
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((it, i) => (
        <div
          key={it.id}
          ref={(el) => {
            if (el) refs.current.set(it.id, el)
            else refs.current.delete(it.id)
          }}
          onPointerDown={(e) => onPointerDown(e, it.id)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label={`第 ${i + 1} 张：${it.file.name}`}
          className={cn(
            'bg-muted relative aspect-[9/16] cursor-grab touch-none overflow-hidden rounded-md border select-none active:cursor-grabbing',
            dragId === it.id && 'ring-ring z-10 scale-105 shadow-lg ring-2',
          )}
        >
          <img src={it.url} alt="" draggable={false} className="pointer-events-none size-full object-cover object-top" />
          <Badge variant="secondary" className="absolute top-1 left-1 px-1.5 tabular-nums">
            {i + 1}
          </Badge>
          <Button
            variant="secondary"
            size="icon"
            aria-label={`删除第 ${i + 1} 张`}
            onClick={() => onRemove(it.id)}
            className="absolute top-1 right-1 size-6"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}

type SeamInfo = { key: string; index: number; y: number; overlap: number; state: 'auto' | 'manual' | 'none' }

function seamLabel(s: SeamInfo) {
  if (s.state === 'manual') return `手动 · 重叠 ${s.overlap}px`
  if (s.state === 'auto') return `自动对齐 · 重叠 ${s.overlap}px`
  return s.overlap ? `直接拼接 · 手动重叠 ${s.overlap}px` : '没找到重叠，已直接拼接'
}

/**
 * The long image in a scroll box. Only the visible band is painted (a sticky canvas the size of the
 * box), so a 30 000 px image scrolls as smoothly as a short one and never hits canvas limits.
 */
function Preview({
  l,
  sources,
  mosaics,
  cell,
  seams,
  showSeams,
  mosaicMode,
  selected,
  onSelect,
  onMosaic,
}: {
  l: Layout
  sources: Source[]
  mosaics: Rect[]
  cell: number
  seams: SeamInfo[]
  showSeams: boolean
  mosaicMode: boolean
  selected: string | null
  onSelect: (key: string) => void
  onMosaic: (r: Rect) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const spacerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [scroll, setScroll] = useState(0)
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const s = box.w / Math.max(1, l.width) // CSS px per long-image px
  const total = l.height * s

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c || !box.w || !box.h) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(box.w * dpr)
    c.height = Math.round(box.h * dpr)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.clearRect(0, 0, c.width, c.height)
    drawBand(ctx, l, sources, scroll / s, box.h / s, s * dpr, mosaics, cell)
  }, [l, sources, mosaics, cell, box, scroll, s])

  // Long-image coordinates of a pointer event.
  function at(e: React.PointerEvent) {
    const r = spacerRef.current!.getBoundingClientRect()
    return {
      x: Math.min(l.width, Math.max(0, (e.clientX - r.left) / s)),
      y: Math.min(l.height, Math.max(0, (e.clientY - r.top) / s)),
    }
  }

  const rect = (d: NonNullable<typeof draft>): Rect => ({
    x: Math.min(d.x0, d.x1),
    y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0),
    h: Math.abs(d.y1 - d.y0),
  })

  return (
    <div
      ref={boxRef}
      onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
      style={{ height: `min(70vh, 720px, ${Math.ceil(total) || 400}px)` }}
      className={cn('bg-muted relative overflow-y-auto overscroll-contain rounded-lg border', mosaicMode && 'touch-none')}
    >
      <div
        ref={spacerRef}
        style={{ height: total }}
        className={cn('relative', mosaicMode && 'cursor-crosshair')}
        onPointerDown={(e) => {
          if (!mosaicMode || (e.target as HTMLElement).closest('button')) return
          e.currentTarget.setPointerCapture(e.pointerId)
          const p = at(e)
          setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
        }}
        onPointerMove={(e) => {
          if (!draft) return
          const p = at(e)
          setDraft({ ...draft, x1: p.x, y1: p.y })
        }}
        onPointerUp={() => {
          if (!draft) return
          const r = rect(draft)
          if (r.w * s >= 6 && r.h * s >= 6) onMosaic(r)
          setDraft(null)
        }}
        onPointerCancel={() => setDraft(null)}
      >
        <canvas ref={canvasRef} aria-label="拼好的长图" className="sticky top-0 block w-full" style={{ height: box.h }} />
        {showSeams &&
          seams.map((sm) => (
            <div key={sm.key} className="pointer-events-none absolute inset-x-0" style={{ top: sm.y * s }}>
              <div
                className={cn(
                  'border-t-2 border-dashed',
                  sm.state === 'none' && !sm.overlap ? 'border-destructive' : 'border-foreground/60',
                )}
              />
              <button
                type="button"
                onClick={() => onSelect(sm.key)}
                className={cn(
                  'pointer-events-auto absolute right-1.5 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-sm',
                  sm.state === 'none' && !sm.overlap
                    ? 'bg-destructive border-transparent text-white'
                    : 'bg-background/95 text-foreground',
                  selected === sm.key && 'ring-ring ring-2',
                )}
              >
                {seamLabel(sm)}
              </button>
            </div>
          ))}
        {draft && (
          <div
            className="border-foreground bg-foreground/10 pointer-events-none absolute border-2 border-dashed"
            style={{ left: rect(draft).x * s, top: rect(draft).y * s, width: rect(draft).w * s, height: rect(draft).h * s }}
          />
        )}
      </div>
    </div>
  )
}

type Result = { key: string; bars: Bars; overlaps: (Overlap | null)[] }

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [manualOrder, setManualOrder] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [progress, setProgress] = useState<{ key: string; done: number; total: number } | null>(null)
  const [adjust, setAdjust] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [showSeams, setShowSeams] = useState(true)
  const [mosaicMode, setMosaicMode] = useState(false)
  const [mosaics, setMosaics] = useState<Rect[]>([])
  const [format, setFormat] = useState<Format>('png')
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const workerRef = useRef<Worker | null>(null)

  const width = commonWidth(items.map((it) => it.bitmap.width))
  const sizes: Size[] = useMemo(() => items.map((it) => ({ width, height: scaledHeight(it.bitmap, width) })), [items, width])
  const key = `${width}|${items.map((it) => it.id).join(',')}`
  const pairKey = (i: number) => `${items[i - 1].id}>${items[i].id}`

  // Every import or reorder re-runs the matching in the worker; only the latest answer is kept.
  useEffect(() => {
    if (!items.length) return
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./stitch.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data
        if (msg.type === 'progress') setProgress(msg)
        else if (msg.type === 'result') setResult(msg)
        else setError('有截图读不出来，换成 PNG 或 JPG 再试。')
      }
    }
    workerRef.current.postMessage({ key, width, items: items.map(({ id, file }) => ({ id, file })) } satisfies Job)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => workerRef.current?.terminate(), [])

  const addFiles = useCallback(
    async (files: File[]) => {
      const list = files.filter((f) => ACCEPT.includes(f.type))
      if (!list.length) return
      setLoading(true)
      setError('')
      const added: Item[] = []
      for (const file of list) {
        try {
          const bitmap = await createImageBitmap(file)
          added.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), bitmap })
        } catch {
          setError(`“${file.name}” 读不出来，已跳过。`)
        }
      }
      const sort = (xs: Item[]) => byName(xs.map((it) => ({ name: it.file.name, lastModified: it.file.lastModified, it }))).map((x) => x.it)
      setItems((prev) => (manualOrder ? [...prev, ...sort(added)] : sort([...prev, ...added])))
      setLoading(false)
    },
    [manualOrder],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => addFiles([...(e.clipboardData?.files ?? [])])
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  function move(from: number, to: number) {
    setManualOrder(true)
    setItems((xs) => {
      const next = [...xs]
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
  }

  function remove(id: string) {
    const it = items.find((x) => x.id === id)
    if (!it) return
    URL.revokeObjectURL(it.url)
    it.bitmap.close()
    setItems((xs) => xs.filter((x) => x.id !== id))
  }

  function clearAll() {
    items.forEach((it) => {
      URL.revokeObjectURL(it.url)
      it.bitmap.close()
    })
    setItems([])
    setResult(null)
    setAdjust({})
    setMosaics([])
    setSelected(null)
    setManualOrder(false)
    setNotice('')
  }

  const ready = result?.key === key ? result : null
  const seams: SeamInfo[] = []
  // A hand-tuned overlap (kept per pair of screenshots) wins over the automatic one.
  const overlaps = useMemo(
    () => items.map((it, i) => (i && ready ? (adjust[`${items[i - 1].id}>${it.id}`] ?? ready.overlaps[i]?.k ?? 0) : 0)),
    [items, ready, adjust],
  )
  const l = useMemo(() => (ready ? buildLayout(sizes, ready.bars, overlaps) : null), [ready, sizes, overlaps])
  if (ready && l) {
    for (const sm of l.seams) {
      const k = pairKey(sm.index)
      seams.push({
        key: k,
        index: sm.index,
        y: sm.y,
        overlap: sm.overlap,
        state: k in adjust ? 'manual' : ready.overlaps[sm.index] ? 'auto' : 'none',
      })
    }
  }
  const sources = useMemo<Source[]>(() => items.map((it) => ({ bitmap: it.bitmap })), [items])
  const cell = mosaicCell(width)
  const parts = l ? segments(l.height, l.width, cell).length : 1
  const scaled = items.filter((it) => it.bitmap.width !== width).length
  const sel = seams.find((sm) => sm.key === selected)

  async function doExport() {
    if (!l) return
    setExporting(true)
    setNotice('')
    try {
      const files = await exportImages(l, sources, mosaics, cell, format)
      if (files.length === 1) saveBlob(files[0].blob, files[0].name)
      else {
        saveBlob(await zipFiles(files), `${BASE_NAME}.zip`)
        setNotice(`图片太长，已分成 ${files.length} 张，打包成 ${BASE_NAME}.zip。`)
      }
    } catch {
      setError('导出失败，可以试试 JPG，或者少拼几张。')
    } finally {
      setExporting(false)
    }
  }

  const privacy = (
    <p className="text-muted-foreground flex gap-1.5 text-xs">
      <ShieldCheck className="mt-px size-3.5 shrink-0" />
      截图只在你的浏览器里处理，不会上传到任何地方。
    </p>
  )

  if (!items.length) {
    return (
      <div className="space-y-4">
        <Dropzone compact={false} busy={loading} onFiles={addFiles} />
        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>读取失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-center">{privacy}</div>
      </div>
    )
  }

  const working = !ready && progress?.key === key

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="py-5">
        <CardContent className="space-y-5 px-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {items.length} 张截图<span className="text-muted-foreground ml-2 text-xs font-normal">拖动调整顺序</span>
              </p>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <Trash2 />
                清空
              </Button>
            </div>
            <Thumbs items={items} onMove={move} onRemove={remove} />
            <Dropzone compact busy={loading} onFiles={addFiles} />
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-muted-foreground text-xs tabular-nums">
              {ready && l
                ? `宽 ${width}px · 顶部栏 ${ready.bars.top}px · 底部栏 ${ready.bars.bottom}px · 长图 ${l.width}×${l.height}`
                : `宽 ${width}px · 正在对齐…`}
              {scaled > 0 && <span className="block">有 {scaled} 张宽度不同，已缩放到 {width}px</span>}
            </p>

            {sel ? (
              <div className="bg-muted/50 space-y-2.5 rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">
                    第 {sel.index} → {sel.index + 1} 张的接缝
                  </p>
                  <button type="button" onClick={() => setSelected(null)} className="text-muted-foreground text-xs">
                    收起
                  </button>
                </div>
                <p className="text-muted-foreground text-xs">{seamLabel(sel)}</p>
                {(() => {
                  const base = ready?.overlaps[sel.index]?.k ?? 0
                  const max = maxOverlap(sizes[sel.index - 1], sizes[sel.index], ready!.bars)
                  const lo = Math.max(0, base - NUDGE)
                  const hi = Math.min(max, base + NUDGE)
                  const set = (v: number) => setAdjust((a) => ({ ...a, [sel.key]: Math.min(hi, Math.max(lo, Math.round(v))) }))
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="size-8" aria-label="重叠减 1px" onClick={() => set(sel.overlap - 1)}>
                          <Minus />
                        </Button>
                        <input
                          type="range"
                          min={lo}
                          max={hi}
                          step={1}
                          value={sel.overlap}
                          aria-label="重叠量"
                          onChange={(e) => set(Number(e.target.value))}
                          className="accent-foreground h-1.5 min-w-0 flex-1 cursor-pointer"
                        />
                        <Button variant="outline" size="icon" className="size-8" aria-label="重叠加 1px" onClick={() => set(sel.overlap + 1)}>
                          <Plus />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm tabular-nums">重叠 {sel.overlap}px</span>
                        {sel.state === 'manual' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setAdjust((a) => {
                                const next = { ...a }
                                delete next[sel.key]
                                return next
                              })
                            }
                          >
                            <RotateCcw />
                            恢复自动
                          </Button>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            ) : (
              seams.length > 0 && <p className="text-muted-foreground text-xs">点预览里接缝上的标签，可以逐像素微调重叠。</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSeams((v) => !v)} aria-pressed={showSeams}>
                <ScanLine />
                {showSeams ? '隐藏辅助线' : '显示辅助线'}
              </Button>
              <Button variant={mosaicMode ? 'default' : 'outline'} size="sm" onClick={() => setMosaicMode((v) => !v)} aria-pressed={mosaicMode}>
                <Grid3x3 />
                {mosaicMode ? '打码中：在长图上拖框' : '打码模式'}
              </Button>
              {mosaics.length > 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setMosaics((m) => m.slice(0, -1))}>
                    <Undo2 />
                    撤销
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMosaics([])}>
                    <Eraser />
                    清除全部
                  </Button>
                </>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Segmented value={format} options={FORMATS} onChange={setFormat} />
            <Button className="w-full" disabled={!l || exporting} onClick={doExport}>
              {exporting ? <Loader2 className="animate-spin" /> : parts > 1 ? <FileArchive /> : <Download />}
              {parts > 1 ? `导出 ${parts} 张（${BASE_NAME}.zip）` : `导出 ${BASE_NAME}.${format}`}
            </Button>
            {parts > 1 && !notice && (
              <p className="text-muted-foreground text-xs">长图超过浏览器画布的安全尺寸，会分成 {parts} 张打包下载。</p>
            )}
            {notice && (
              <Alert>
                <FileArchive />
                <AlertTitle>图片太长，已分成 {parts} 张</AlertTitle>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {l ? (
          <Preview
            l={l}
            sources={sources}
            mosaics={mosaics}
            cell={cell}
            seams={seams}
            showSeams={showSeams}
            mosaicMode={mosaicMode}
            selected={selected}
            onSelect={setSelected}
            onMosaic={(r) => setMosaics((m) => [...m, r])}
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex h-80 flex-col items-center justify-center gap-2 rounded-lg border text-sm">
            <Loader2 className="size-5 animate-spin" />
            {working && progress ? `正在对齐 ${Math.round((progress.done / progress.total) * 100)}%` : '正在读取…'}
          </div>
        )}
        {mosaicMode && <p className="text-muted-foreground text-xs">在长图上拖出矩形就会打上马赛克；只改导出的图，不改原图。</p>}
        {privacy}
      </div>
    </div>
  )
}
