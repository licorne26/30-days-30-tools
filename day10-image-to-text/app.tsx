import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardCopy, Download, ImageUp, Loader2, ShieldCheck, TriangleAlert, X } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LOW_CONF, MODEL_MB, joinLines, recognize, type Lang, type Progress, type Result } from './ocr'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const RECENT = 6
const LANGS: { value: Lang; label: string }[] = [
  { value: 'chi_sim+eng', label: '中文 + 英文' },
  { value: 'eng', label: '只识别英文' },
]

type Item = { id: string; file: File; url: string; result?: { key: string; data: Result }; error?: string }

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

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [lang, setLang] = useState<Lang>('chi_sim+eng')
  const [invert, setInvert] = useState(false)
  const [merge, setMerge] = useState(false)
  const [text, setText] = useState('')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const [dragging, setDragging] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const toastTimer = useRef(0)
  const running = useRef('')

  const sel = items.find((i) => i.id === selId) ?? items[0]
  const key = `${lang}|${invert}`
  const result = sel?.result?.key === key ? sel.result.data : null

  const addFiles = useCallback((files: File[]) => {
    const added = files.filter((f) => ACCEPT.includes(f.type)).slice(0, 1) // one picture at a time
    if (!added.length) return
    const file = added[0]
    const item: Item = { id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }
    setItems((prev) => {
      const next = [item, ...prev]
      next.slice(RECENT).forEach((i) => URL.revokeObjectURL(i.url))
      return next.slice(0, RECENT)
    })
    setSelId(item.id)
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => addFiles([...(e.clipboardData?.files ?? [])])
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  // Recognise the selected picture whenever it, the language or the invert switch changes.
  useEffect(() => {
    if (!sel || sel.result?.key === key) return
    const run = `${sel.id}|${key}`
    if (running.current === run) return
    running.current = run
    setBusy(true)
    setProgress({ phase: 'engine', value: 0 })
    recognize(sel.file, lang, invert, setProgress)
      .then((data) => setItems((p) => p.map((i) => (i.id === sel.id ? { ...i, result: { key, data }, error: undefined } : i))))
      .catch(() => setItems((p) => p.map((i) => (i.id === sel.id ? { ...i, error: '这张图片识别失败，换一张试试。' } : i))))
      .finally(() => {
        running.current = ''
        setBusy(false)
        setProgress(null)
      })
  }, [sel, key, lang, invert])

  const generated = useMemo(() => {
    if (!result) return ''
    if (!merge) return result.lines.map((l) => l.text).join('\n')
    const paras = new Map<number, string[]>()
    for (const l of result.lines) paras.set(l.para, [...(paras.get(l.para) ?? []), l.text])
    return [...paras.values()].map(joinLines).join('\n\n')
  }, [result, merge])

  // New recognition or a different layout replaces the text; edits are kept until then.
  const [shownFor, setShownFor] = useState('')
  if (generated !== shownFor) {
    setShownFor(generated)
    setText(generated)
  }

  function flash(msg: string) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 1600)
  }

  async function copy(t: string, msg = '已复制') {
    try {
      await navigator.clipboard.writeText(t)
      flash(msg)
    } catch {
      flash('浏览器不让复制，请手动选中')
    }
  }

  function pickLine(i: number) {
    if (!result) return
    setActive(i)
    copy(result.lines[i].text)
    // Show the same line in the text box, while that box still holds the untouched lines.
    const a = areaRef.current
    if (a && !merge && text === generated) {
      const start = result.lines.slice(0, i).reduce((s, l) => s + l.text.length + 1, 0)
      a.focus({ preventScroll: true })
      a.setSelectionRange(start, start + result.lines[i].text.length)
    }
  }

  function download() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    a.download = `${sel?.file.name.replace(/\.[^.]+$/, '') || 'text'}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  function remove(id: string) {
    const it = items.find((i) => i.id === id)
    if (it) URL.revokeObjectURL(it.url)
    const rest = items.filter((i) => i.id !== id)
    setItems(rest)
    if (selId === id) setSelId(rest[0]?.id ?? null)
  }

  const privacy = (
    <p className="text-muted-foreground flex gap-1.5 text-xs">
      <ShieldCheck className="mt-px size-3.5 shrink-0" />
      <span>图片只在你的浏览器里识别，不会上传到任何地方。识别模型是这个网站自带的文件，不依赖别人的服务器。</span>
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
            <p className="font-medium">截完图直接粘贴，或拖入、点击选择图片</p>
            <p className="text-muted-foreground mt-1 text-sm">
              按 <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">⌘ V</kbd> / <kbd className="bg-muted rounded px-1.5 py-0.5 text-xs">Ctrl V</kbd> 粘贴，支持 JPG、PNG、WebP
            </p>
          </div>
          <input type="file" accept={ACCEPT.join(',')} className="sr-only" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
        </label>
        <p className="text-muted-foreground text-center text-xs">首次使用需要下载识别模型，约 {MODEL_MB['chi_sim+eng']} MB，之后会缓存。</p>
        <div className="flex justify-center">{privacy}</div>
      </div>
    )
  }

  const loading = busy && progress
  const lowCount = result?.lines.filter((l) => l.conf < LOW_CONF).length ?? 0

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-lg border">
          {sel && <img src={sel.url} alt="待识别的图片" draggable={false} className={cn('block w-full', busy && 'opacity-60')} />}
          {result && (
            <div className="absolute inset-0">
              {result.lines.map((l, i) => (
                <button
                  key={i}
                  type="button"
                  title={l.conf < LOW_CONF ? '这一行可能不准，请核对' : '点一下复制这一行'}
                  aria-label={`第 ${i + 1} 行：${l.text}`}
                  onClick={() => pickLine(i)}
                  style={{ left: `${(l.x / result.width) * 100}%`, top: `${(l.y / result.height) * 100}%`, width: `${(l.w / result.width) * 100}%`, height: `${(l.h / result.height) * 100}%` }}
                  className={cn(
                    'absolute rounded-[3px] border transition-colors',
                    l.conf < LOW_CONF ? 'border-amber-500 bg-amber-500/20 hover:bg-amber-500/40' : 'border-primary/60 bg-primary/10 hover:bg-primary/30',
                    active === i && 'bg-primary/30 ring-primary ring-2',
                  )}
                />
              ))}
            </div>
          )}
          {toast && (
            <div role="status" className="bg-primary text-primary-foreground absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium shadow-lg">
              <Check className="size-4" />
              {toast}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {items.map((it) => (
            <div key={it.id} className={cn('bg-muted relative size-14 overflow-hidden rounded-md border', sel?.id === it.id && 'ring-ring ring-2')}>
              <button type="button" aria-label={`切到 ${it.file.name}`} onClick={() => setSelId(it.id)} className="size-full">
                <img src={it.url} alt="" className="size-full object-cover object-top" />
              </button>
              <button type="button" aria-label="移除" onClick={() => remove(it.id)} className="bg-background/80 absolute top-0.5 right-0.5 grid size-4 place-items-center rounded-full">
                <X className="size-3" />
              </button>
            </div>
          ))}
          <label className="hover:bg-accent text-muted-foreground grid size-14 cursor-pointer place-items-center rounded-md border border-dashed text-xs">
            添加
            <input type="file" accept={ACCEPT.join(',')} className="sr-only" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = '' }} />
          </label>
          <span className="text-muted-foreground text-xs">也可以直接粘贴</span>
        </div>
        {lowCount > 0 && (
          <p className="flex gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {lowCount} 行用黄色标出，这些行可能不准，请核对。
          </p>
        )}
      </div>

      <Card className="py-5">
        <CardContent className="space-y-4 px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Segmented value={lang} options={LANGS} onChange={setLang} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
              反色（深色背景）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
              合并成段落
            </label>
          </div>

          {loading && (
            <div className="bg-muted/50 space-y-2 rounded-lg border p-3 text-sm" role="status">
              <p className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {progress.phase === 'model'
                  ? `首次使用需要下载识别模型，约 ${MODEL_MB[lang]} MB，之后会缓存`
                  : progress.phase === 'read'
                    ? '正在识别…'
                    : '正在准备识别引擎…'}
              </p>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full" role="progressbar" aria-valuenow={Math.round(progress.value * 100)}>
                <div className="bg-primary h-full transition-[width]" style={{ width: `${Math.round(progress.value * 100)}%` }} />
              </div>
            </div>
          )}
          {sel?.error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>识别失败</AlertTitle>
              <AlertDescription>{sel.error}</AlertDescription>
            </Alert>
          )}
          {result && result.lines.length === 0 && <p className="text-muted-foreground text-sm">没有识别到文字。深色背景的图可以试试“反色”。</p>}

          <textarea
            ref={areaRef}
            aria-label="识别结果"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={busy ? '识别中…' : '识别结果会出现在这里，可以直接修改'}
            className="border-input focus-visible:ring-ring/50 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-[3px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!text} onClick={() => copy(text)}>
              <ClipboardCopy />
              复制全部
            </Button>
            <Button variant="outline" disabled={!text} onClick={download}>
              <Download />
              下载 .txt
            </Button>
          </div>

          {result && result.lines.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm" aria-label="逐行置信度">
              {result.lines.map((l, i) => (
                <li key={i}>
                  <button type="button" onClick={() => pickLine(i)} className={cn('hover:bg-accent/50 flex w-full items-center gap-3 px-3 py-1.5 text-left', active === i && 'bg-accent')}>
                    <span className="min-w-0 flex-1 truncate">{l.text}</span>
                    <Badge variant={l.conf < LOW_CONF ? 'outline' : 'secondary'} className={cn('tabular-nums', l.conf < LOW_CONF && 'border-amber-500 text-amber-600 dark:text-amber-400')}>
                      {Math.round(l.conf)}%{l.conf < LOW_CONF && ' · 请核对'}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {privacy}
        </CardContent>
      </Card>
    </div>
  )
}
