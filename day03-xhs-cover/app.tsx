import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardCopy, Download, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { render, TEMPLATES, type Content } from './render'

const ACCENTS = ['#ffd43b', '#34d399', '#ef4444', '#2f5bff', '#ff7ab6', '#a78bfa']

const DEFAULT: Content = {
  title: '**3 个习惯**\n每天多出 2 小时',
  subtitle: '坚持了一个月，第二个最有用',
  tags: ['效率', '自律', '时间管理'],
  author: '@你的昵称',
}

const inputCls =
  'border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {hint && <span className="text-muted-foreground ml-2 text-xs font-normal">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function App() {
  const [content, setContent] = useState<Content>(DEFAULT)
  const [tagText, setTagText] = useState(DEFAULT.tags.join(' '))
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const [accent, setAccent] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const template = useMemo(() => {
    const base = TEMPLATES.find((t) => t.id === templateId)!
    if (!accent) return base
    return { ...base, accent, accentInk: base.highlight === 'color' ? accent : base.accentInk }
  }, [templateId, accent])

  const set = <K extends keyof Content>(k: K, v: Content[K]) => setContent((c) => ({ ...c, [k]: v }))

  useEffect(() => {
    if (canvasRef.current) render(canvasRef.current, content, template)
  }, [content, template])

  function toBlob() {
    return new Promise<Blob | null>((r) => canvasRef.current?.toBlob(r, 'image/png'))
  }

  async function download() {
    const blob = await toBlob()
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cover-${template.id}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function copy() {
    const blob = await toBlob()
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      download()
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,340px)]">
        <Card className="order-2 py-5 md:order-1">
          <CardContent className="space-y-5 px-5">
            <Field label="标题" hint="用 **两个星号** 包住重点词">
              <textarea
                rows={3}
                value={content.title}
                onChange={(e) => set('title', e.target.value)}
                className={cn(inputCls, 'resize-none leading-relaxed')}
              />
            </Field>
            <Field label="副标题">
              <input value={content.subtitle} onChange={(e) => set('subtitle', e.target.value)} className={inputCls} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="标签" hint="空格分隔">
                <input
                  value={tagText}
                  onChange={(e) => {
                    setTagText(e.target.value)
                    set('tags', e.target.value.split(/[\s,，#]+/).filter(Boolean))
                  }}
                  className={inputCls}
                />
              </Field>
              <Field label="署名">
                <input value={content.author} onChange={(e) => set('author', e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">模板</span>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      t.id === templateId ? 'border-foreground bg-accent' : 'hover:bg-accent/60',
                    )}
                  >
                    <span
                      className="size-4 rounded-sm border"
                      style={{ background: t.decor === 'block' ? t.accent : t.bg, boxShadow: `inset 0 -5px 0 ${t.accent}` }}
                    />
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">重点色</span>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`重点色 ${c}`}
                    onClick={() => setAccent(c)}
                    style={{ background: c }}
                    className={cn(
                      'size-7 rounded-full border',
                      accent === c && 'ring-foreground ring-offset-background ring-2 ring-offset-2',
                    )}
                  />
                ))}
                <Button variant="ghost" size="sm" onClick={() => setAccent(null)} disabled={!accent}>
                  默认
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="order-1 space-y-3 md:order-2">
          <canvas ref={canvasRef} className="w-full rounded-lg border shadow-sm" style={{ aspectRatio: '3 / 4' }} />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={download}>
              <Download />
              下载 PNG
            </Button>
            <Button variant="outline" onClick={copy}>
              {copied ? <Check /> : <ClipboardCopy />}
              {copied ? '已复制' : '复制'}
            </Button>
          </div>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ShieldCheck className="size-3.5" />
            1080×1440，小红书 3:4 原尺寸。全部在浏览器里生成
          </p>
        </div>
      </div>
    </div>
  )
}
