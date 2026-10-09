import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, Check, ClipboardCopy, Download, Eye, EyeOff, ImageUp, Info, Shuffle, ShieldCheck, Trash2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { DEFAULTS, H, W, drawFaceTime, pipRect, span, type Corner, type Fit, type Options } from './facetime'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const PREVIEW_W = 585 // drawn at half size on screen; the export is 1170 × 2532
const CORNERS: { value: Corner; label: string }[] = [
  { value: 'tl', label: '左上' },
  { value: 'tr', label: '右上' },
  { value: 'bl', label: '左下' },
  { value: 'br', label: '右下' },
]

const inputCls =
  'border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]'

type Slot = 'big' | 'small' | 'avatar'
type Photo = { bmp: ImageBitmap; url: string }

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
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

/** Two made-up pictures drawn on the spot, so the tool can be tried without a photo. */
async function samples() {
  const make = async (w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
    const c = new OffscreenCanvas(w, h)
    paint(c.getContext('2d')!)
    return createImageBitmap(c)
  }
  const big = await make(1200, 1600, (c) => {
    const sky = c.createLinearGradient(0, 0, 0, 1600)
    sky.addColorStop(0, '#fcd5a5')
    sky.addColorStop(0.55, '#f08a7c')
    sky.addColorStop(1, '#5b4b8a')
    c.fillStyle = sky
    c.fillRect(0, 0, 1200, 1600)
    c.fillStyle = '#fff3d6'
    c.beginPath()
    c.arc(820, 620, 170, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#4a3b78'
    c.beginPath()
    c.moveTo(0, 1150)
    c.quadraticCurveTo(300, 900, 620, 1120)
    c.quadraticCurveTo(900, 1000, 1200, 1180)
    c.lineTo(1200, 1600)
    c.lineTo(0, 1600)
    c.fill()
    // a cat-ish silhouette on the hill
    c.fillStyle = '#241b3f'
    c.beginPath()
    c.ellipse(420, 1180, 120, 90, 0, 0, Math.PI * 2)
    c.ellipse(420, 1060, 78, 70, 0, 0, Math.PI * 2)
    c.moveTo(356, 1015)
    c.lineTo(350, 940)
    c.lineTo(402, 990)
    c.moveTo(484, 1015)
    c.lineTo(490, 940)
    c.lineTo(438, 990)
    c.fill()
  })
  const small = await make(900, 1200, (c) => {
    const g = c.createLinearGradient(0, 0, 900, 1200)
    g.addColorStop(0, '#9be7c4')
    g.addColorStop(1, '#4ba3c7')
    c.fillStyle = g
    c.fillRect(0, 0, 900, 1200)
    c.fillStyle = '#fff'
    c.beginPath()
    c.arc(450, 500, 190, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = '#2b3a55'
    c.beginPath()
    c.arc(380, 480, 22, 0, Math.PI * 2)
    c.arc(520, 480, 22, 0, Math.PI * 2)
    c.fill()
    c.strokeStyle = '#2b3a55'
    c.lineWidth = 16
    c.lineCap = 'round'
    c.beginPath()
    c.arc(450, 540, 80, 0.15 * Math.PI, 0.85 * Math.PI)
    c.stroke()
    c.fillStyle = '#fff'
    c.beginPath()
    c.ellipse(450, 1050, 330, 250, 0, Math.PI, 0)
    c.fill()
  })
  return { big, small }
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function Picker({ title, hint, photo, fit, onFiles, onClear, onFit }: { title: string; hint: string; photo: Photo | null; fit: Fit; onFiles: (f: File[]) => void; onClear: () => void; onFit: (f: Fit) => void }) {
  const [over, setOver] = useState(false)
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            onFiles([...e.dataTransfer.files])
          }}
          className={cn('bg-muted grid h-20 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed', over && 'border-foreground/40')}
        >
          {photo ? <img src={photo.url} alt="" className="size-full object-cover" /> : <ImageUp className="text-muted-foreground size-5" />}
          <input type="file" accept={ACCEPT.join(',')} aria-label={`选择${title}`} className="sr-only" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              {photo ? '换一张' : '选择照片'}
              <input type="file" accept={ACCEPT.join(',')} className="sr-only" onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
            </label>
          </Button>
          {photo && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <Trash2 />
              清除
            </Button>
          )}
        </div>
      </div>
      {photo && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Slider label="缩放" value={fit.zoom} min={0.4} max={3} step={0.05} show={`${Math.round(fit.zoom * 100)}%`} onChange={(zoom) => onFit({ ...fit, zoom })} />
          <Slider label="左右" value={fit.x} min={0} max={1} step={0.01} show={`${Math.round(fit.x * 100)}`} onChange={(x) => onFit({ ...fit, x })} />
          <Slider label="上下" value={fit.y} min={0} max={1} step={0.01} show={`${Math.round(fit.y * 100)}`} onChange={(y) => onFit({ ...fit, y })} />
        </div>
      )}
    </div>
  )
}

export function App() {
  const [photos, setPhotos] = useState<Record<Slot, Photo | null>>({ big: null, small: null, avatar: null })
  const [o, setO] = useState<Options>(DEFAULTS)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const grab = useRef<{ target: 'window' | 'big' | 'small'; px: number; py: number; fit: Fit; wx: number; wy: number } | null>(null)
  const [dragMode, setDragMode] = useState<'frame' | 'move'>('frame')
  const photosRef = useRef(photos)

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setO((p) => ({ ...p, [k]: v }))

  const load = useCallback(async (slot: Slot, file: File) => {
    if (!ACCEPT.includes(file.type)) return
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      setPhotos((p) => {
        if (p[slot]) URL.revokeObjectURL(p[slot]!.url)
        return { ...p, [slot]: { bmp, url: URL.createObjectURL(file) } }
      })
      setError('')
    } catch {
      setError('这张图片读不出来，换一张试试。')
    }
  }, [])

  // Files chosen or pasted: the first goes to `slot`, a second one to the other.
  const addFiles = useCallback(
    (slot: Slot, files: File[]) => {
      const imgs = files.filter((f) => ACCEPT.includes(f.type))
      if (!imgs.length) return
      void load(slot, imgs[0])
      if (imgs[1] && slot !== 'avatar') void load(slot === 'big' ? 'small' : 'big', imgs[1])
    },
    [load],
  )

  useEffect(() => {
    photosRef.current = photos
  })
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) addFiles(!photosRef.current.big ? 'big' : 'small', files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  useEffect(() => {
    const c = canvasRef.current!
    c.width = PREVIEW_W
    c.height = Math.round((PREVIEW_W * H) / W)
    drawFaceTime(c, photos.big?.bmp ?? null, photos.small?.bmp ?? null, photos.avatar?.bmp ?? null, o)
  }, [photos, o])

  function clear(slot: Slot) {
    if (photos[slot]) URL.revokeObjectURL(photos[slot]!.url)
    setPhotos((p) => ({ ...p, [slot]: null }))
  }

  async function useSamples() {
    const s = await samples()
    const url = async (b: ImageBitmap) => {
      const c = document.createElement('canvas')
      c.width = b.width
      c.height = b.height
      c.getContext('2d')!.drawImage(b, 0, 0)
      return URL.createObjectURL(await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.8)))
    }
    const [bu, su] = await Promise.all([url(s.big), url(s.small)])
    setPhotos((p) => {
      if (p.big) URL.revokeObjectURL(p.big.url)
      if (p.small) URL.revokeObjectURL(p.small.url)
      return { ...p, big: { bmp: s.big, url: bu }, small: { bmp: s.small, url: su } }
    })
  }

  function swap() {
    setPhotos((p) => ({ ...p, big: p.small, small: p.big }))
    setO((p) => ({ ...p, big: p.small, small: p.big }))
  }

  // Dragging on the preview: outside the small window it pans the big photo; inside it pans the small photo
  // (the photo follows the pointer), or, in 移动 mode, moves the window itself.
  function toUnits(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const pipNow = () => ({ ...pipRect(o), ...o.pipAt })
  function down(e: React.PointerEvent) {
    const p = toUnits(e)
    const r = pipNow()
    const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
    const target = !inside ? 'big' : dragMode === 'move' ? 'window' : 'small'
    e.currentTarget.setPointerCapture(e.pointerId)
    grab.current = { target, px: p.x, py: p.y, fit: target === 'small' ? o.small : o.big, wx: r.x, wy: r.y }
  }
  function move(e: React.PointerEvent) {
    const g = grab.current
    if (!g) return
    const p = toUnits(e)
    const dx = p.x - g.px
    const dy = p.y - g.py
    if (g.target === 'window') {
      const { w, h } = pipRect(o)
      set('pipAt', { x: Math.min(W - w, Math.max(0, g.wx + dx)), y: Math.min(H - h, Math.max(0, g.wy + dy)) })
      return
    }
    const img = g.target === 'big' ? photos.big?.bmp : photos.small?.bmp
    if (!img) return
    const frame = g.target === 'big' ? { w: W, h: H } : pipRect(o)
    const sp = span(img, frame.w, frame.h, g.fit)
    // The photo moves by (dx, dy); its position is x = −span · fit, so fit changes by −d / span.
    const nx = Math.abs(sp.x) > 1 ? Math.min(1, Math.max(0, g.fit.x - dx / sp.x)) : g.fit.x
    const ny = Math.abs(sp.y) > 1 ? Math.min(1, Math.max(0, g.fit.y - dy / sp.y)) : g.fit.y
    set(g.target, { ...g.fit, x: nx, y: ny })
  }
  function up() {
    grab.current = null
  }

  async function render() {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    drawFaceTime(c, photos.big?.bmp ?? null, photos.small?.bmp ?? null, photos.avatar?.bmp ?? null, o)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
    c.width = c.height = 0
    if (!blob) throw new Error('export failed')
    return blob
  }

  async function download() {
    setBusy(true)
    try {
      save(await render(), 'facetime.png')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    setBusy(true)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await render() })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('浏览器不让复制图片，请用“下载 PNG”。')
    } finally {
      setBusy(false)
    }
  }

  const ready = photos.big && photos.small

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,330px)]">
      <Card className="py-5">
        <CardContent className="space-y-5 px-5">
          <Picker title="大图" hint="主视频方的前置摄像头画面，铺满整个屏幕" photo={photos.big} fit={o.big} onFiles={(f) => addFiles('big', f)} onClear={() => clear('big')} onFit={(f) => set('big', f)} />
          <Picker title="小图" hint="对面接电话的人的画面，显示在小窗里" photo={photos.small} fit={o.small} onFiles={(f) => addFiles('small', f)} onClear={() => clear('small')} onFit={(f) => set('small', f)} />
          <Picker title="头像" hint="左上角名字旁边的圆头像；不放就用大图" photo={photos.avatar} fit={o.avatar} onFiles={(f) => addFiles('avatar', f)} onClear={() => clear('avatar')} onFit={(f) => set('avatar', f)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={useSamples}>
              <Shuffle />
              用示例图试试
            </Button>
            <Button variant="outline" size="sm" onClick={swap}>
              <ArrowLeftRight />
              交换大小图
            </Button>
          </div>

          <Separator />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">对方名字</span>
              <input value={o.name} aria-label="对方名字" maxLength={14} onChange={(e) => set('name', e.target.value)} className={inputCls} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">状态栏时间</span>
              <input value={o.clock} aria-label="状态栏时间" maxLength={6} onChange={(e) => set('clock', e.target.value)} className={inputCls} />
            </label>
            <Slider label="电量" value={o.battery} min={5} max={100} step={1} show={`${o.battery}%`} onChange={(v) => set('battery', v)} />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">小窗位置</span>
              <Segmented value={o.pip} options={CORNERS} onChange={(v) => setO((p) => ({ ...p, pip: v, pipAt: undefined }))} />
            </div>
            <Slider label="小窗高度" value={o.pipAspect} min={1.2} max={2.2} step={0.05} show={`高 ÷ 宽 = ${o.pipAspect.toFixed(2)}`} onChange={(v) => set('pipAspect', v)} />
            <Slider label="小窗大小" value={o.pipSize} min={0.22} max={0.45} step={0.01} show={`${Math.round(o.pipSize * 100)}%`} onChange={(v) => set('pipSize', v)} />
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={o.showStatus} onChange={(e) => set('showStatus', e.target.checked)} />
                状态栏
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={o.muted} onChange={(e) => set('muted', e.target.checked)} />
                麦克风静音
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3 md:sticky md:top-4 md:self-start">
        <div className="bg-muted grid place-items-center rounded-lg border p-3">
          <canvas
            ref={canvasRef}
            aria-label="通话界面预览"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className="h-auto w-full max-w-[300px] cursor-grab touch-none rounded-[28px] shadow-md active:cursor-grabbing"
            style={{ aspectRatio: `${W} / ${H}` }}
          />
        </div>
        <div className="flex justify-center">
          <Segmented value={dragMode} options={[{ value: 'frame', label: '拖小窗：调整取景' }, { value: 'move', label: '拖小窗：移动位置' }]} onChange={setDragMode} />
        </div>
        <p className="text-muted-foreground text-center text-xs">
          {dragMode === 'frame' ? '在小窗里拖动，选择露出照片的哪一部分；拖其他地方移动大图。' : '拖小窗换位置；拖其他地方移动大图。'}
          照片拖不动时，把缩放调小就能上下左右摆。
        </p>
        <Button variant="outline" className="w-full" aria-pressed={o.showControls} onClick={() => set('showControls', !o.showControls)}>
          {o.showControls ? <EyeOff /> : <Eye />}
          {o.showControls ? '一键隐藏右侧 4 个按钮' : '一键显示右侧 4 个按钮'}
        </Button>
        {error && (
          <Alert variant="destructive">
            <Info />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={download}>
            <Download />
            下载 PNG
          </Button>
          <Button variant="outline" disabled={busy} onClick={copy} aria-label="复制图片">
            {copied ? <Check /> : <ClipboardCopy />}
          </Button>
        </div>
        {!ready && <p className="text-muted-foreground text-xs">两张都放好后效果最好；也可以先点“用示例图试试”。</p>}
        <p className="text-muted-foreground flex gap-1.5 text-xs">
          <ShieldCheck className="mt-px size-3.5 shrink-0" />
          <span>照片只在你的浏览器里处理，不会上传。导出尺寸 1170 × 2532。仅供娱乐，与 Apple 无关；请不要用它伪造聊天记录或冒充他人。</span>
        </p>
      </div>
    </div>
  )
}
