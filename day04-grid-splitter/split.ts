import { zipSync } from 'fflate'

import { cellRects, cellResolution, cropRect, frameRect, scaleRect, type Layout, type Size, type View } from './crop'

export type Format = 'jpg' | 'png'

/** Long edge of the downscaled copy used for the stage and preview; the original is only touched on export. */
const PREVIEW_EDGE = 2048

export type Source = {
  /** Full-resolution image, EXIF orientation already applied. */
  original: ImageBitmap
  /** Small copy for drawing on screen. */
  preview: ImageBitmap
  /** preview pixels per original pixel */
  scale: number
  size: Size
}

export async function decode(file: Blob): Promise<Source> {
  const original = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const size = { width: original.width, height: original.height }
  const scale = Math.min(1, PREVIEW_EDGE / Math.max(size.width, size.height))
  const preview =
    scale < 1
      ? await createImageBitmap(original, {
          resizeWidth: Math.round(size.width * scale),
          resizeHeight: Math.round(size.height * scale),
          resizeQuality: 'high',
        })
      : original
  return { original, preview, scale: preview.width / size.width, size }
}

/** Size a canvas's backing store to its CSS box at device pixel ratio and return a context in CSS pixels. */
function fit(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(width * dpr)
  const h = Math.round(height * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

/** The editing stage: whole image, everything outside the crop box dimmed, cut lines on top. */
export function drawStage(canvas: HTMLCanvasElement, stage: Size, src: Source, layout: Layout, view: View) {
  const ctx = fit(canvas, stage.width, stage.height)
  const frame = frameRect(stage, layout)
  const crop = cropRect(src.size, layout, view)
  const k = frame.w / crop.w
  const ix = frame.x - crop.x * k
  const iy = frame.y - crop.y * k
  const iw = src.size.width * k
  const ih = src.size.height * k
  ctx.drawImage(src.preview, ix, iy, iw, ih)

  // Dim only the part of the image that gets cut off; the empty stage keeps its theme colour.
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.beginPath()
  ctx.rect(ix, iy, iw, ih)
  ctx.rect(frame.x, frame.y, frame.w, frame.h)
  ctx.fill('evenodd')

  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 2
  ctx.lineWidth = 1
  ctx.beginPath()
  const cell = frame.w / layout.cols
  for (let c = 1; c < layout.cols; c++) {
    const x = Math.round(frame.x + c * cell) + 0.5
    ctx.moveTo(x, frame.y)
    ctx.lineTo(x, frame.y + frame.h)
  }
  for (let r = 1; r < layout.rows; r++) {
    const y = Math.round(frame.y + r * cell) + 0.5
    ctx.moveTo(frame.x, y)
    ctx.lineTo(frame.x + frame.w, y)
  }
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.strokeRect(frame.x, frame.y, frame.w, frame.h)
  ctx.restore()
}

/** The Moments-style grid: every cell drawn separately with a gap, exactly as posted. */
export function drawGrid(canvas: HTMLCanvasElement, cellPx: number, gap: number, src: Source, layout: Layout, view: View) {
  const width = layout.cols * cellPx + (layout.cols - 1) * gap
  const height = layout.rows * cellPx + (layout.rows - 1) * gap
  const ctx = fit(canvas, width, height)
  cellRects(src.size, layout, view).forEach((r, i) => {
    const s = scaleRect(r, src.scale)
    const col = i % layout.cols
    const row = Math.floor(i / layout.cols)
    ctx.drawImage(src.preview, s.x, s.y, s.w, s.h, col * (cellPx + gap), row * (cellPx + gap), cellPx, cellPx)
  })
  return { width, height }
}

export function fileName(index: number, format: Format) {
  return `${String(index + 1).padStart(2, '0')}.${format}`
}

export function zipName(layout: Layout) {
  return `grid-${layout.id}.zip`
}

/** Cut every cell straight from the original's source rectangle — no upscaled intermediate. */
export async function exportCells(src: Source, layout: Layout, view: View, format: Format): Promise<Blob[]> {
  const { output } = cellResolution(src.size, layout, view)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = output
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  const type = format === 'png' ? 'image/png' : 'image/jpeg'
  const blobs: Blob[] = []
  for (const r of cellRects(src.size, layout, view)) {
    ctx.clearRect(0, 0, output, output)
    if (format === 'jpg') {
      // JPG has no alpha: put transparent PNGs on white instead of black.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, output, output)
    }
    ctx.drawImage(src.original, r.x, r.y, r.w, r.h, 0, 0, output, output)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.92))
    if (!blob) throw new Error('导出失败')
    blobs.push(blob)
  }
  return blobs
}

export async function zipCells(blobs: Blob[], format: Format): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  for (const [i, b] of blobs.entries()) files[fileName(i, format)] = new Uint8Array(await b.arrayBuffer())
  // Images are already compressed; storing them is instant and just as small.
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
