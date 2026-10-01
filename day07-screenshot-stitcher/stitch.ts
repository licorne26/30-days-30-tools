// Pure stitching logic: row signatures, fixed-bar detection, overlap search and the final layout.
// No DOM or canvas here, so every step can be tested on plain arrays. The preview, the mosaic
// and the export all draw from the same `layout` result.

/** Values per row signature: the row is cut into this many blocks and each block's grey level averaged. */
export const SIG = 64
/** Columns at each edge left out of signatures (scroll indicators, rounded screen corners). */
export const EDGE = 0.04
/** An overlap shorter than this is not trusted. */
export const MIN_OVERLAP = 40
/** Mean grey difference per sample (0–255), over rows with content, still counted as "the same pixels". */
export const MATCH_ERR = 5
/** Fixed bars: per-row mean / max difference allowed between screenshots. */
const BAR_MEAN = 2.5
const BAR_MAX = 16
/** Each fixed bar may take at most this share of the shortest screenshot. */
const BAR_SHARE = 0.35
/** A row with this much spread between its darkest and lightest block carries content (text, edges). */
const TEXTURE = 12

export type Size = { width: number; height: number }
/** One screenshot, already scaled to the common width: `rows` holds height × SIG grey values. */
export type Sig = { height: number; rows: Float32Array }
export type Bars = { top: number; bottom: number }
export type Overlap = { k: number; score: number }
export type Rect = { x: number; y: number; w: number; h: number }

/** Rows of screenshot `index` copied to the long image: source rows [sy, sy + sh) land at dy. */
export type Piece = { index: number; sy: number; sh: number; dy: number }
/** Where screenshot `index` meets the one before it, in long-image pixels. */
export type Seam = { index: number; y: number; overlap: number }
export type Layout = { width: number; height: number; pieces: Piece[]; seams: Seam[] }

/** The width most screenshots share (ties go to the wider one); the others are scaled to it. */
export function commonWidth(widths: number[]) {
  const count = new Map<number, number>()
  for (const w of widths) count.set(w, (count.get(w) ?? 0) + 1)
  let best = 0
  let n = 0
  for (const [w, c] of count) if (c > n || (c === n && w > best)) [best, n] = [w, c]
  return best
}

export function scaledHeight(size: Size, width: number) {
  return Math.max(1, Math.round((size.height * width) / size.width))
}

/** RGBA pixels -> one SIG-long grey signature per row, ignoring the outer EDGE columns. */
export function rowSignatures(data: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(height * SIG)
  const x0 = Math.floor(width * EDGE)
  const span = width - 2 * x0
  const bounds = Array.from({ length: SIG + 1 }, (_, b) => x0 + Math.round((span * b) / SIG))
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let b = 0; b < SIG; b++) {
      let sum = 0
      for (let x = bounds[b]; x < bounds[b + 1]; x++) {
        const i = row + x * 4
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      }
      out[y * SIG + b] = sum / Math.max(1, bounds[b + 1] - bounds[b])
    }
  }
  return out
}

function rowDiff(a: Float32Array, ra: number, b: Float32Array, rb: number) {
  let sum = 0
  let max = 0
  for (let i = 0; i < SIG; i++) {
    const d = Math.abs(a[ra * SIG + i] - b[rb * SIG + i])
    sum += d
    if (d > max) max = d
  }
  return { mean: sum / SIG, max }
}

/**
 * Fixed top and bottom bars (status bar, title bar, input bar): count rows from the top, and from
 * the bottom, that are the same in every screenshot. A single screenshot has no bars.
 */
export function detectFixedBars(images: Sig[]): Bars {
  if (images.length < 2) return { top: 0, bottom: 0 }
  const minH = Math.min(...images.map((s) => s.height))
  const limit = Math.floor(minH * BAR_SHARE)
  const same = (rowOf: (s: Sig) => number) =>
    images.every((s) => {
      const d = rowDiff(images[0].rows, rowOf(images[0]), s.rows, rowOf(s))
      return d.mean <= BAR_MEAN && d.max <= BAR_MAX
    })
  let top = 0
  while (top < limit && same(() => top)) top++
  let bottom = 0
  while (bottom < limit && same((s) => s.height - 1 - bottom)) bottom++
  return { top, bottom }
}

/** The rows between the fixed bars. */
export function contentRows(s: Sig, bars: Bars) {
  return s.rows.subarray(bars.top * SIG, Math.max(bars.top, s.height - bars.bottom) * SIG)
}

/**
 * Overlap between two content areas: the k for which the last k rows of `prev` best equal the first
 * k rows of `next`. Accepted only when k ≥ MIN_OVERLAP, the mean difference is ≤ MATCH_ERR and the
 * overlap holds enough real content (blank background matches anything). Near-ties go to the larger
 * k, the usual case for scrolled screenshots. Returns null when nothing qualifies.
 */
export function findOverlap(prev: Float32Array, next: Float32Array): Overlap | null {
  const pn = prev.length / SIG
  const nn = next.length / SIG
  const maxK = Math.min(pn, nn)
  if (maxK < MIN_OVERLAP) return null

  // Cheap per-row means give a lower bound on the full difference, so most k are ruled out early.
  const mean = (rows: Float32Array, n: number) => {
    const m = new Float32Array(n)
    for (let r = 0; r < n; r++) {
      let s = 0
      for (let i = 0; i < SIG; i++) s += rows[r * SIG + i]
      m[r] = s / SIG
    }
    return m
  }
  const textured = (rows: Float32Array, n: number) => {
    const t = new Uint8Array(n)
    for (let r = 0; r < n; r++) {
      let lo = 255
      let hi = 0
      for (let i = 0; i < SIG; i++) {
        const v = rows[r * SIG + i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      t[r] = hi - lo > TEXTURE ? 1 : 0
    }
    return t
  }
  const pm = mean(prev, pn)
  const nm = mean(next, nn)
  const pt = textured(prev, pn)
  const nt = textured(next, nn)

  // Only rows with content in either screenshot are scored, so blank background can't hide a mismatch.
  const found: Overlap[] = []
  for (let k = MIN_OVERLAP; k <= maxK; k++) {
    const off = pn - k
    let rows = 0
    let coarse = 0
    for (let r = 0; r < k; r++) {
      if (pt[off + r] || nt[r]) {
        rows++
        coarse += Math.abs(pm[off + r] - nm[r])
      }
    }
    if (rows < Math.max(8, k * 0.1) || coarse > MATCH_ERR * rows) continue

    const budget = MATCH_ERR * rows * SIG
    let sum = 0
    for (let r = 0; r < k && sum <= budget; r++) {
      if (!pt[off + r] && !nt[r]) continue
      for (let i = 0; i < SIG; i++) sum += Math.abs(prev[(off + r) * SIG + i] - next[r * SIG + i])
    }
    if (sum > budget) continue
    found.push({ k, score: sum / (rows * SIG) })
  }
  if (!found.length) return null
  const best = Math.min(...found.map((f) => f.score))
  return found.filter((f) => f.score <= best + 0.5).reduce((a, b) => (b.k > a.k ? b : a))
}

/** Largest overlap a seam can take: the shorter of the two content areas. */
export function maxOverlap(prev: Size, next: Size, bars: Bars) {
  return Math.max(0, Math.min(prev.height, next.height) - bars.top - bars.bottom)
}

/**
 * Where every screenshot goes. Only the first keeps its top bar and only the last its bottom bar;
 * screenshot i skips the first overlaps[i] rows of its content (overlaps[0] is ignored).
 */
export function layout(images: Size[], bars: Bars, overlaps: number[]): Layout {
  const width = images[0]?.width ?? 0
  const pieces: Piece[] = []
  const seams: Seam[] = []
  let y = 0
  images.forEach((img, i) => {
    const first = i === 0
    const last = i === images.length - 1
    const k = first ? 0 : Math.max(0, Math.min(overlaps[i] ?? 0, maxOverlap(images[i - 1], img, bars)))
    const sy = first ? 0 : Math.min(img.height, bars.top + k)
    const end = last ? img.height : Math.max(sy, img.height - bars.bottom)
    if (!first) seams.push({ index: i, y, overlap: k })
    if (end > sy) pieces.push({ index: i, sy, sh: end - sy, dy: y })
    y += end - sy
  })
  return { width, height: y, pieces, seams }
}

// ---- mosaic and export limits (all in long-image pixels)

/** Mosaic cell size: about 1/40 of the width, so it hides text at any resolution. */
export function mosaicCell(width: number) {
  return Math.max(6, Math.round(width / 40))
}

/** Canvas limits that hold in every browser (Safari's are the smallest). */
export const MAX_AREA = 16_000_000
export const MAX_HEIGHT = 16_000

/**
 * Split a tall image into the fewest equal parts that each fit the canvas limits. Cuts fall on
 * multiples of `cell`, so a mosaic crossing a cut looks the same as in one piece.
 */
export function segments(height: number, width: number, cell: number) {
  const cap = Math.floor(Math.min(MAX_HEIGHT, MAX_AREA / Math.max(1, width)) / cell) * cell
  if (height <= cap) return [{ y: 0, h: height }]
  const n = Math.ceil(height / cap)
  const step = Math.min(cap, Math.ceil(height / n / cell) * cell)
  const out: { y: number; h: number }[] = []
  for (let y = 0; y < height; y += step) out.push({ y, h: Math.min(step, height - y) })
  return out
}

/** Mosaic rectangles that touch the band [y, y + h), moved into that band's coordinates. */
export function clipRects(rects: Rect[], y: number, h: number): Rect[] {
  return rects.flatMap((r) => {
    const top = Math.max(r.y, y)
    const bottom = Math.min(r.y + r.h, y + h)
    return bottom > top ? [{ x: r.x, y: top - y, w: r.w, h: bottom - top }] : []
  })
}

/** Default order: numbers in the file name (Screenshot 2 before Screenshot 10), then modification time. */
export function byName<T extends { name: string; lastModified: number }>(files: T[]) {
  const hasDigits = (f: T) => /\d/.test(f.name)
  return [...files].sort((a, b) => {
    if (hasDigits(a) && hasDigits(b)) {
      const c = a.name.localeCompare(b.name, undefined, { numeric: true })
      if (c) return c
    }
    return a.lastModified - b.lastModified
  })
}
