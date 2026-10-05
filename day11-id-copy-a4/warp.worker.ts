// Holds the full-size photos and straightens them off the main thread.
import { applyEffect, warp, type Effect, type Pixels, type Pt } from './warp'

export type Req =
  | { type: 'set'; slot: string; bitmap: ImageBitmap }
  | { type: 'run'; id: number; slot: string; corners: Pt[]; w: number; h: number; effect: Effect }

export type Res = { id: number; w: number; h: number; buffer: ArrayBuffer } | { id: number; error: string }

const photos = new Map<string, Pixels>()

self.onmessage = (e: MessageEvent<Req>) => {
  const m = e.data
  if (m.type === 'set') {
    const c = new OffscreenCanvas(m.bitmap.width, m.bitmap.height)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(m.bitmap, 0, 0)
    m.bitmap.close()
    const img = ctx.getImageData(0, 0, c.width, c.height)
    photos.set(m.slot, { data: img.data, width: img.width, height: img.height })
    return
  }
  try {
    const src = photos.get(m.slot)
    if (!src) throw new Error('no photo')
    // Corners arrive as fractions of the photo; the warp wants source pixels.
    const px = m.corners.map((p) => ({ x: p.x * src.width, y: p.y * src.height }))
    const out = warp(src, px, m.w, m.h)
    applyEffect(out, m.effect)
    ;(self as unknown as Worker).postMessage({ id: m.id, w: m.w, h: m.h, buffer: out.buffer } satisfies Res, [out.buffer])
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id: m.id, error: String(err) } satisfies Res)
  }
}
