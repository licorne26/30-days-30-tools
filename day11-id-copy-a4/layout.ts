// A4 layout in millimetres, the page drawing shared by preview / PNG / print, and the PDF export.
import { drawWatermark, type Options } from '../day08-id-watermark/watermark'
import { DPI, mmToPx } from './warp'

export const A4 = { w: 210, h: 297 }
/** PDF points per millimetre. */
export const PT_PER_MM = 72 / 25.4
export const A4_PT = { w: 595.28, h: 841.89 }

export type Face = 'front' | 'back'
export type Size = { w: number; h: number }
export type Place = { face: Face; x: number; y: number; w: number; h: number } // millimetres, top-left origin

/**
 * Where each card goes. Faces stack in a column (front on top), the columns are the copies. Free space
 * is split into equal gaps, so the layout is centred and symmetric both ways.
 */
export function layout(card: Size, faces: Face[], copies: 1 | 2): { places: Place[]; fits: boolean } {
  const rows = Math.max(1, faces.length)
  const gapX = (A4.w - copies * card.w) / (copies + 1)
  const gapY = (A4.h - rows * card.h) / (rows + 1)
  const places: Place[] = []
  for (let c = 0; c < copies; c++) {
    faces.forEach((face, r) => places.push({ face, x: gapX + c * (card.w + gapX), y: gapY + r * (card.h + gapY), w: card.w, h: card.h }))
  }
  return { places, fits: gapX >= 0 && gapY >= 0 }
}

type Source = CanvasImageSource & { width: number; height: number }
export type Cards = Partial<Record<Face, Source>>

/** The rectangle of a place in pixels at `dpi`. */
export const rectPx = (p: Place, dpi: number) => ({ x: mmToPx(p.x, dpi), y: mmToPx(p.y, dpi), w: mmToPx(p.w, dpi), h: mmToPx(p.h, dpi) })

/** The whole A4 page at `dpi`: white paper, the cards in place, then the watermark over everything. */
export function drawPage(canvas: HTMLCanvasElement, dpi: number, places: Place[], cards: Cards, wm: Options | null, seed: number) {
  canvas.width = mmToPx(A4.w, dpi)
  canvas.height = mmToPx(A4.h, dpi)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const p of places) {
    const src = cards[p.face]
    const r = rectPx(p, dpi)
    if (src) ctx.drawImage(src, r.x, r.y, r.w, r.h)
  }
  if (wm) drawWatermark(ctx, canvas.width, canvas.height, wm, seed)
}

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, q))

/**
 * The PDF: an exact A4 page and one 300 dpi JPEG per card, placed at its real size (1 mm = 72/25.4 pt).
 * The watermark is part of the page, so it is baked into each card image (the page-sized pattern, cut to
 * the card); what falls on bare paper goes on as one transparent PNG laid over the page.
 */
export async function makePdf(places: Place[], cards: Cards, wm: Options | null, seed: number): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([A4_PT.w, A4_PT.h])
  const pageW = mmToPx(A4.w, DPI)
  const pageH = mmToPx(A4.h, DPI)

  for (const p of places) {
    const src = cards[p.face]
    if (!src) continue
    const r = rectPx(p, DPI)
    const c = document.createElement('canvas')
    c.width = r.w
    c.height = r.h
    const ctx = c.getContext('2d')!
    ctx.drawImage(src, 0, 0, r.w, r.h)
    if (wm) {
      ctx.translate(-r.x, -r.y)
      drawWatermark(ctx, pageW, pageH, wm, seed)
    }
    const jpg = await doc.embedJpg(new Uint8Array(await (await toBlob(c, 'image/jpeg', 0.92)).arrayBuffer()))
    page.drawImage(jpg, { x: p.x * PT_PER_MM, y: A4_PT.h - (p.y + p.h) * PT_PER_MM, width: p.w * PT_PER_MM, height: p.h * PT_PER_MM })
    c.width = c.height = 0
  }

  if (wm && wm.text.trim()) {
    const o = document.createElement('canvas')
    o.width = pageW
    o.height = pageH
    const ctx = o.getContext('2d')!
    drawWatermark(ctx, pageW, pageH, wm, seed)
    for (const p of places) {
      if (!cards[p.face]) continue
      const r = rectPx(p, DPI)
      ctx.clearRect(r.x, r.y, r.w, r.h) // already on the card image
    }
    const png = await doc.embedPng(new Uint8Array(await (await toBlob(o, 'image/png')).arrayBuffer()))
    page.drawImage(png, { x: 0, y: 0, width: A4_PT.w, height: A4_PT.h })
    o.width = o.height = 0
  }

  return new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' })
}

/** The page as a 300 dpi PNG (2480 × 3508). */
export async function makePng(places: Place[], cards: Cards, wm: Options | null, seed: number) {
  const c = document.createElement('canvas')
  drawPage(c, DPI, places, cards, wm, seed)
  const blob = await toBlob(c, 'image/png')
  c.width = c.height = 0
  return blob
}

/**
 * Print view: a hidden page that holds only the A4 image, sized in mm with `@page { size: A4; margin: 0 }`,
 * then the browser's print dialog.
 */
export async function printPage(png: Blob) {
  const url = URL.createObjectURL(png)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><title>证件复印件</title><style>
    @page { size: A4; margin: 0 }
    html, body { margin: 0; padding: 0; background: #fff }
    img { display: block; width: ${A4.w}mm; height: ${A4.h}mm }
  </style><img src="${url}">`
  document.body.append(frame)
  await new Promise<void>((res) => {
    frame.onload = () => res()
  })
  const img = frame.contentDocument!.querySelector('img')!
  await img.decode().catch(() => undefined)
  frame.contentWindow!.focus()
  frame.contentWindow!.print()
  setTimeout(() => {
    frame.remove()
    URL.revokeObjectURL(url)
  }, 60000)
}
