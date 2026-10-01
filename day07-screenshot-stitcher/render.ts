// Canvas drawing shared by the preview and the export: both paint a band of the long image from
// the same Layout, then pixelate the mosaic rectangles on a grid anchored at the long image's origin.
import { zipSync } from 'fflate'

import { clipRects, segments, type Layout, type Rect } from './stitch'

export type Format = 'png' | 'jpg'

/** One screenshot as decoded (original size); the layout works in common-width pixels. */
export type Source = { bitmap: ImageBitmap }

/**
 * Paint long-image rows [y0, y0 + h) into ctx at `k` output pixels per long-image pixel, then the
 * mosaic. `cell` is the mosaic cell size in long-image pixels.
 */
export function drawBand(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  sources: Source[],
  y0: number,
  h: number,
  k: number,
  mosaics: Rect[],
  cell: number,
) {
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (const p of l.pieces) {
    const top = Math.max(p.dy, y0)
    const bottom = Math.min(p.dy + p.sh, y0 + h)
    if (bottom <= top) continue
    const bmp = sources[p.index].bitmap
    const f = bmp.width / l.width // original pixels per long-image pixel
    const sy = p.sy + (top - p.dy)
    ctx.drawImage(bmp, 0, sy * f, bmp.width, (bottom - top) * f, 0, (top - y0) * k, l.width * k, (bottom - top) * k)
  }
  for (const r of clipRects(mosaics, y0, h)) pixelate(ctx, r, k, cell, y0)
}

/** Replace a rectangle (band coordinates) with flat cells, the grid anchored at long-image y = 0. */
function pixelate(ctx: CanvasRenderingContext2D, r: Rect, k: number, cell: number, y0: number) {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const x1 = Math.max(0, Math.floor(r.x * k))
  const y1 = Math.max(0, Math.floor(r.y * k))
  const x2 = Math.min(W, Math.ceil((r.x + r.w) * k))
  const y2 = Math.min(H, Math.ceil((r.y + r.h) * k))
  if (x2 <= x1 || y2 <= y1) return
  const img = ctx.getImageData(x1, y1, x2 - x1, y2 - y1)
  const d = img.data
  const w = x2 - x1
  // Cell edges in output pixels, on the global grid.
  const edges = (from: number, to: number, origin: number) => {
    const out = [from]
    let e = Math.ceil((from / k + origin) / cell) * cell
    for (; (e - origin) * k < to; e += cell) {
      const px = Math.round((e - origin) * k)
      if (px > out[out.length - 1]) out.push(px)
    }
    out.push(to)
    return out
  }
  const xs = edges(x1, x2, 0)
  const ys = edges(y1, y2, y0)
  for (let a = 0; a < ys.length - 1; a++) {
    for (let b = 0; b < xs.length - 1; b++) {
      const sum = [0, 0, 0, 0]
      let n = 0
      for (let y = ys[a]; y < ys[a + 1]; y++) {
        for (let x = xs[b]; x < xs[b + 1]; x++) {
          const i = ((y - y1) * w + (x - x1)) * 4
          sum[0] += d[i]
          sum[1] += d[i + 1]
          sum[2] += d[i + 2]
          sum[3] += d[i + 3]
          n++
        }
      }
      if (!n) continue
      const c = sum.map((v) => Math.round(v / n))
      for (let y = ys[a]; y < ys[a + 1]; y++) {
        for (let x = xs[b]; x < xs[b + 1]; x++) {
          const i = ((y - y1) * w + (x - x1)) * 4
          d[i] = c[0]
          d[i + 1] = c[1]
          d[i + 2] = c[2]
          d[i + 3] = c[3]
        }
      }
    }
  }
  ctx.putImageData(img, x1, y1)
}

export const BASE_NAME = 'long-screenshot'

/** Render the long image at full size; split into several images when it is over the canvas limits. */
export async function exportImages(l: Layout, sources: Source[], mosaics: Rect[], cell: number, format: Format) {
  const type = format === 'png' ? 'image/png' : 'image/jpeg'
  const parts = segments(l.height, l.width, cell)
  const files: { name: string; blob: Blob }[] = []
  for (const [i, s] of parts.entries()) {
    const canvas = document.createElement('canvas')
    canvas.width = l.width
    canvas.height = s.h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    if (format === 'jpg') {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, l.width, s.h)
    }
    drawBand(ctx, l, sources, s.y, s.h, 1, mosaics, cell)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.92))
    canvas.width = canvas.height = 0 // free the backing store before the next part
    if (!blob) throw new Error('导出失败')
    const name = parts.length > 1 ? `${BASE_NAME}-${String(i + 1).padStart(2, '0')}.${format}` : `${BASE_NAME}.${format}`
    files.push({ name, blob })
  }
  return files
}

export async function zipFiles(files: { name: string; blob: Blob }[]) {
  const entries: Record<string, Uint8Array> = {}
  for (const f of files) entries[f.name] = new Uint8Array(await f.blob.arrayBuffer())
  // PNG and JPG are already compressed; storing is instant and just as small.
  return new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' })
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
