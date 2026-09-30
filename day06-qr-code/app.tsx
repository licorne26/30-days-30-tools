import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardCopy, Download, Eye, EyeOff, ImagePlus, ShieldCheck, TriangleAlert, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { vcardPayload, wifiPayload, type Card as VCard, type Wifi, type WifiSecurity } from './payload'
import { contrastIssue, drawCanvas, layout, toSvg, type Design, type DotStyle, type EyeStyle } from './render'

type Mode = 'wifi' | 'text' | 'card'

const MODES: { value: Mode; label: string }[] = [
  { value: 'wifi', label: 'WiFi' },
  { value: 'text', label: '网址 / 文字' },
  { value: 'card', label: '名片' },
]
const SECURITY: { value: WifiSecurity; label: string }[] = [
  { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: '无密码' },
]
const DOTS: { value: DotStyle; label: string }[] = [
  { value: 'square', label: '方块' },
  { value: 'rounded', label: '圆角' },
  { value: 'dots', label: '圆点' },
]
const EYES: { value: EyeStyle; label: string }[] = [
  { value: 'square', label: '方形' },
  { value: 'rounded', label: '圆角' },
  { value: 'circle', label: '圆形' },
]
const PALETTES = [
  { name: '经典黑', fg: '#111111', bg: '#ffffff' },
  { name: '墨绿', fg: '#0f5132', bg: '#f1f8f4' },
  { name: '深蓝', fg: '#1e3a8a', bg: '#eff4ff' },
  { name: '酒红', fg: '#7f1d1d', bg: '#fdf2f2' },
  { name: '咖啡', fg: '#4a3222', bg: '#f7f0e6' },
  { name: '紫罗兰', fg: '#4c1d95', bg: '#f5f3ff' },
]

const inputCls =
  'border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]'

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function autoCaption(mode: Mode, wifi: Wifi, card: VCard) {
  if (mode === 'wifi') return { title: '扫码连接 WiFi', subtitle: wifi.ssid ? `网络：${wifi.ssid}` : '' }
  if (mode === 'card') return { title: card.name ? `${card.name}的名片` : '扫码保存名片', subtitle: card.org }
  return { title: '', subtitle: '' }
}

export function App() {
  const [mode, setMode] = useState<Mode>('wifi')
  const [wifi, setWifi] = useState<Wifi>({ ssid: 'MyHome-5G', password: 'welcome2026', security: 'WPA', hidden: false })
  const [showPass, setShowPass] = useState(false)
  const [text, setText] = useState('https://licorne26.github.io/30-days-30-tools/')
  const [card, setCard] = useState<VCard>({ name: '独角兽', phone: '', email: '', org: '', title: '', url: '' })

  const [fg, setFg] = useState(PALETTES[0].fg)
  const [bg, setBg] = useState(PALETTES[0].bg)
  const [dots, setDots] = useState<DotStyle>('rounded')
  const [eyes, setEyes] = useState<EyeStyle>('rounded')
  const [margin, setMargin] = useState(4)
  const [logo, setLogo] = useState<{ img: HTMLImageElement; url: string } | null>(null)

  // Caption follows the content until the user edits it by hand.
  const [caption, setCaption] = useState<{ title: string; subtitle: string } | null>(null)
  const auto = autoCaption(mode, wifi, card)
  const title = caption?.title ?? auto.title
  const subtitle = caption?.subtitle ?? auto.subtitle

  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const payload = useMemo(() => {
    if (mode === 'wifi') return wifi.ssid ? wifiPayload(wifi) : ''
    if (mode === 'card') return card.name.trim() ? vcardPayload(card) : ''
    return text.trim()
  }, [mode, wifi, card, text])

  const design: Design = { fg, bg, eye: fg, dots, eyes, margin, title, subtitle, logo: logo?.img ?? null, logoUrl: logo?.url ?? null }
  const result = useMemo(() => (payload ? layout(payload, design) : null), [payload, fg, bg, dots, eyes, margin, title, subtitle, logo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (result && canvasRef.current) drawCanvas(canvasRef.current, result, design)
  }) // redraw after every render; drawing is cheap

  const contrast = contrastIssue(fg, bg)

  function onLogo(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => setLogo({ img, url: reader.result as string })
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  function fileBase() {
    return mode === 'wifi' ? `qr-wifi-${wifi.ssid || 'network'}` : mode === 'card' ? `qr-card-${card.name || 'contact'}` : 'qr-code'
  }

  function save(blob: Blob, name: string) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  function pngBlob() {
    // Export at 2× so it stays sharp when printed.
    const c = document.createElement('canvas')
    drawCanvas(c, result!, design, 2)
    return new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  }

  async function downloadPng() {
    const b = await pngBlob()
    if (b) save(b, `${fileBase()}.png`)
  }

  function downloadSvg() {
    save(new Blob([toSvg(result!, design)], { type: 'image/svg+xml' }), `${fileBase()}.svg`)
  }

  async function copy() {
    const b = await pngBlob()
    if (!b) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      save(b, `${fileBase()}.png`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,320px)]">
        <Card className="order-2 py-5 md:order-1">
          <CardContent className="space-y-5 px-5">
            <Segmented
              value={mode}
              options={MODES}
              onChange={(m) => {
                setMode(m)
                setCaption(null)
              }}
            />

            {mode === 'wifi' && (
              <div className="grid gap-4">
                <Field label="WiFi 名称">
                  <input
                    value={wifi.ssid}
                    onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })}
                    placeholder="路由器上显示的网络名"
                    className={inputCls}
                  />
                </Field>
                {wifi.security !== 'nopass' && (
                  <Field label="密码">
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        value={wifi.password}
                        onChange={(e) => setWifi({ ...wifi, password: e.target.value })}
                        className={cn(inputCls, 'pr-10')}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        aria-label={showPass ? '隐藏密码' : '显示密码'}
                        onClick={() => setShowPass(!showPass)}
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                      >
                        {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </Field>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented value={wifi.security} options={SECURITY} onChange={(v) => setWifi({ ...wifi, security: v })} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={wifi.hidden} onChange={(e) => setWifi({ ...wifi, hidden: e.target.checked })} />
                    隐藏网络
                  </label>
                </div>
              </div>
            )}

            {mode === 'text' && (
              <Field label="网址或任意文字">
                <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} className={cn(inputCls, 'resize-none')} />
              </Field>
            )}

            {mode === 'card' && (
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ['name', '姓名'],
                    ['phone', '手机'],
                    ['email', '邮箱'],
                    ['org', '公司'],
                    ['title', '职位'],
                    ['url', '网站'],
                  ] as const
                ).map(([k, label]) => (
                  <Field key={k} label={label}>
                    <input value={card[k]} onChange={(e) => setCard({ ...card, [k]: e.target.value })} className={inputCls} />
                  </Field>
                ))}
              </div>
            )}

            <Separator />

            <div className="flex flex-col items-start gap-2.5">
              <span className="text-sm font-medium">配色</span>
              <div className="flex flex-wrap items-center gap-2">
                {PALETTES.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.name}
                    aria-label={`配色 ${p.name}`}
                    onClick={() => {
                      setFg(p.fg)
                      setBg(p.bg)
                    }}
                    className={cn(
                      'size-8 rounded-full border',
                      fg === p.fg && bg === p.bg && 'ring-foreground ring-offset-background ring-2 ring-offset-2',
                    )}
                    style={{ background: `linear-gradient(135deg, ${p.bg} 50%, ${p.fg} 50%)` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  码点
                  <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="size-7 cursor-pointer rounded border bg-transparent" />
                </label>
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  背景
                  <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="size-7 cursor-pointer rounded border bg-transparent" />
                </label>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="flex flex-col items-start gap-2">
                <span className="text-sm font-medium">码点</span>
                <Segmented value={dots} options={DOTS} onChange={setDots} />
              </div>
              <div className="flex flex-col items-start gap-2">
                <span className="text-sm font-medium">码眼</span>
                <Segmented value={eyes} options={EYES} onChange={setEyes} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">边距</span>
                  <span className="text-muted-foreground tabular-nums">{margin} 格</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={6}
                  step={1}
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="accent-foreground h-1.5 w-full cursor-pointer"
                />
              </label>
              <div className="grid gap-2">
                <span className="text-sm font-medium">中间 Logo</span>
                {logo ? (
                  <div className="flex items-center gap-2">
                    <img src={logo.url} alt="" className="size-8 rounded border object-contain" />
                    <Button variant="ghost" size="sm" onClick={() => setLogo(null)}>
                      <X />
                      移除
                    </Button>
                  </div>
                ) : (
                  <label className="hover:bg-accent inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
                    <ImagePlus className="size-4" />
                    上传图片
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
                  </label>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="卡片标题">
                <input
                  value={title}
                  placeholder="不填就不显示"
                  onChange={(e) => setCaption({ title: e.target.value, subtitle })}
                  className={inputCls}
                />
              </Field>
              <Field label="卡片副标题">
                <input
                  value={subtitle}
                  placeholder="不填就不显示"
                  onChange={(e) => setCaption({ title, subtitle: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <div className="order-1 space-y-3 md:order-2">
          <div className="bg-muted/40 grid place-items-center rounded-lg border p-3">
            {result ? (
              <canvas ref={canvasRef} className="h-auto w-full rounded-md shadow-sm" aria-label="二维码预览" />
            ) : (
              <p className="text-muted-foreground py-24 text-sm">{mode === 'wifi' ? '先填 WiFi 名称' : mode === 'card' ? '先填姓名' : '先输入内容'}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!result} onClick={downloadPng}>
              <Download />
              下载 PNG
            </Button>
            <Button variant="outline" disabled={!result} onClick={downloadSvg}>
              SVG
            </Button>
            <Button variant="outline" disabled={!result} onClick={copy} aria-label="复制图片">
              {copied ? <Check /> : <ClipboardCopy />}
            </Button>
          </div>
          {result && (
            <p className="text-muted-foreground text-xs tabular-nums">
              版本 {result.version} · {result.size}×{result.size} 格 · 纠错 {result.ecc}
              {logo ? '（加了 Logo，自动用最高纠错）' : ''}
            </p>
          )}
          {contrast && (
            <p className="flex gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              {contrast}
            </p>
          )}
          <p className="text-muted-foreground flex gap-1.5 text-xs">
            <ShieldCheck className="mt-px size-3.5 shrink-0" />
            WiFi 密码和名片信息只在你的浏览器里变成二维码，不会上传到任何地方。
          </p>
        </div>
      </div>
    </div>
  )
}
