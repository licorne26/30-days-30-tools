import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  ChevronsLeftRight,
  CircleAlert,
  CircleCheck,
  Download,
  FileArchive,
  ImageUp,
  Loader2,
  ShieldCheck,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  PRESETS_KB,
  formatBytes,
  outputName,
  targetBytes,
  targetLabel,
  zipFiles,
  type Format,
  type Job,
  type Progress,
  type Result,
  type Settings,
  type Size,
  type WorkerMessage,
} from './compress'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const ZIP_NAME = 'compressed.zip'

// Safari's canvas silently falls back to PNG when asked for WebP.
const CAN_WEBP = (() => {
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    return c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
})()

const FORMATS: { value: Format; label: string; hint?: string; disabled?: boolean }[] = [
  { value: 'jpg', label: 'JPG', hint: '哪都能用' },
  { value: 'webp', label: 'WebP', hint: CAN_WEBP ? '更小' : '浏览器不支持', disabled: !CAN_WEBP },
]

type EdgeMode = 'none' | '2048' | '1080' | 'custom'
const EDGES: { value: EdgeMode; label: string }[] = [
  { value: 'none', label: '不限' },
  { value: '2048', label: '长边 2048' },
  { value: '1080', label: '长边 1080' },
  { value: 'custom', label: '自定义' },
]

const inputCls =
  'border-input focus-visible:ring-ring/50 w-24 rounded-md border bg-transparent px-3 py-1.5 text-sm tabular-nums outline-none focus-visible:ring-[3px]'

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null
  options: { value: T; label: string; hint?: string; disabled?: boolean }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="bg-muted inline-flex flex-wrap gap-1 rounded-lg p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[4.5rem_1fr] sm:items-center">
      <span className="text-sm font-medium">{label}</span>
      <div>{children}</div>
    </div>
  )
}

/** A number box that commits after the user stops typing, so every keystroke doesn't restart the queue. */
function NumberInput({
  value,
  min,
  max,
  unit,
  label,
  onCommit,
}: {
  value: number
  min: number
  max: number
  unit: string
  label: string
  onCommit: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  const [synced, setSynced] = useState(value)
  const timer = useRef(0)
  // A preset was picked: show it in the box.
  if (value !== synced) {
    setSynced(value)
    setText(String(value))
  }
  const n = Number(text)
  const valid = text.trim() !== '' && Number.isFinite(n) && n >= min && n <= max

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        aria-label={label}
        aria-invalid={!valid}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          clearTimeout(timer.current)
          const v = Math.round(Number(t))
          if (t.trim() !== '' && v >= min && v <= max) {
            timer.current = window.setTimeout(() => {
              setSynced(v)
              onCommit(v)
            }, 500)
          }
        }}
        className={cn(inputCls, !valid && 'border-destructive')}
      />
      <span className="text-muted-foreground text-sm">{unit}</span>
    </label>
  )
}

function Dropzone({ compact, onFiles }: { compact: boolean; onFiles: (files: File[]) => void }) {
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
        compact ? 'px-4 py-4' : 'flex-col px-6 py-14',
        dragging ? 'border-foreground/40 bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <div className={cn('bg-muted grid shrink-0 place-items-center rounded-full', compact ? 'size-9' : 'size-12')}>
        <ImageUp className="text-muted-foreground size-5" />
      </div>
      {compact ? (
        <p className="text-sm font-medium">
          继续添加图片<span className="text-muted-foreground font-normal">（拖入、点击或粘贴）</span>
        </p>
      ) : (
        <div>
          <p className="font-medium">拖入图片，或点击选择，可以一次多张</p>
          <p className="text-muted-foreground mt-1 text-sm">
            支持 JPG、PNG、WebP，也可以直接按 <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">⌘ V</kbd> /{' '}
            <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">Ctrl V</kbd> 粘贴
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

type Done = Result & { key: string; url: string }
type Item = { id: string; file: File; url: string; result?: Done; error?: { key: string; message: string } }
type Working = { id: string; key: string; progress: Progress | null }

/** Before / after with a draggable divider. At 100% the original's pixels map 1:1 and the view scrolls. */
function Compare({ item, result }: { item: Item; result: Done }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLImageElement>(null)
  const drag = useRef<{ mode: 'divider' | 'pan'; x: number; y: number; left: number; top: number } | null>(null)
  const [pos, setPos] = useState(0.5)
  const [zoom, setZoom] = useState(false)
  const [natural, setNatural] = useState<Size | null>(null)

  // The divider lives in frame coordinates; clip the "after" image wherever the content currently is.
  const sync = useCallback(() => {
    const frame = frameRef.current
    const content = contentRef.current
    const after = afterRef.current
    if (!frame || !content || !after) return
    const f = frame.getBoundingClientRect()
    const c = content.getBoundingClientRect()
    after.style.clipPath = `inset(0 0 0 ${Math.max(0, f.left + pos * f.width - c.left)}px)`
  }, [pos])

  useLayoutEffect(sync)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const ro = new ResizeObserver(sync)
    ro.observe(frame)
    return () => ro.disconnect()
  }, [sync])

  function toggleZoom() {
    flushSync(() => setZoom((z) => !z))
    // Entering 100%: keep the spot under the divider in view.
    const sc = scrollRef.current
    if (zoom || !sc) return
    sc.scrollLeft = pos * (sc.scrollWidth - sc.clientWidth)
    sc.scrollTop = (sc.scrollHeight - sc.clientHeight) / 2
  }

  function moveDivider(clientX: number) {
    const f = frameRef.current!.getBoundingClientRect()
    setPos(Math.min(1, Math.max(0, (clientX - f.left) / f.width)))
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const onHandle = (e.target as HTMLElement).closest('[data-handle]')
    // At 100%, touch scrolls natively and only the handle moves the divider; a mouse can drag to pan.
    if (zoom && !onHandle && e.pointerType !== 'mouse') return
    const s = scrollRef.current!
    drag.current = {
      mode: zoom && !onHandle ? 'pan' : 'divider',
      x: e.clientX,
      y: e.clientY,
      left: s.scrollLeft,
      top: s.scrollTop,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (drag.current.mode === 'divider') moveDivider(e.clientX)
    e.preventDefault()
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    if (d.mode === 'divider') return moveDivider(e.clientX)
    const s = scrollRef.current!
    s.scrollLeft = d.left - (e.clientX - d.x)
    s.scrollTop = d.top - (e.clientY - d.y)
  }

  const endDrag = () => {
    drag.current = null
  }

  const imgCls = cn('pointer-events-none block size-full select-none', !zoom && 'object-contain')

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          'bg-muted relative aspect-[4/3] w-full overflow-hidden rounded-xl border select-none',
          zoom ? 'cursor-grab active:cursor-grabbing' : 'cursor-ew-resize touch-pan-y',
        )}
      >
        <div ref={scrollRef} onScroll={sync} className={cn('absolute inset-0 flex', zoom ? 'overflow-auto' : 'overflow-hidden')}>
          <div
            ref={contentRef}
            className={cn('relative shrink-0', zoom ? 'm-auto' : 'size-full')}
            style={zoom && natural ? { width: natural.width, height: natural.height } : undefined}
          >
            <img
              src={item.url}
              alt="原图"
              draggable={false}
              onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              className={cn(imgCls, 'absolute inset-0')}
            />
            <img ref={afterRef} src={result.url} alt="压缩后" draggable={false} className={cn(imgCls, 'absolute inset-0')} />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between gap-2 p-2">
          <Badge variant="secondary" className="shadow-sm">
            原图 {formatBytes(item.file.size)}
          </Badge>
          <Badge variant="secondary" className="shadow-sm">
            压缩后 {formatBytes(result.blob.size)}
          </Badge>
        </div>

        <div
          data-handle
          role="slider"
          tabIndex={0}
          aria-label="拖动对比压缩前后"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos * 100)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.02
            if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - step))
            else if (e.key === 'ArrowRight') setPos((p) => Math.min(1, p + step))
            else return
            e.preventDefault()
          }}
          style={{ left: `${pos * 100}%` }}
          className="focus-visible:ring-ring/50 absolute inset-y-0 z-10 flex w-8 -translate-x-1/2 cursor-ew-resize touch-none justify-center outline-none focus-visible:ring-[3px]"
        >
          <div className="bg-background h-full w-0.5 shadow-[0_0_0_1px_rgb(0_0_0/0.15)]" />
          <div className="bg-background text-foreground absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border shadow-md">
            <ChevronsLeftRight className="size-4" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground min-w-0 truncate text-xs">
          左边原图，右边压缩后{zoom ? '。拖动或滚动查看其他位置' : '。拖动中间的分割线对比'}
        </p>
        <Button variant="outline" size="sm" onClick={toggleZoom}>
          {zoom ? <ZoomOut /> : <ZoomIn />}
          {zoom ? '适应窗口' : '100% 看细节'}
        </Button>
      </div>
    </div>
  )
}

function StatusBadges({ result, over }: { result: Done; over: boolean }) {
  const soft = 'border-transparent'
  if (over) {
    return (
      <Badge variant="outline" className={cn(soft, 'bg-destructive/10 text-destructive')}>
        <CircleAlert />
        压不到目标
      </Badge>
    )
  }
  return (
    <>
      <Badge variant="outline" className={cn(soft, 'bg-success/10 text-success')}>
        <CircleCheck />
        {result.status === 'original' ? '原图已达标' : '达标'}
      </Badge>
      {result.status === 'resized' && (
        <Badge variant="secondary" className="tabular-nums">
          已缩小到 {result.width}×{result.height}
        </Badge>
      )}
    </>
  )
}

/** "小了 97%"; keeps a decimal near 100% so a 9 MB → 20 KB file doesn't read as "100% smaller". */
function change(saved: number) {
  const pct = Math.abs(saved) * 100
  const text = pct >= 99 && pct < 100 ? pct.toFixed(1) : Math.round(pct)
  return `${saved >= 0 ? '小了' : '大了'} ${text}%`
}

function ResultRow({
  item,
  result,
  state,
  progress,
  error,
  selected,
  name,
  onSelect,
  onRemove,
}: {
  item: Item
  result: Done | undefined
  state: 'done' | 'working' | 'queued' | 'error'
  progress: Progress | null
  error: string | undefined
  selected: boolean
  name: string
  onSelect: () => void
  onRemove: () => void
}) {
  const over = result?.status === 'over'
  const saved = result ? 1 - result.blob.size / item.file.size : 0

  return (
    <li
      className={cn(
        'bg-card flex items-center gap-3 rounded-lg border p-2 pr-1.5 transition-colors',
        selected && 'ring-ring/60 border-ring ring-1',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={state !== 'done'}
        aria-label={`对比 ${item.file.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
        <img
          src={result?.url ?? item.url}
          alt=""
          className={cn('bg-muted size-14 shrink-0 rounded-md object-cover', state !== 'done' && 'opacity-50')}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium">{item.file.name}</p>
          {state === 'done' && result ? (
            <>
              <p className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs tabular-nums">
                <span className="whitespace-nowrap">
                  {formatBytes(item.file.size)} →{' '}
                  <span className={cn('font-medium', over ? 'text-destructive' : 'text-foreground')}>
                    {formatBytes(result.blob.size)}
                  </span>
                </span>
                {result.status !== 'original' && <span className="whitespace-nowrap">· {change(saved)}</span>}
                <span className="whitespace-nowrap">
                  · {result.width}×{result.height}
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadges result={result} over={over} />
              </div>
            </>
          ) : state === 'error' ? (
            <p className="text-destructive text-xs">{error}</p>
          ) : (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
              {state === 'working' ? (
                <>
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  {progress
                    ? `压缩中 · 第 ${progress.attempt} 次尝试 · ${progress.width}×${progress.height} · 质量 ${Math.round(progress.quality * 100)}`
                    : '解码中…'}
                </>
              ) : (
                '排队中'
              )}
            </p>
          )}
        </div>
      </button>
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`下载 ${name}`}
          disabled={state !== 'done'}
          onClick={() => result && saveBlob(result.blob, name)}
        >
          <Download />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`移除 ${item.file.name}`} onClick={onRemove}>
          <X />
        </Button>
      </div>
    </li>
  )
}

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [targetKB, setTargetKB] = useState(50)
  const [format, setFormat] = useState<Format>('jpg')
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('none')
  const [customEdge, setCustomEdge] = useState(1600)
  const [working, setWorking] = useState<Working | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zipping, setZipping] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  /** The job the worker is on right now; `working` only mirrors it for display. */
  const jobRef = useRef<{ id: string; key: string } | null>(null)
  const urls = useRef(new Map<string, string>())

  const maxEdge = edgeMode === 'none' ? null : edgeMode === 'custom' ? customEdge : Number(edgeMode)
  const settings = useMemo<Settings>(() => ({ targetKB, format, maxEdge }), [targetKB, format, maxEdge])
  const key = JSON.stringify(settings)

  const onMessage = useCallback((e: MessageEvent<WorkerMessage>) => {
    const msg = e.data
    if (msg.type === 'progress') {
      setWorking({ id: msg.id, key: msg.key, progress: msg.progress })
      return
    }
    // A late message from a job that was cancelled must not release the job that replaced it.
    if (jobRef.current?.id === msg.id && jobRef.current.key === msg.key) jobRef.current = null
    setWorking(null)
    if (msg.type === 'done') {
      const prev = urls.current.get(msg.id)
      if (prev) URL.revokeObjectURL(prev)
      const url = URL.createObjectURL(msg.result.blob)
      urls.current.set(msg.id, url)
      setItems((all) => all.map((it) => (it.id === msg.id ? { ...it, result: { ...msg.result, key: msg.key, url } } : it)))
    } else {
      const message =
        msg.message === 'unsupported-format' ? '这个浏览器不能导出 WebP，换成 JPG 试试。' : '这张图片读不出来，换一张试试。'
      setItems((all) => all.map((it) => (it.id === msg.id ? { ...it, error: { key: msg.key, message } } : it)))
    }
  }, [])

  // One worker, one image at a time. Changing a setting throws away the image in progress and starts over.
  useEffect(() => {
    const job = jobRef.current
    if (job && (job.key !== key || !items.some((it) => it.id === job.id))) {
      workerRef.current?.terminate()
      workerRef.current = null
      jobRef.current = null
    }
    if (jobRef.current) return
    const next = items.find((it) => it.result?.key !== key && it.error?.key !== key)
    if (!next) return
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current.onmessage = onMessage
    }
    jobRef.current = { id: next.id, key }
    workerRef.current.postMessage({ id: next.id, key, file: next.file, settings } satisfies Job)
  }, [items, key, settings, onMessage])

  useEffect(() => {
    const map = urls.current
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      jobRef.current = null
      map.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  const addFiles = useCallback((files: File[]) => {
    const list = files.filter((f) => ACCEPT.includes(f.type))
    if (!list.length) return
    const added = list.map((file) => {
      const id = crypto.randomUUID()
      const url = URL.createObjectURL(file)
      urls.current.set(`${id}:src`, url)
      return { id, file, url }
    })
    setItems((prev) => [...prev, ...added])
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => addFiles([...(e.clipboardData?.files ?? [])])
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  function forget(ids: string[]) {
    for (const id of ids) {
      for (const k of [id, `${id}:src`]) {
        const u = urls.current.get(k)
        if (u) URL.revokeObjectURL(u)
        urls.current.delete(k)
      }
    }
  }

  function remove(id: string) {
    forget([id])
    setItems((all) => all.filter((it) => it.id !== id))
  }

  function clearAll() {
    forget(items.map((it) => it.id))
    setItems([])
  }

  const current = (it: Item) => (it.result?.key === key ? it.result : undefined)
  const doneItems = items.filter((it) => current(it))
  const pending = items.filter((it) => !current(it) && it.error?.key !== key).length
  const overCount = doneItems.filter((it) => it.result!.status === 'over').length
  const selected = items.find((it) => it.id === selectedId && current(it)) ?? doneItems[0]
  const names = new Map(items.map((it) => [it.id, outputName(it.file.name, targetKB, format)]))
  const totalBefore = doneItems.reduce((s, it) => s + it.file.size, 0)
  const totalAfter = doneItems.reduce((s, it) => s + it.result!.blob.size, 0)

  async function downloadZip() {
    setZipping(true)
    try {
      const files = doneItems.map((it) => ({ name: names.get(it.id)!, blob: it.result!.blob }))
      saveBlob(await zipFiles(files), ZIP_NAME)
    } finally {
      setZipping(false)
    }
  }

  const privacy = (
    <p className="text-muted-foreground flex items-start justify-center gap-1.5 text-xs">
      <ShieldCheck className="mt-px size-3.5 shrink-0" />
      <span>
        图片只在你的浏览器里处理，不会上传到任何地方。压缩后的图片不再带拍摄地点等 EXIF 信息（“原图已达标”的那几张是原样输出）。
      </span>
    </p>
  )

  const settingsCard = (
    <Card className="py-5">
      <CardContent className="space-y-5 px-5">
        <Row label="目标大小">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={PRESETS_KB.includes(targetKB) ? String(targetKB) : null}
              options={PRESETS_KB.map((kb) => ({ value: String(kb), label: targetLabel(kb) }))}
              onChange={(v) => setTargetKB(Number(v))}
            />
            <NumberInput value={targetKB} min={1} max={100_000} unit="KB" label="自定义目标大小" onCommit={setTargetKB} />
          </div>
        </Row>
        <Row label="格式">
          <Segmented value={format} options={FORMATS} onChange={setFormat} />
        </Row>
        <Row label="尺寸上限">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={edgeMode} options={EDGES} onChange={setEdgeMode} />
            {edgeMode === 'custom' && (
              <NumberInput value={customEdge} min={16} max={20_000} unit="px 长边" label="自定义长边像素" onCommit={setCustomEdge} />
            )}
          </div>
        </Row>
      </CardContent>
    </Card>
  )

  if (!items.length) {
    return (
      <div className="space-y-4">
        <Dropzone compact={false} onFiles={addFiles} />
        {settingsCard}
        {privacy}
      </div>
    )
  }

  const selectedResult = selected && current(selected)

  return (
    <div className="space-y-6">
      {selected && selectedResult ? (
        <Compare key={`${selected.id}|${selectedResult.url}`} item={selected} result={selectedResult} />
      ) : (
        <div className="bg-muted text-muted-foreground flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border text-sm">
          <Loader2 className="size-5 animate-spin" />
          正在压缩第一张…
        </div>
      )}

      {settingsCard}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={downloadZip} disabled={zipping || pending > 0 || !doneItems.length}>
          {zipping || pending > 0 ? <Loader2 className="animate-spin" /> : <FileArchive />}
          {pending > 0 ? `还剩 ${pending} 张…` : `全部下载 ${ZIP_NAME}`}
        </Button>
        <Button variant="ghost" onClick={clearAll}>
          <Trash2 />
          清空
        </Button>
      </div>

      {privacy}

      <Separator />

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-medium">
            {items.length} 张图片 · 目标 ≤ {targetLabel(targetKB)}
            {overCount > 0 && <span className="text-destructive ml-2">{overCount} 张压不到</span>}
          </h2>
          {doneItems.length > 0 && (
            <p className="text-muted-foreground text-xs tabular-nums">
              共 {formatBytes(totalBefore)} → {formatBytes(totalAfter)}
            </p>
          )}
        </div>
        <ul className="space-y-2">
          {items.map((it) => {
            const result = current(it)
            const state = result
              ? 'done'
              : it.error?.key === key
                ? 'error'
                : working?.id === it.id && working.key === key
                  ? 'working'
                  : 'queued'
            return (
              <ResultRow
                key={it.id}
                item={it}
                result={result}
                state={state}
                progress={state === 'working' ? working!.progress : null}
                error={it.error?.message}
                selected={selected?.id === it.id}
                name={names.get(it.id)!}
                onSelect={() => setSelectedId(it.id)}
                onRemove={() => remove(it.id)}
              />
            )
          })}
        </ul>
        <Dropzone compact onFiles={addFiles} />
        <p className="text-muted-foreground text-xs">
          1KB 按 1000 字节算，比按 1024 算更严一点，两种算法下都不会超。目标 {targetLabel(targetKB)} ={' '}
          {targetBytes(targetKB).toLocaleString()} 字节。
        </p>
      </div>
    </div>
  )
}
