import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, FileArchive, ImageUp, Loader2, Move, RotateCcw, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  BLURRY_BELOW,
  LAYOUTS,
  MAX_ZOOM,
  cellResolution,
  clampView,
  frameRect,
  initialView,
  pan,
  zoomAt,
  type Layout,
  type LayoutId,
  type Size,
  type View,
} from './crop'
import { decode, drawGrid, drawStage, exportCells, fileName, saveBlob, zipCells, zipName, type Format, type Source } from './split'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

const FORMATS: { value: Format; label: string; hint?: string }[] = [
  { value: 'jpg', label: 'JPG', hint: '体积小' },
  { value: 'png', label: 'PNG', hint: '无损' },
]

/** Gap between cells in the Moments preview, in CSS pixels. */
const GAP = 4

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

function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-foreground h-1.5 w-full cursor-pointer"
      />
      <span className="text-muted-foreground w-10 shrink-0 text-right text-sm tabular-nums">{value.toFixed(1)}×</span>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[4.5rem_1fr] sm:items-center">
      <span className="text-sm font-medium">{label}</span>
      <div>{children}</div>
    </div>
  )
}

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

type Pt = { x: number; y: number }

function Stage({
  src,
  layout,
  view,
  onChange,
}: {
  src: Source
  layout: Layout
  view: View
  onChange: (update: (v: View) => View) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const size = useSize(boxRef)
  const pointers = useRef(new Map<number, Pt>())

  useEffect(() => {
    if (canvasRef.current && size.width) drawStage(canvasRef.current, size, src, layout, view)
  }, [size, src, layout, view])

  // Offset of a point from the crop box centre, as a fraction of the box — the anchor for zooming.
  const anchor = useCallback(
    (p: Pt) => {
      const f = frameRect(size, layout)
      return [(p.x - f.x - f.w / 2) / f.w, (p.y - f.y - f.h / 2) / f.h] as const
    },
    [size, layout],
  )

  // Wheel and trackpad pinch (ctrl + wheel). Needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const [ax, ay] = anchor({ x: e.clientX - r.left, y: e.clientY - r.top })
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002))
      onChange((v) => zoomAt(src.size, layout, v, v.zoom * factor, ax, ay))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [anchor, onChange, src, layout])

  function local(e: React.PointerEvent): Pt {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, local(e))
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const map = pointers.current
    const prev = map.get(e.pointerId)
    if (!prev) return
    const before = [...map.values()]
    const p = local(e)
    map.set(e.pointerId, p)
    const frameW = frameRect(size, layout).w

    if (map.size === 1) {
      onChange((v) => pan(src.size, layout, v, p.x - prev.x, p.y - prev.y, frameW))
      return
    }
    // Two fingers: zoom by the change in distance around their midpoint, and follow the midpoint.
    const [a0, b0] = before
    const [a1, b1] = [...map.values()]
    const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    const m0 = mid(a0, b0)
    const m1 = mid(a1, b1)
    const ratio = dist(a1, b1) / Math.max(1, dist(a0, b0))
    const [ax, ay] = anchor(m0)
    onChange((v) => {
      const zoomed = zoomAt(src.size, layout, v, v.zoom * ratio, ax, ay)
      return pan(src.size, layout, zoomed, m1.x - m0.x, m1.y - m0.y, frameW)
    })
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId)
  }

  return (
    <div ref={boxRef} className="bg-muted relative aspect-[4/3] w-full overflow-hidden rounded-xl border">
      <canvas
        ref={canvasRef}
        aria-label="拖动调整裁剪位置，滚轮或双指缩放"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
      />
    </div>
  )
}

function MomentsPreview({ src, layout, view }: { src: Source; layout: Layout; view: View }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { width } = useSize(boxRef)
  // Moments always sizes a cell as a third of the photo area, whether 9, 4 or 3 photos are posted.
  const cellPx = Math.floor((width - 2 * GAP) / 3)
  const [dims, setDims] = useState<Size>({ width: 0, height: 0 })

  useEffect(() => {
    if (canvasRef.current && cellPx > 0) setDims(drawGrid(canvasRef.current, cellPx, GAP, src, layout, view))
  }, [cellPx, src, layout, view])

  return (
    <div className="bg-card mx-auto w-full max-w-[320px] rounded-[1.75rem] border p-2 shadow-sm">
      <div className="bg-background rounded-[1.25rem] border px-3 pt-3 pb-4">
        <p className="text-muted-foreground mb-4 text-center text-xs font-medium">朋友圈</p>
        <div className="flex gap-2.5">
          <div className="bg-muted grid size-9 shrink-0 place-items-center rounded-md">
            <UserRound className="text-muted-foreground size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">你的昵称</p>
            <p className="mt-0.5 mb-2 text-sm">随手拍了一组，按顺序看 📷</p>
            <div ref={boxRef} className="w-full">
              <canvas ref={canvasRef} className="block" style={{ width: dims.width, height: dims.height }} />
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
              <span>1 分钟前</span>
              <span className="bg-muted rounded px-1.5 leading-4 tracking-widest">··</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type Tiles = { key: string; blobs: Blob[]; urls: string[] }

const viewKey = (layout: Layout, view: View, format: Format) =>
  [layout.id, format, view.zoom, view.cx, view.cy].join('|')

export function App() {
  const [src, setSrc] = useState<Source | null>(null)
  const [layoutId, setLayoutId] = useState<LayoutId>('3x3')
  const [view, setView] = useState<View>({ zoom: 1, cx: 0, cy: 0 })
  const [format, setFormat] = useState<Format>('jpg')
  const [tiles, setTiles] = useState<Tiles | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [error, setError] = useState('')
  const urlsRef = useRef<string[]>([])

  const layout = LAYOUTS.find((l) => l.id === layoutId)!
  const key = viewKey(layout, view, format)

  const load = useCallback(async (file: File | null | undefined) => {
    if (!file || !ACCEPT.includes(file.type)) return
    setBusy(true)
    setError('')
    try {
      const next = await decode(file)
      setSrc((prev) => {
        prev?.original.close()
        if (prev && prev.preview !== prev.original) prev.preview.close()
        return next
      })
      setView(initialView(next.size))
    } catch {
      setError('这张图片读不出来，换一张 JPG、PNG 或 WebP 试试。')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => ACCEPT.includes(f.type))
      if (file) load(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [load])

  const update = useCallback(
    (fn: (v: View) => View) => setView((v) => (src ? fn(v) : v)),
    [src],
  )

  function changeLayout(id: LayoutId) {
    setLayoutId(id)
    // Same centre and zoom, re-clamped so the new box shape is still filled.
    if (src) setView((v) => clampView(src.size, LAYOUTS.find((l) => l.id === id)!, v))
  }

  // Cut the full-resolution cells once the crop settles, so the list below shows (and saves) the real files.
  useEffect(() => {
    if (!src) return
    let stale = false
    const t = setTimeout(async () => {
      // The image may be swapped (and its bitmap closed) mid-export; that run is simply dropped.
      const blobs = await exportCells(src, layout, view, format).catch(() => null)
      if (stale || !blobs) return
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      urlsRef.current = blobs.map((b) => URL.createObjectURL(b))
      setTiles({ key: viewKey(layout, view, format), blobs, urls: urlsRef.current })
    }, 350)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [src, layout, view, format])

  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), [])

  async function downloadZip() {
    if (!src) return
    setZipping(true)
    try {
      const blobs = tiles?.key === key ? tiles.blobs : await exportCells(src, layout, view, format)
      saveBlob(await zipCells(blobs, format), zipName(layout))
    } finally {
      setZipping(false)
    }
  }

  function reset() {
    if (!src) return
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
    setTiles(null)
    src.original.close()
    if (src.preview !== src.original) src.preview.close()
    setSrc(null)
  }

  if (!src) {
    return (
      <div className="space-y-4">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            load(e.dataTransfer.files[0])
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center transition-colors',
            dragging ? 'border-foreground/40 bg-accent' : 'hover:bg-accent/50',
          )}
        >
          <div className="bg-muted grid size-12 place-items-center rounded-full">
            {busy ? (
              <Loader2 className="text-muted-foreground size-5 animate-spin" />
            ) : (
              <ImageUp className="text-muted-foreground size-5" />
            )}
          </div>
          <div>
            <p className="font-medium">{busy ? '正在读取…' : '拖入图片，或点击选择'}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              支持 JPG、PNG、WebP，也可以直接按 <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">⌘ V</kbd> /{' '}
              <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">Ctrl V</kbd> 粘贴
            </p>
          </div>
          <input
            type="file"
            accept={ACCEPT.join(',')}
            className="sr-only"
            onChange={(e) => {
              load(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>读取失败</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" />
          图片只在你的浏览器里处理，不会上传到任何地方
        </p>
      </div>
    )
  }

  const res = cellResolution(src.size, layout, view)
  const ready = tiles?.key === key

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <Stage src={src} layout={layout} view={view} onChange={update} />
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Move className="size-3.5" />
            拖动调整位置，滚轮或双指缩放。原图 {src.size.width}×{src.size.height}
          </p>
        </div>
        <MomentsPreview src={src} layout={layout} view={view} />
      </div>

      <Card className="py-5">
        <CardContent className="space-y-5 px-5">
          <Row label="切法">
            <Segmented
              value={layoutId}
              options={LAYOUTS.map((l) => ({ value: l.id, label: l.label, hint: l.id.replace('x', '×') }))}
              onChange={changeLayout}
            />
          </Row>
          <Row label="缩放">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Slider
                  value={view.zoom}
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  onChange={(z) => update((v) => zoomAt(src.size, layout, v, z))}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={() => setView(initialView(src.size))}>
                <RotateCcw />
                复位
              </Button>
            </div>
          </Row>
          <Row label="格式">
            <div className="flex flex-wrap items-center gap-3">
              <Segmented value={format} options={FORMATS} onChange={setFormat} />
              <span className="text-muted-foreground text-sm tabular-nums">
                每格 {res.output}×{res.output}
              </span>
            </div>
          </Row>
        </CardContent>
      </Card>

      {res.source < BLURRY_BELOW && (
        <Alert>
          <TriangleAlert />
          <AlertTitle>原图偏小，切出来会糊</AlertTitle>
          <AlertDescription>
            现在每格只有 {Math.floor(res.source)} 像素宽，发出去点开看会发虚。换一张更大的原图，或者把缩放调小一点。
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={downloadZip} disabled={zipping}>
          {zipping ? <Loader2 className="animate-spin" /> : <FileArchive />}
          打包下载 {zipName(layout)}
        </Button>
        <Button variant="ghost" onClick={reset}>
          <RotateCcw />
          换一张
        </Button>
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <ShieldCheck className="size-3.5" />
        图片只在你的浏览器里处理，不会上传到任何地方
      </p>

      <Separator />

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-medium">按顺序发：{layout.cols * layout.rows} 张</h2>
          <p className="text-muted-foreground text-xs">手机上可以长按单张图片保存</p>
        </div>
        <div
          className={cn(
            'grid gap-2 transition-opacity',
            layout.id === '2x2' ? 'max-w-sm' : 'max-w-lg',
            !ready && 'opacity-50',
          )}
          style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: layout.cols * layout.rows }, (_, i) => (
            <div key={i} className="bg-muted relative aspect-square overflow-hidden rounded-md border">
              {tiles && tiles.urls.length === layout.cols * layout.rows && (
                <img src={tiles.urls[i]} alt={`第 ${i + 1} 张`} className="size-full object-cover" />
              )}
              <Badge variant="secondary" className="absolute top-1.5 left-1.5 tabular-nums">
                {i + 1}
              </Badge>
              <Button
                variant="secondary"
                size="icon"
                aria-label={`下载第 ${i + 1} 张`}
                disabled={!ready}
                onClick={() => tiles && saveBlob(tiles.blobs[i], `${layout.id}-${fileName(i, format)}`)}
                className="absolute right-1.5 bottom-1.5 size-7"
              >
                <Download className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
