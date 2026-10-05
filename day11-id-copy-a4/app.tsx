import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileDown, ImageDown, ImageUp, Info, Printer, RotateCw, ShieldCheck, Trash2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { DEFAULTS, type Options } from '../day08-id-watermark/watermark'
import { A4, drawPage, layout, makePdf, makePng, printPage, rectPx, type Cards, type Face, type Size } from './layout'
import { mmToPx, orderCorners, type Effect, type Pt } from './warp'
import type { Req, Res } from './warp.worker'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const SEED = 20261011
/** Longest edge of the copy shown in the editor; the full-size photo stays in the worker. */
const VIEW_EDGE = 1400
const PREVIEW_DPI = 150
const PAGE_DPI = 100
const MAG = 112 // magnifier size, css px
const ZOOM = 2.5

const FACES: { face: Face; label: string }[] = [
  { face: 'front', label: '正面' },
  { face: 'back', label: '背面' },
]
const KINDS = [
  { id: 'id', label: '身份证 / 银行卡', w: 85.6, h: 54 },
  { id: 'dl', label: '驾驶证', w: 88, h: 60 },
  { id: 'custom', label: '自定义', w: 85.6, h: 54 },
]
const PURPOSES = ['办理入职', '租房', '银行开户', '酒店入住', '快递实名', '自定义']
const CORNER_NAMES = ['左上角', '右上角', '右下角', '左下角']
const START: Pt[] = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
]

const inputCls =
  'border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]'

type Photo = { full: ImageBitmap; view: ImageBitmap; corners: Pt[] }

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

/** Turn an ImageBitmap 90° clockwise. */
async function rotateCw(b: ImageBitmap) {
  const c = new OffscreenCanvas(b.height, b.width)
  const ctx = c.getContext('2d')!
  ctx.translate(b.height, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(b, 0, 0)
  return createImageBitmap(c)
}

async function shrink(b: ImageBitmap) {
  const s = Math.min(1, VIEW_EDGE / Math.max(b.width, b.height))
  if (s === 1) return createImageBitmap(b)
  return createImageBitmap(b, { resizeWidth: Math.round(b.width * s), resizeHeight: Math.round(b.height * s), resizeQuality: 'high' })
}

function toCanvas(img: ImageData) {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

function save(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/**
 * The photo with four draggable corners. While one is dragged a 2.5× magnifier follows it, so the card's
 * rounded edge can be matched exactly. Pointer Events: mouse, pen and touch alike. Arrow keys nudge a focused corner.
 */
function CornerEditor({ photo, onCorners, label }: { photo: Photo; onCorners: (c: Pt[]) => void; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const magRef = useRef<HTMLCanvasElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [box, setBox] = useState({ w: 300, h: 200 }) // photo size on screen, measured when a drag starts
  const { view, corners } = photo

  useEffect(() => {
    const c = canvasRef.current!
    c.width = view.width
    c.height = view.height
    c.getContext('2d')!.drawImage(view, 0, 0)
  }, [view])

  // The magnifier: a 44.8 css px square around the corner, drawn 2.5 times larger.
  useEffect(() => {
    const m = magRef.current
    if (drag === null || !m) return
    const dpr = window.devicePixelRatio || 1
    m.width = m.height = Math.round(MAG * dpr)
    const ctx = m.getContext('2d')!
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, m.width, m.height)
    const side = (MAG / ZOOM) * (view.width / box.w) // in photo pixels
    const p = corners[drag]
    ctx.drawImage(view, p.x * view.width - side / 2, p.y * view.height - side / 2, side, side, 0, 0, m.width, m.height)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = Math.max(1, dpr)
    ctx.beginPath()
    ctx.moveTo(m.width / 2, 0)
    ctx.lineTo(m.width / 2, m.height)
    ctx.moveTo(0, m.height / 2)
    ctx.lineTo(m.width, m.height / 2)
    ctx.stroke()
  }, [drag, corners, view, box])

  function move(i: number, clientX: number, clientY: number) {
    const r = boxRef.current!.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    onCorners(corners.map((p, k) => (k === i ? { x, y } : p)))
  }

  function nudge(i: number, dx: number, dy: number) {
    const p = corners[i]
    onCorners(corners.map((q, k) => (k === i ? { x: Math.min(1, Math.max(0, p.x + dx)), y: Math.min(1, Math.max(0, p.y + dy)) } : q)))
  }

  const pts = corners.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')
  // The magnifier sits diagonally away from the corner, flipped when it would leave the photo.
  const mag = drag === null ? null : (() => {
    const p = corners[drag]
    const { w, h } = box
    let left = p.x * w - MAG - 28
    let top = p.y * h - MAG - 28
    if (left < 0) left = p.x * w + 28
    if (top < 0) top = p.y * h + 28
    return { left: Math.min(left, w - MAG), top: Math.min(top, Math.max(0, h - MAG)) }
  })()

  return (
    <div ref={boxRef} className="bg-muted relative overflow-hidden rounded-lg border select-none">
      <canvas ref={canvasRef} aria-label={`${label}照片`} className="block h-auto w-full" />
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <polygon points={pts} fill="rgba(59,130,246,0.12)" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      {corners.map((p, i) => (
        <button
          key={i}
          type="button"
          aria-label={`${label}${CORNER_NAMES[i]}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const r = boxRef.current!.getBoundingClientRect()
            setBox({ w: r.width, h: r.height })
            setDrag(i)
            move(i, e.clientX, e.clientY)
          }}
          onPointerMove={(e) => drag === i && move(i, e.clientX, e.clientY)}
          onPointerUp={() => setDrag(null)}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(e) => {
            const d = e.shiftKey ? 0.01 : 0.002
            const k: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }
            if (k[e.key]) {
              e.preventDefault()
              nudge(i, ...k[e.key])
            }
          }}
          className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full outline-none active:cursor-grabbing"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        >
          <span className={cn('size-5 rounded-full border-2 border-white bg-blue-500 shadow-md ring-1 ring-black/40', drag === i && 'bg-red-500')} />
        </button>
      ))}
      {mag && (
        <div className="pointer-events-none absolute z-10 overflow-hidden rounded-full border-2 border-white shadow-lg ring-1 ring-black/40" style={{ left: mag.left, top: mag.top, width: MAG, height: MAG }}>
          <canvas ref={magRef} aria-label="放大镜" className="size-full" />
        </div>
      )}
    </div>
  )
}

function Result({ img, label, card }: { img?: ImageData; label: string; card: Size }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !img) return
    c.width = img.width
    c.height = img.height
    c.getContext('2d')!.putImageData(img, 0, 0)
  }, [img])
  return (
    <div className="bg-muted overflow-hidden rounded-lg border" style={{ aspectRatio: `${card.w} / ${card.h}` }}>
      <canvas ref={ref} aria-label={`${label}拉正结果`} className="block size-full" />
    </div>
  )
}

function Drop({ label, onFiles, active }: { label: string; onFiles: (f: File[]) => void; active: boolean }) {
  const [over, setOver] = useState(false)
  return (
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
      className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors', over ? 'border-foreground/40 bg-accent' : 'hover:bg-accent/50', active && 'border-foreground/30')}
    >
      <div className="bg-muted grid size-10 place-items-center rounded-full">
        <ImageUp className="text-muted-foreground size-5" />
      </div>
      <p className="text-sm font-medium">{label}：拖入或点击选择</p>
      <p className="text-muted-foreground text-xs">
        也可以按 <kbd className="bg-muted rounded px-1.5 py-0.5">⌘ V</kbd> / <kbd className="bg-muted rounded px-1.5 py-0.5">Ctrl V</kbd> 粘贴
      </p>
      <input
        type="file"
        accept={ACCEPT.join(',')}
        multiple
        aria-label={`选择${label}照片`}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </label>
  )
}

export function App() {
  const [photos, setPhotos] = useState<Record<Face, Photo | null>>({ front: null, back: null })
  const [prev, setPrev] = useState<Partial<Record<Face, ImageData>>>({})
  const [active, setActive] = useState<Face>('front')
  const [kind, setKind] = useState('id')
  const [custom, setCustom] = useState({ w: '85.6', h: '54' })
  const [mode, setMode] = useState<Effect['mode']>('color')
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(100)
  const [useWm, setUseWm] = useState(false)
  const [purpose, setPurpose] = useState('办理入职')
  const [customPurpose, setCustomPurpose] = useState('')
  const [wmText, setWmText] = useState('仅供办理入职使用，他用无效')
  const [twoUp, setTwoUp] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const workerRef = useRef<Worker | null>(null)
  const pending = useRef(new Map<number, (r: Res) => void>())
  const seq = useRef(0)
  const pageRef = useRef<HTMLCanvasElement>(null)

  const card = useMemo<Size>(() => {
    const k = KINDS.find((x) => x.id === kind)!
    if (kind !== 'custom') return { w: k.w, h: k.h }
    const clamp = (v: string, lo: number, hi: number, d: number) => (Number.isFinite(parseFloat(v)) ? Math.min(hi, Math.max(lo, parseFloat(v))) : d)
    return { w: clamp(custom.w, 20, 200, 85.6), h: clamp(custom.h, 20, 140, 54) }
  }, [kind, custom])
  const effect = useMemo<Effect>(() => ({ mode, brightness, contrast: contrast / 100 }), [mode, brightness, contrast])
  const wm = useMemo<Options | null>(() => (useWm && wmText.trim() ? { ...DEFAULTS, text: wmText, size: 0.032, density: 1.1, opacity: 0.4 } : null), [useWm, wmText])
  const present = FACES.map((f) => f.face).filter((f) => photos[f])
  const copies: 1 | 2 = twoUp ? 2 : 1
  const { places, fits } = useMemo(() => layout(card, present.length ? present : ['front', 'back'], copies), [card, present.join(), copies]) // eslint-disable-line

  useEffect(() => {
    const w = new Worker(new URL('./warp.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<Res>) => {
      pending.current.get(e.data.id)?.(e.data)
      pending.current.delete(e.data.id)
    }
    workerRef.current = w
    return () => w.terminate()
  }, [])

  const run = useCallback((face: Face, corners: Pt[], w: number, h: number, eff: Effect) => {
    return new Promise<ImageData>((resolve, reject) => {
      const id = ++seq.current
      pending.current.set(id, (r) => ('error' in r ? reject(new Error(r.error)) : resolve(new ImageData(new Uint8ClampedArray(r.buffer), r.w, r.h))))
      workerRef.current!.postMessage({ type: 'run', id, slot: face, corners, w, h, effect: eff } satisfies Req)
    })
  }, [])

  // Live result next to each editor. One request per photo at a time: while the worker is busy only the
  // newest corner positions are kept, so dragging never builds up a queue.
  const flight = useRef<Record<Face, boolean>>({ front: false, back: false })
  const want = useRef<Partial<Record<Face, [Pt[], Size, Effect]>>>({})
  const pump = useCallback(
    function pump(face: Face) {
      const job = want.current[face]
      if (flight.current[face] || !job) return
      want.current[face] = undefined
      flight.current[face] = true
      run(face, job[0], mmToPx(job[1].w, PREVIEW_DPI), mmToPx(job[1].h, PREVIEW_DPI), job[2])
        .then((img) => setPrev((s) => ({ ...s, [face]: img })))
        .catch(() => setError('这张照片的四个角围成的形状不对，请重新对准。'))
        .finally(() => {
          flight.current[face] = false
          pump(face)
        })
    },
    [run],
  )
  useEffect(() => {
    for (const { face } of FACES) {
      const p = photos[face]
      if (!p) continue
      want.current[face] = [p.corners, card, effect]
      pump(face)
    }
  }, [photos, card, effect, pump])

  async function load(face: Face, file: File) {
    if (!ACCEPT.includes(file.type)) return
    try {
      const full = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const view = await shrink(full)
      const copy = await createImageBitmap(full)
      workerRef.current!.postMessage({ type: 'set', slot: face, bitmap: copy } satisfies Req, [copy])
      setPhotos((s) => {
        s[face]?.full.close()
        s[face]?.view.close()
        return { ...s, [face]: { full, view, corners: START } }
      })
      setError('')
    } catch {
      setError('这张图片读不出来，换一张试试。')
    }
  }

  // Files for a slot: the first goes here, a second one fills the other slot.
  const addFiles = useCallback((face: Face, files: File[]) => {
    const imgs = files.filter((f) => ACCEPT.includes(f.type))
    if (!imgs.length) return
    const other: Face = face === 'front' ? 'back' : 'front'
    setActive(face)
    void load(face, imgs[0])
    if (imgs[1]) void load(other, imgs[1])
  }, []) // eslint-disable-line

  const photosRef = useRef(photos)
  const activeRef = useRef(active)
  useEffect(() => {
    photosRef.current = photos
    activeRef.current = active
  })
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (!files.length) return
      const p = photosRef.current
      const target: Face = !p.front ? 'front' : !p.back ? 'back' : activeRef.current
      addFiles(target, files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  async function rotate(face: Face) {
    const p = photos[face]
    if (!p) return
    const full = await rotateCw(p.full)
    const view = await shrink(full)
    const copy = await createImageBitmap(full)
    workerRef.current!.postMessage({ type: 'set', slot: face, bitmap: copy } satisfies Req, [copy])
    // The corners turn with the picture: (x, y) → (1 − y, x), then back into top-left / top-right / … order.
    const corners = orderCorners(p.corners.map((q) => ({ x: 1 - q.y, y: q.x })))
    p.full.close()
    p.view.close()
    setPhotos((s) => ({ ...s, [face]: { full, view, corners } }))
  }

  function remove(face: Face) {
    photos[face]?.full.close()
    photos[face]?.view.close()
    setPhotos((s) => ({ ...s, [face]: null }))
    setPrev((s) => ({ ...s, [face]: undefined }))
  }

  const setCorners = (face: Face, corners: Pt[]) => setPhotos((s) => (s[face] ? { ...s, [face]: { ...s[face]!, corners } } : s))

  // A4 preview, drawn with real proportions (1 mm is the same number of pixels both ways).
  useEffect(() => {
    const c = pageRef.current
    if (!c) return
    const cards: Cards = {}
    for (const f of present) if (prev[f]) cards[f] = toCanvas(prev[f]!)
    drawPage(c, PAGE_DPI, places, cards, wm, SEED)
    const ctx = c.getContext('2d')!
    ctx.save()
    ctx.setLineDash([6, 5])
    ctx.strokeStyle = '#b4b9c4'
    ctx.fillStyle = '#9aa1af'
    ctx.font = '16px system-ui, sans-serif'
    ctx.textAlign = 'center'
    for (const p of places) {
      if (cards[p.face]) continue
      const r = rectPx(p, PAGE_DPI)
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h)
      ctx.fillText(FACES.find((f) => f.face === p.face)!.label, r.x + r.w / 2, r.y + r.h / 2 + 5)
    }
    ctx.restore()
  }, [places, prev, wm, present.join()]) // eslint-disable-line

  async function highRes(): Promise<Cards> {
    const out: Cards = {}
    for (const f of present) {
      const img = await run(f, photos[f]!.corners, mmToPx(card.w), mmToPx(card.h), effect)
      out[f] = toCanvas(img)
    }
    return out
  }

  async function exportAs(kindOf: 'pdf' | 'png' | 'print') {
    setBusy(kindOf)
    setError('')
    try {
      const cards = await highRes()
      if (kindOf === 'pdf') save(await makePdf(places, cards, wm, SEED), '证件复印件.pdf')
      else {
        const png = await makePng(places, cards, wm, SEED)
        if (kindOf === 'png') save(png, '证件复印件.png')
        else await printPage(png)
      }
    } catch {
      setError('导出失败，请检查四个角的位置后再试。')
    } finally {
      setBusy('')
    }
  }

  const canExport = present.length > 0 && fits && !busy
  const privacy = (
    <p className="text-muted-foreground flex gap-1.5 text-xs">
      <ShieldCheck className="mt-px size-3.5 shrink-0" />
      <span>证件照片只在你的浏览器里处理，不会上传，也不会保存。导出的 PDF 和 PNG 里不带拍摄地点、设备型号等信息。</span>
    </p>
  )

  return (
    <div className="space-y-6">
      <Card className="py-5">
        <CardContent className="space-y-3 px-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">证件类型</span>
            <Segmented value={kind} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} onChange={setKind} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {kind === 'custom' ? (
              <>
                <label className="flex items-center gap-2">
                  宽
                  <input inputMode="decimal" aria-label="宽（mm）" value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} className={cn(inputCls, 'w-24')} />
                </label>
                <label className="flex items-center gap-2">
                  高
                  <input inputMode="decimal" aria-label="高（mm）" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} className={cn(inputCls, 'w-24')} />
                </label>
                <span className="text-muted-foreground">mm</span>
              </>
            ) : (
              <span className="text-muted-foreground tabular-nums">打印出来是 {card.w} × {card.h} mm，和真证件一样大。</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {FACES.map(({ face, label }) => {
          const p = photos[face]
          return (
            <Card key={face} className={cn('py-5', active === face && 'ring-ring/40 ring-1')} onPointerDown={() => setActive(face)}>
              <CardContent className="space-y-3 px-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{label}</p>
                  {p && (
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => rotate(face)}>
                        <RotateCw />
                        旋转 90°
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`移除${label}`} onClick={() => remove(face)}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
                {p ? (
                  <>
                    <CornerEditor photo={p} label={label} onCorners={(c) => setCorners(face, c)} />
                    <p className="text-muted-foreground text-xs">拖动四个角，对准证件的边缘；按住时会出现放大镜。</p>
                    <Result img={prev[face]} label={label} card={card} />
                  </>
                ) : (
                  <Drop label={label} active={active === face} onFiles={(f) => addFiles(face, f)} />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="py-5">
          <CardContent className="space-y-5 px-5">
            <div className="space-y-3">
              <span className="text-sm font-medium">效果</span>
              <div>
                <Segmented value={mode} options={[{ value: 'color', label: '彩色' }, { value: 'bw', label: '黑白复印' }]} onChange={setMode} />
              </div>
              <Slider label="亮度" value={brightness} min={-60} max={60} step={1} show={`${brightness > 0 ? '+' : ''}${brightness}`} onChange={setBrightness} />
              <Slider label="对比度" value={contrast} min={50} max={200} step={5} show={`${contrast}%`} onChange={setContrast} />
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={useWm} onChange={(e) => setUseWm(e.target.checked)} />
                加用途水印
              </label>
              {useWm && (
                <div className="space-y-3">
                  <Segmented
                    value={purpose}
                    options={PURPOSES.map((x) => ({ value: x, label: x }))}
                    onChange={(x) => {
                      setPurpose(x)
                      setWmText(`仅供${x === '自定义' ? customPurpose : x}使用，他用无效`)
                    }}
                  />
                  {purpose === '自定义' && (
                    <input
                      value={customPurpose}
                      placeholder="比如：办理贷款"
                      aria-label="自定义用途"
                      onChange={(e) => {
                        setCustomPurpose(e.target.value)
                        setWmText(`仅供${e.target.value}使用，他用无效`)
                      }}
                      className={inputCls}
                    />
                  )}
                  <input value={wmText} aria-label="水印文字" onChange={(e) => setWmText(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>

            <Separator />

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={twoUp} onChange={(e) => setTwoUp(e.target.checked)} className="mt-1" />
              <span>
                <span className="font-medium">一页放两份</span>
                <span className="text-muted-foreground block text-xs">每一面排两张（2 行 × 2 列），一次打印两份，裁开就是两套。</span>
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="bg-muted grid place-items-center rounded-lg border p-3">
            <canvas ref={pageRef} aria-label="A4 排版预览" className="bg-white h-auto w-full max-w-[360px] shadow-md" style={{ aspectRatio: `${A4.w} / ${A4.h}` }} />
          </div>
          <p className="text-muted-foreground text-center text-xs tabular-nums">
            A4 {A4.w} × {A4.h} mm · 证件 {card.w} × {card.h} mm，预览按真实比例
          </p>
          {!fits && (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>这个尺寸一页 A4 放不下，请改小宽高，或取消“一页放两份”。</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Button disabled={!canExport} onClick={() => exportAs('pdf')}>
              <FileDown />
              导出 PDF
            </Button>
            <Button variant="outline" disabled={!canExport} onClick={() => exportAs('png')}>
              <ImageDown />
              导出 PNG
            </Button>
            <Button variant="outline" disabled={!canExport} onClick={() => exportAs('print')}>
              <Printer />
              直接打印
            </Button>
          </div>
          <p className="bg-muted text-foreground rounded-md px-3 py-2 text-sm" role="note">
            打印时请选择『实际大小 / 100%』，不要选『适合页面』，否则尺寸会变。
          </p>
          {privacy}
        </div>
      </div>
    </div>
  )
}
