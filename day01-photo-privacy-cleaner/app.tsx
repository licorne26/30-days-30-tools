import { useCallback, useRef, useState } from 'react'
import { Camera, Clock, Download, ImageUp, MapPin, ShieldCheck, Smartphone, Trash2 } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { cleanImage, readExif, type PhotoInfo } from './exif'

type Item = {
  id: string
  name: string
  originalSize: number
  info: PhotoInfo
  cleaned: Blob
  url: string
}

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']

function formatSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

function cleanName(name: string) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)}-clean${name.slice(dot)}` : `${name}-clean`
}

function download(item: Item) {
  const a = document.createElement('a')
  a.href = item.url
  a.download = cleanName(item.name)
  a.click()
}

export function App() {
  const [items, setItems] = useState<Item[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = [...files].filter((f) => ACCEPT.includes(f.type))
    if (!list.length) return
    setBusy(true)
    const added: Item[] = []
    for (const file of list) {
      const info = file.type === 'image/jpeg' ? readExif(await file.arrayBuffer()) : {}
      const cleaned = await cleanImage(file)
      added.push({
        id: crypto.randomUUID(),
        name: file.name,
        originalSize: file.size,
        info,
        cleaned,
        url: URL.createObjectURL(cleaned),
      })
    }
    setItems((prev) => [...added, ...prev])
    setBusy(false)
  }, [])

  function clearAll() {
    items.forEach((i) => URL.revokeObjectURL(i.url))
    setItems([])
  }

  const exposed = items.filter((i) => i.info.lat != null).length

  return (
    <div className="space-y-6">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors',
          dragging ? 'border-foreground/40 bg-accent' : 'hover:bg-accent/50',
        )}
      >
        <div className="bg-muted grid size-12 place-items-center rounded-full">
          <ImageUp className="text-muted-foreground size-5" />
        </div>
        <div>
          <p className="font-medium">{busy ? '正在处理…' : '拖入照片，或点击选择'}</p>
          <p className="text-muted-foreground mt-1 text-sm">支持 JPG、PNG、WebP，可以一次选多张</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(',')}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
        <ShieldCheck className="size-3.5" />
        照片只在你的浏览器里处理，不会上传到任何地方
      </p>

      {exposed > 0 && (
        <Alert variant="destructive">
          <MapPin />
          <AlertTitle>
            {exposed} 张照片带着拍摄地点
          </AlertTitle>
          <AlertDescription>原图发出去，别人就能从文件里读到这个位置。下载清理后的版本再分享。</AlertDescription>
        </Alert>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-sm font-medium">{items.length} 张照片</h2>
            <div className="flex gap-2">
              {items.length > 1 && (
                <Button size="sm" onClick={() => items.forEach((it, i) => setTimeout(() => download(it), i * 300))}>
                  <Download />
                  全部下载
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={clearAll}>
                <Trash2 />
                清空
              </Button>
            </div>
          </div>
          {items.map((item) => (
            <PhotoCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoCard({ item }: { item: Item }) {
  const { info } = item
  const device = [info.make, info.model].filter(Boolean).join(' ')
  const hasGps = info.lat != null && info.lon != null
  const rows = [
    hasGps && { icon: MapPin, label: '拍摄地点', value: `${info.lat!.toFixed(5)}, ${info.lon!.toFixed(5)}`, danger: true },
    device && { icon: Smartphone, label: '设备', value: device },
    info.takenAt && { icon: Clock, label: '拍摄时间', value: info.takenAt.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') },
    info.lens && { icon: Camera, label: '镜头', value: info.lens },
  ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string; danger?: boolean }[]

  return (
    <Card className="py-4">
      <CardContent className="flex gap-4 px-4">
        <img src={item.url} alt="" className="bg-muted size-20 shrink-0 rounded-md object-cover sm:size-24" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{item.name}</p>
            {rows.length ? (
              <Badge variant="destructive">发现 {rows.length} 项隐私信息</Badge>
            ) : (
              <Badge variant="secondary">没有发现隐私信息</Badge>
            )}
          </div>

          {rows.length > 0 && (
            <dl className="grid gap-1.5 text-sm">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-2">
                  <r.icon className={cn('size-3.5 shrink-0', r.danger ? 'text-destructive' : 'text-muted-foreground')} />
                  <dt className="text-muted-foreground w-16 shrink-0">{r.label}</dt>
                  <dd className={cn('truncate', r.danger && 'text-destructive font-medium')}>{r.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => download(item)}>
              <Download />
              下载干净的照片
            </Button>
            {hasGps && (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${info.lat}&mlon=${info.lon}#map=16/${info.lat}/${info.lon}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin />
                  在地图上看
                </a>
              </Button>
            )}
            <span className="text-muted-foreground text-xs">
              {formatSize(item.originalSize)} → {formatSize(item.cleaned.size)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
