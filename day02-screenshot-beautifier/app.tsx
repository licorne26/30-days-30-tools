import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ClipboardCopy, Download, ImageUp, Moon, RotateCcw, ShieldCheck, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { render, type Background, type Frame, type Options, type Ratio } from './render'

const BACKGROUNDS: { name: string; bg: Background }[] = [
  { name: '薄荷', bg: { kind: 'gradient', from: '#6ee7b7', to: '#0ea5e9' } },
  { name: '晚霞', bg: { kind: 'gradient', from: '#fdba74', to: '#e11d48' } },
  { name: '暮紫', bg: { kind: 'gradient', from: '#c4b5fd', to: '#4f46e5' } },
  { name: '奶油', bg: { kind: 'gradient', from: '#fef3c7', to: '#fbcfe8' } },
  { name: '石墨', bg: { kind: 'gradient', from: '#3f3f46', to: '#09090b' } },
  { name: '雾白', bg: { kind: 'solid', color: '#f4f4f5' } },
  { name: '纯黑', bg: { kind: 'solid', color: '#0a0a0a' } },
  { name: '透明', bg: { kind: 'none' } },
]

const FRAMES: { value: Frame; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'mac', label: 'macOS' },
  { value: 'browser', label: '浏览器' },
]

const RATIOS: { value: Ratio; label: string; hint?: string }[] = [
  { value: 'auto', label: '自适应' },
  { value: '16:9', label: '16:9', hint: 'X' },
  { value: '3:4', label: '3:4', hint: '小红书' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5', hint: 'Instagram' },
]

const DEFAULTS: Options = {
  background: BACKGROUNDS[0].bg,
  frame: 'mac',
  frameDark: false,
  url: '',
  padding: 8,
  radius: 1.2,
  shadow: 60,
  ratio: 'auto',
}

function swatchStyle(bg: Background): React.CSSProperties {
  if (bg.kind === 'gradient') return { backgroundImage: `linear-gradient(135deg, ${bg.from}, ${bg.to})` }
  if (bg.kind === 'solid') return { background: bg.color }
  return {
    backgroundImage:
      'linear-gradient(45deg,#d4d4d8 25%,transparent 25%,transparent 75%,#d4d4d8 75%),linear-gradient(45deg,#d4d4d8 25%,transparent 25%,transparent 75%,#d4d4d8 75%)',
    backgroundSize: '10px 10px',
    backgroundPosition: '0 0,5px 5px',
    backgroundColor: '#fff',
  }
}

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
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="grid gap-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{Number.isInteger(step) ? value : value.toFixed(1)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-foreground h-1.5 w-full cursor-pointer"
      />
    </label>
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

export function App() {
  const [img, setImg] = useState<ImageBitmap | null>(null)
  const [name, setName] = useState('screenshot')
  const [opts, setOpts] = useState<Options>(DEFAULTS)
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const set = <K extends keyof Options>(k: K, v: Options[K]) => setOpts((o) => ({ ...o, [k]: v }))

  const load = useCallback(async (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setImg(await createImageBitmap(file))
    setName(file.name.replace(/\.[^.]+$/, '') || 'screenshot')
  }, [])

  // Paste a screenshot straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (file) load(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [load])

  useEffect(() => {
    if (img && canvasRef.current) render(canvasRef.current, img, opts)
  }, [img, opts])

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${name}-pretty.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, 'image/png')
  }

  async function copy() {
    const blob = await new Promise<Blob | null>((r) => canvasRef.current?.toBlob(r, 'image/png'))
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      download()
    }
  }

  if (!img) {
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
            <ImageUp className="text-muted-foreground size-5" />
          </div>
          <div>
            <p className="font-medium">拖入截图，或点击选择</p>
            <p className="text-muted-foreground mt-1 text-sm">
              也可以截完图直接按 <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">⌘ V</kbd> /{' '}
              <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">Ctrl V</kbd> 粘贴
            </p>
          </div>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
        </label>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
          <ShieldCheck className="size-3.5" />
          截图只在你的浏览器里处理，不会上传到任何地方
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div
        className="grid place-items-center overflow-hidden rounded-xl border p-4 sm:p-6"
        style={{
          backgroundImage:
            'linear-gradient(45deg,var(--muted) 25%,transparent 25%,transparent 75%,var(--muted) 75%),linear-gradient(45deg,var(--muted) 25%,transparent 25%,transparent 75%,var(--muted) 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0,8px 8px',
        }}
      >
        <canvas ref={canvasRef} className="h-auto max-h-[70svh] w-auto max-w-full" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={download}>
          <Download />
          下载 PNG
        </Button>
        <Button variant="outline" onClick={copy}>
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? '已复制' : '复制图片'}
        </Button>
        <Button variant="ghost" onClick={() => setImg(null)}>
          <RotateCcw />
          换一张
        </Button>
      </div>

      <Card className="py-5">
        <CardContent className="space-y-5 px-5">
          <Row label="背景">
            <div className="flex flex-wrap gap-2">
              {BACKGROUNDS.map((b) => (
                <button
                  key={b.name}
                  type="button"
                  title={b.name}
                  aria-label={b.name}
                  onClick={() => set('background', b.bg)}
                  style={swatchStyle(b.bg)}
                  className={cn(
                    'size-8 rounded-full border transition-shadow',
                    opts.background === b.bg && 'ring-foreground ring-offset-background ring-2 ring-offset-2',
                  )}
                />
              ))}
            </div>
          </Row>

          <Row label="窗口">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented value={opts.frame} options={FRAMES} onChange={(v) => set('frame', v)} />
              {opts.frame !== 'none' && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="切换窗口深浅色"
                  onClick={() => set('frameDark', !opts.frameDark)}
                >
                  {opts.frameDark ? <Moon /> : <Sun />}
                </Button>
              )}
            </div>
          </Row>

          {opts.frame === 'browser' && (
            <Row label="网址">
              <input
                value={opts.url}
                onChange={(e) => set('url', e.target.value)}
                placeholder="example.com"
                className="border-input focus-visible:ring-ring/50 h-9 w-full max-w-xs rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:ring-[3px]"
              />
            </Row>
          )}

          <Row label="比例">
            <Segmented value={opts.ratio} options={RATIOS} onChange={(v) => set('ratio', v)} />
          </Row>

          <div className="grid gap-5 sm:grid-cols-3">
            <Slider label="边距" value={opts.padding} min={0} max={25} step={1} onChange={(v) => set('padding', v)} />
            <Slider label="圆角" value={opts.radius} min={0} max={4} step={0.2} onChange={(v) => set('radius', v)} />
            <Slider label="阴影" value={opts.shadow} min={0} max={100} step={5} onChange={(v) => set('shadow', v)} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
