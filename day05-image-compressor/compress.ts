// Find the highest quality (and, only if needed, the largest resolution) that fits a byte budget.
// The search itself is pure — it takes an `encode` function — so it can be tested without a canvas;
// `compressImage` wires it to createImageBitmap + OffscreenCanvas and runs inside the Worker.

import { zipSync } from 'fflate'

export type Format = 'jpg' | 'webp'
export type Size = { width: number; height: number }

export type Settings = {
  /** Target size in KB (1 KB = 1000 bytes, so the file also passes a 1024-based check). */
  targetKB: number
  format: Format
  /** Longest edge allowed before compressing, or null for no limit. */
  maxEdge: number | null
}

export type Status =
  /** The original was already small enough and in the right format: passed through untouched. */
  | 'original'
  /** Fits at the (optionally size-capped) original resolution. */
  | 'ok'
  /** Fits only after shrinking the resolution. */
  | 'resized'
  /** Even the smallest attempt is still over the target. */
  | 'over'

export type Result = {
  blob: Blob
  width: number
  height: number
  /** Encoder quality used, or null when the original was passed through. */
  quality: number | null
  status: Status
}

export type Progress = { attempt: number; width: number; height: number; quality: number }

export const PRESETS_KB = [20, 50, 100, 200, 500, 1000]
export const Q_MIN = 0.35
export const Q_MAX = 0.95
/** Encodes per resolution: both ends, then bisection in between. */
export const MAX_TRIES = 8
export const SHRINK = 0.85
/** Stop shrinking once the long edge would drop below this. */
export const MIN_EDGE = 320

export const MIME: Record<Format, string> = { jpg: 'image/jpeg', webp: 'image/webp' }

export const targetBytes = (kb: number) => Math.round(kb * 1000)

export function targetLabel(kb: number) {
  return kb >= 1000 && kb % 1000 === 0 ? `${kb / 1000}MB` : `${kb}KB`
}

export function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`
  return `${(bytes / 1000 / 1000).toFixed(2)} MB`
}

/** `photo.png` → `photo-50KB.jpg` */
export function outputName(name: string, kb: number, format: Format) {
  const base = name.replace(/\.[^.]+$/, '') || 'image'
  return `${base}-${targetLabel(kb)}.${format}`
}

/** Suffix repeated names so nothing is overwritten in the zip: a.jpg, a (2).jpg, … */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>()
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1
    seen.set(n, count)
    return count === 1 ? n : n.replace(/(\.[^.]+)?$/, ` (${count})$1`)
  })
}

export function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  return Promise.all(files.map(async (f) => new Uint8Array(await f.blob.arrayBuffer()))).then((data) => {
    const names = uniqueNames(files.map((f) => f.name))
    const entries = Object.fromEntries(names.map((n, i) => [n, data[i]]))
    // Images are already compressed; storing them is instant and just as small.
    return new Blob([zipSync(entries, { level: 0 })], { type: 'application/zip' })
  })
}

/** Scale down so the long edge is at most `maxEdge`; never scales up. */
export function limitSize(size: Size, maxEdge: number | null): Size {
  const long = Math.max(size.width, size.height)
  if (!maxEdge || long <= maxEdge) return size
  return scaleSize(size, maxEdge / long)
}

export function scaleSize(size: Size, k: number): Size {
  return { width: Math.max(1, Math.round(size.width * k)), height: Math.max(1, Math.round(size.height * k)) }
}

/**
 * How many ×0.85 steps to jump after a miss at the lowest quality.
 * File size falls at most in proportion to pixel count, so this never skips past a resolution that could fit —
 * it just saves encoding the big sizes that clearly can't.
 */
export function shrinkSteps(bytes: number, target: number) {
  if (bytes <= target) return 0
  return Math.max(1, Math.floor(Math.log(target / bytes) / Math.log(SHRINK * SHRINK)))
}

export type Encoded = { size: number }

/**
 * Highest quality in [Q_MIN, Q_MAX] whose output fits `target`, in at most MAX_TRIES encodes.
 * Returns `fit: null` (plus the Q_MIN attempt) when even the lowest quality is too big.
 */
export async function findQuality<T extends Encoded>(
  encode: (q: number) => Promise<T>,
  target: number,
): Promise<{ fit: { q: number; out: T } | null; smallest: T }> {
  const low = await encode(Q_MIN)
  if (low.size > target) return { fit: null, smallest: low }
  const high = await encode(Q_MAX)
  if (high.size <= target) return { fit: { q: Q_MAX, out: high }, smallest: low }

  let best = { q: Q_MIN, out: low }
  let lo = Q_MIN
  let hi = Q_MAX
  for (let i = 2; i < MAX_TRIES; i++) {
    const q = (lo + hi) / 2
    const out = await encode(q)
    if (out.size <= target) {
      best = { q, out }
      lo = q
    } else {
      hi = q
    }
  }
  return { fit: best, smallest: low }
}

/** The whole algorithm over an abstract encoder: quality search first, then shrink by ×0.85 until it fits. */
export async function search<T extends Encoded>(
  start: Size,
  target: number,
  encodeAt: (size: Size, q: number) => Promise<T>,
): Promise<{ out: T; size: Size; q: number; fits: boolean; shrunk: boolean }> {
  let size = start
  let k = 1
  for (;;) {
    const current = size
    const { fit, smallest } = await findQuality((q) => encodeAt(current, q), target)
    if (fit) return { out: fit.out, size, q: fit.q, fits: true, shrunk: k < 1 }

    const steps = shrinkSteps(smallest.size, target)
    let nextK = k * SHRINK ** steps
    let next = scaleSize(start, nextK)
    // A big jump may overshoot the floor; fall back to the smallest size that is still allowed.
    while (Math.max(next.width, next.height) < MIN_EDGE && nextK < k * SHRINK) {
      nextK /= SHRINK
      next = scaleSize(start, nextK)
    }
    if (Math.max(next.width, next.height) < MIN_EDGE) {
      return { out: smallest, size, q: Q_MIN, fits: false, shrunk: k < 1 }
    }
    k = nextK
    size = next
  }
}

// ---- Browser side (runs in the Worker) ----

/** High-quality downscale; big reductions go through a 2× intermediate so thin details don't alias. */
function render(src: ImageBitmap, size: Size, format: Format) {
  let from: CanvasImageSource = src
  let fromW = src.width
  if (size.width * 2 < src.width) {
    const mid = new OffscreenCanvas(size.width * 2, size.height * 2)
    const mctx = mid.getContext('2d')!
    mctx.imageSmoothingQuality = 'high'
    mctx.drawImage(src, 0, 0, mid.width, mid.height)
    from = mid
    fromW = mid.width
  }
  const canvas = new OffscreenCanvas(size.width, size.height)
  const ctx = canvas.getContext('2d')!
  if (format === 'jpg') {
    // JPG has no alpha: transparent PNG areas become white instead of black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, size.width, size.height)
  }
  ctx.imageSmoothingEnabled = fromW !== size.width
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(from, 0, 0, size.width, size.height)
  return canvas
}

export async function compressImage(file: File, s: Settings, onProgress: (p: Progress) => void): Promise<Result> {
  const target = targetBytes(s.targetKB)
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const natural = { width: bitmap.width, height: bitmap.height }
    const start = limitSize(natural, s.maxEdge)

    if (file.size <= target && file.type === MIME[s.format] && start === natural) {
      return { blob: file, ...natural, quality: null, status: 'original' }
    }

    let canvas: OffscreenCanvas | null = null
    let canvasSize: Size | null = null
    let attempt = 0
    const r = await search(start, target, async (size, q) => {
      if (canvasSize !== size) {
        canvas = render(bitmap, size, s.format)
        canvasSize = size
      }
      onProgress({ attempt: ++attempt, ...size, quality: q })
      const blob = await canvas!.convertToBlob({ type: MIME[s.format], quality: q })
      if (blob.type !== MIME[s.format]) throw new Error('unsupported-format')
      return blob
    })
    return {
      blob: r.out,
      ...r.size,
      quality: r.q,
      status: !r.fits ? 'over' : r.shrunk ? 'resized' : 'ok',
    }
  } finally {
    bitmap.close()
  }
}

// ---- Worker protocol ----

export type Job = { id: string; key: string; file: File; settings: Settings }

export type WorkerMessage =
  /** progress is null while the image is still being decoded. */
  | { type: 'progress'; id: string; key: string; progress: Progress | null }
  | { type: 'done'; id: string; key: string; result: Result }
  | { type: 'error'; id: string; key: string; message: string }
