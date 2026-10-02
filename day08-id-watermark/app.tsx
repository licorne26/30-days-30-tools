import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { zipSync } from 'fflate'
import { Check, ClipboardCopy, Download, FileArchive, ImageUp, ShieldCheck, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { DEFAULTS, drawWatermark, todayText, type Mode, type Options } from './watermark'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const SEED = 20261002
/** Longest edge of the on-screen copy; the export always uses the original. */
const PREVIEW_EDGE = 1600
const ZIP_NAME = 'watermarked.zip'

const PURPOSES = ['办理入职', '租房', '银行开户', '酒店入住', '快递实名', '自定义']
const COLORS = [
  { name: '灰', value: '#6b7280' },
  { name: '红', value: '#dc2626' },
  { name: '蓝', value: '#2563eb' },
  { name: '黑', value: '#111111' },
]
const MODES: { value: Mode; label: string }[] = [
  { value: 'tile', label: '斜向铺满' },
  { value: 'center', label: '居中一行' },
]

type Format = 'jpg' | 'png'
const inputCls =
  'border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]'

function Segmented<T extends string>({ value, options, onChange }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
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

function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <label className="grid gap-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{show}</span>
      </div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-foreground h-1.5 w-full cursor-pointer" />
    </label>
  )
}

type Item = { id: string; file: File; url: string }

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, '') || 'image'
}

/** Decode (upright, no metadata survives), draw at the original size, add the watermark, encode. */
async function render(file: File, o: Options, format: Format) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  if (format === 'jpg') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  drawWatermark(ctx, canvas.width, canvas.height, o, SEED)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, format === 'png' ? 'image/png' : 'image/jpeg', 0.92))
  canvas.width = canvas.height = 0
  if (!blob) throw new Error('export failed')
  return blob
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Preview({ item, options, full }: { item: Item; options: Options; full: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bmpRef = useRef<{ id: string; bmp: ImageBitmap; scale: number } | null>(null)
  const [ready, setReady] = useState('')
  const [natural, setNatural] = useState(0) // original width in pixels

  // Decode once per image: a reduced copy for fitting the screen, the original for the 100% view.
  useEffect(() => {
    let dead = false
    createImageBitmap(item.file, { imageOrientation: 'from-image' }).then(async (full) => {
      if (dead) return full.close()
      const scale = Math.min(1, PREVIEW_EDGE / Math.max(full.width, full.height))
      const bmp = scale < 1 ? await createImageBitmap(full, { resizeWidth: Math.round(full.width * scale), resizeHeight: Math.round(full.height * scale), resizeQuality: 'high' }) : full
      if (bmp !== full) full.close()
      bmpRef.current?.bmp.close()
      bmpRef.current = { id: item.id, bmp, scale }
      setNatural(Math.round(bmp.width / scale))
      setReady(item.id)
    })
    return () => {
      dead = true
    }
  }, [item])

  useEffect(() => {
    const c = canvasRef.current
    const b = bmpRef.current
    if (!c || !b || b.id !== item.id) return
    c.width = b.bmp.width
    c.height = b.bmp.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(b.bmp, 0, 0)
    drawWatermark(ctx, c.width, c.height, options, SEED)
  }, [item, options, ready, full])

  // At 100% the canvas is shown at the original pixel size (a reduced copy is drawn up when the original
  // is larger than PREVIEW_EDGE, which is fine for judging the layout).
  return (
    <div className={cn('bg-muted rounded-lg border', full ? 'max-h-[70vh] overflow-auto' : 'grid place-items-center p-3')}>
      <canvas
        ref={canvasRef}
        aria-label="加水印后的预览"
        className={cn('rounded-md shadow-sm', !full && 'h-auto max-h-[70vh] w-auto max-w-full')}
        style={full ? { width: natural, maxWidth: 'none' } : undefined}
      />
    </div>
  )
}

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [purpose, setPurpose] = useState('租房')
  const [custom, setCustom] = useState('')
  const [text, setText] = useState('仅供租房使用，他用无效')
  const [edited, setEdited] = useState(false)
  const [withDate, setWithDate] = useState(false)
  const [date, setDate] = useState(todayText())
  const [mode, setMode] = useState<Mode>('tile')
  const [color, setColor] = useState(COLORS[0].value)
  const [opacity, setOpacity] = useState(DEFAULTS.opacity)
  const [size, setSize] = useState(DEFAULTS.size * 100)
  const [density, setDensity] = useState(DEFAULTS.density)
  const [angle, setAngle] = useState(DEFAULTS.angle)
  const [anti, setAnti] = useState(false)
  const [format, setFormat] = useState<Format>('jpg')
  const [full, setFull] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const setPurposeText = (p: string, c = custom) => {
    setPurpose(p)
    setEdited(false)
    setText(`仅供${p === '自定义' ? c : p}使用，他用无效`)
  }

  const fullText = withDate && date ? `${text}　${date}` : text
  const options = useMemo<Options>(
    () => ({ text: fullText, mode, color, opacity, size: size / 100, density, angle, antiRemove: anti }),
    [fullText, mode, color, opacity, size, density, angle, anti],
  )

  const addFiles = useCallback((files: File[]) => {
    const added = files.filter((f) => ACCEPT.includes(f.type)).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))
    if (!added.length) return
    setItems((p) => [...p, ...added])
    setSelId((s) => s ?? added[0].id)
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => addFiles([...(e.clipboardData?.files ?? [])])
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  function remove(id: string) {
    const it = items.find((x) => x.id === id)
    if (it) URL.revokeObjectURL(it.url)
    const rest = items.filter((x) => x.id !== id)
    setItems(rest)
    if (selId === id) setSelId(rest[0]?.id ?? null)
  }

  function clearAll() {
    items.forEach((i) => URL.revokeObjectURL(i.url))
    setItems([])
    setSelId(null)
  }

  const sel = items.find((i) => i.id === selId) ?? items[0]
  const name = (it: Item) => `${stripExt(it.file.name)}-水印.${format}`

  async function downloadOne() {
    if (!sel) return
    setBusy(true)
    try {
      save(await render(sel.file, options, format), name(sel))
    } finally {
      setBusy(false)
    }
  }

  async function copyOne() {
    if (!sel) return
    setBusy(true)
    try {
      const blob = await render(sel.file, options, 'png')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: the download button still works */
    } finally {
      setBusy(false)
    }
  }

  async function downloadAll() {
    setBusy(true)
    try {
      const files: Record<string, Uint8Array> = {}
      const seen = new Map<string, number>()
      for (const it of items) {
        let n = name(it)
        const c = (seen.get(n) ?? 0) + 1
        seen.set(n, c)
        if (c > 1) n = n.replace(/(\.[^.]+)$/, ` (${c})$1`)
        files[n] = new Uint8Array(await (await render(it.file, options, format)).arrayBuffer())
      }
      save(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), ZIP_NAME)
    } finally {
      setBusy(false)
    }
  }

  const privacy = (
    <p className="text-muted-foreground flex gap-1.5 text-xs">
      <ShieldCheck className="mt-px size-3.5 shrink-0" />
      <span>证件照片只在你的浏览器里处理，不会上传，也不会保存。导出时会重新绘制图片，拍摄地点、设备型号等 EXIF 信息一并去掉。</span>
    </p>
  )

  if (!items.length) {
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
            addFiles([...e.dataTransfer.files])
          }}
          className={cn('flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center transition-colors', dragging ? 'border-foreground/40 bg-accent' : 'hover:bg-accent/50')}
        >
          <div className="bg-muted grid size-12 place-items-center rounded-full">
            <ImageUp className="text-muted-foreground size-5" />
          </div>
          <div>
            <p className="font-medium">拖入证件照片，或点击选择，可以一次多张</p>
            <p className="text-muted-foreground mt-1 text-sm">
              支持 JPG、PNG、WebP，也可以按 <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">⌘ V</kbd> /{' '}
              <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">Ctrl V</kbd> 粘贴
            </p>
          </div>
          <input type="file" accept={ACCEPT.join(',')} multiple className="sr-only" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
        </label>
        <div className="flex justify-center">{privacy}</div>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card className="py-5">
        <CardContent className="space-y-5 px-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{items.length} 张照片</p>
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <Trash2 />
                清空
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {items.map((it, i) => (
                <div key={it.id} className={cn('bg-muted relative aspect-square overflow-hidden rounded-md border', sel?.id === it.id && 'ring-ring ring-2')}>
                  <button type="button" aria-label={`预览第 ${i + 1} 张`} onClick={() => setSelId(it.id)} className="size-full">
                    <img src={it.url} alt="" className="size-full object-cover" />
                  </button>
                  <Button variant="secondary" size="icon" aria-label={`删除第 ${i + 1} 张`} onClick={() => remove(it.id)} className="absolute top-1 right-1 size-6">
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
              <label className="hover:bg-accent text-muted-foreground grid aspect-square cursor-pointer place-items-center rounded-md border border-dashed text-xs">
                添加
                <input type="file" accept={ACCEPT.join(',')} multiple className="sr-only" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
              </label>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <span className="text-sm font-medium">用途</span>
            <div className="flex flex-col items-start gap-2">
              <Segmented value={purpose} options={PURPOSES.map((p) => ({ value: p, label: p }))} onChange={(p) => setPurposeText(p)} />
              {purpose === '自定义' && (
                <input
                  value={custom}
                  placeholder="比如：办理贷款"
                  aria-label="自定义用途"
                  onChange={(e) => {
                    setCustom(e.target.value)
                    setPurposeText('自定义', e.target.value)
                  }}
                  className={inputCls}
                />
              )}
            </div>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium">水印文字{edited && <Badge variant="secondary" className="ml-2">已手动修改</Badge>}</span>
              <input value={text} aria-label="水印文字" onChange={(e) => { setText(e.target.value); setEdited(true) }} className={inputCls} />
            </label>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={withDate} onChange={(e) => setWithDate(e.target.checked)} />
                加日期
              </label>
              {withDate && <input value={date} aria-label="日期" onChange={(e) => setDate(e.target.value)} className={cn(inputCls, 'w-44')} />}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <Segmented value={mode} options={MODES} onChange={setMode} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">颜色</span>
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.name}
                  aria-label={`颜色 ${c.name}`}
                  onClick={() => setColor(c.value)}
                  className={cn('size-8 rounded-full border', color === c.value && 'ring-foreground ring-offset-background ring-2 ring-offset-2')}
                  style={{ background: c.value }}
                />
              ))}
              <input type="color" aria-label="自定义颜色" value={color} onChange={(e) => setColor(e.target.value)} className="size-8 cursor-pointer rounded border bg-transparent" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Slider label="透明度" value={opacity} min={0.1} max={0.9} step={0.05} show={opacity.toFixed(2)} onChange={setOpacity} />
              <Slider label="字号" value={size} min={2} max={10} step={0.5} show={`${size}%`} onChange={setSize} />
              {mode === 'tile' && <Slider label="密度" value={density} min={0.4} max={3} step={0.2} show={density.toFixed(1)} onChange={setDensity} />}
              <Slider label="角度" value={angle} min={-45} max={45} step={1} show={`${angle}°`} onChange={setAngle} />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={anti} onChange={(e) => setAnti(e.target.checked)} className="mt-1" />
              <span>
                <span className="font-medium">防去除</span>
                <span className="text-muted-foreground block text-xs">每个水印随机错开位置、角度和透明度，再加一组细波浪线，很难被修图一键抹掉。</span>
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {sel && <Preview item={sel} options={options} full={full} />}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFull((v) => !v)}>
            {full ? <ZoomOut /> : <ZoomIn />}
            {full ? '适应窗口' : '放大 100%'}
          </Button>
          <Segmented value={format} options={[{ value: 'jpg', label: 'JPG' }, { value: 'png', label: 'PNG' }]} onChange={setFormat} />
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy || !sel} onClick={downloadOne}>
            <Download />
            下载{sel ? ` ${name(sel)}` : ''}
          </Button>
          <Button variant="outline" disabled={busy || !sel} onClick={copyOne} aria-label="复制图片">
            {copied ? <Check /> : <ClipboardCopy />}
          </Button>
        </div>
        {items.length > 1 && (
          <Button variant="outline" className="w-full" disabled={busy} onClick={downloadAll}>
            <FileArchive />
            全部下载 {ZIP_NAME}
          </Button>
        )}
        {privacy}
      </div>
    </div>
  )
}
