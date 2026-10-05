// Perspective straightening, as pure functions on pixel buffers (no DOM), so a Worker and a test can both use them.

export type Pt = { x: number; y: number }
export type Pixels = { data: Uint8ClampedArray; width: number; height: number }

export const DPI = 300
/** Pixels for a length in millimetres at the given resolution (85.6 mm at 300 dpi = 1011 px). */
export const mmToPx = (mm: number, dpi = DPI) => Math.round((mm * dpi) / 25.4)

/**
 * The 3×3 homography (as 8 coefficients, the 9th is 1) that maps each `from[i]` onto `to[i]`:
 *   u = (h0·x + h1·y + h2) / (h6·x + h7·y + 1),  v = (h3·x + h4·y + h5) / (h6·x + h7·y + 1)
 * Four point pairs give eight linear equations; they are solved by Gaussian elimination with pivoting.
 */
export function homography(from: Pt[], to: Pt[]): number[] {
  const m: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let c = 0; c < 8; c++) {
    let p = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    if (Math.abs(m[p][c]) < 1e-12) throw new Error('degenerate corners')
    ;[m[c], m[p]] = [m[p], m[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let k = c; k < 9; k++) m[r][k] -= f * m[c][k]
    }
  }
  return m.map((row, i) => row[8] / row[i])
}

/** Is the quadrilateral convex and not folded? (Corners in order: top-left, top-right, bottom-right, bottom-left.) */
export function isConvex(q: Pt[]) {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = q[i]
    const b = q[(i + 1) % 4]
    const c = q[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-9) return false
    const s = Math.sign(cross)
    if (sign && s !== sign) return false
    sign = s
  }
  return true
}

/**
 * Put four points into the order top-left, top-right, bottom-right, bottom-left, by position.
 */
export function orderCorners(p: Pt[]): Pt[] {
  const by = (f: (q: Pt) => number, max: boolean) => p.reduce((a, b) => ((f(b) > f(a)) === max ? b : a))
  return [by((q) => q.x + q.y, false), by((q) => q.x - q.y, true), by((q) => q.x + q.y, true), by((q) => q.x - q.y, false)]
}

/**
 * Cut the quadrilateral `corners` (in source pixels: top-left, top-right, bottom-right, bottom-left)
 * out of `src` and stretch it onto a `w × h` rectangle. For every target pixel the source position is
 * found with the inverse mapping and read with bilinear interpolation (the source edge is clamped).
 * When the source is much larger than the target, each pixel averages a 2×2 grid of samples.
 */
export function warp(src: Pixels, corners: Pt[], w: number, h: number): Uint8ClampedArray {
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
  const H = homography(rect, corners) // target → source
  const out = new Uint8ClampedArray(w * h * 4)
  const { data, width: sw, height: sh } = src

  const edge = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y)
  const ss = edge / w > 1.6 ? 2 : 1
  const n = ss * ss

  const sample = (X: number, Y: number, acc: number[]) => {
    const den = H[6] * X + H[7] * Y + 1
    // Pixel centres sit at +0.5, so shift by half a pixel before interpolating.
    const sx = Math.min(sw - 1, Math.max(0, (H[0] * X + H[1] * Y + H[2]) / den - 0.5))
    const sy = Math.min(sh - 1, Math.max(0, (H[3] * X + H[4] * Y + H[5]) / den - 0.5))
    const x0 = Math.floor(sx)
    const y0 = Math.floor(sy)
    const x1 = Math.min(sw - 1, x0 + 1)
    const y1 = Math.min(sh - 1, y0 + 1)
    const fx = sx - x0
    const fy = sy - y0
    const i00 = (y0 * sw + x0) * 4
    const i10 = (y0 * sw + x1) * 4
    const i01 = (y1 * sw + x0) * 4
    const i11 = (y1 * sw + x1) * 4
    for (let c = 0; c < 3; c++) {
      const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx
      const bot = data[i01 + c] * (1 - fx) + data[i11 + c] * fx
      acc[c] += top * (1 - fy) + bot * fy
    }
  }

  const acc = [0, 0, 0]
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      acc[0] = acc[1] = acc[2] = 0
      for (let b = 0; b < ss; b++) for (let a = 0; a < ss; a++) sample(i + (a + 0.5) / ss, j + (b + 0.5) / ss, acc)
      const o = (j * w + i) * 4
      out[o] = acc[0] / n
      out[o + 1] = acc[1] / n
      out[o + 2] = acc[2] / n
      out[o + 3] = 255
    }
  }
  return out
}

export type Effect = {
  mode: 'color' | 'bw'
  /** −100 … 100, added to every channel. */
  brightness: number
  /** 0.5 … 2, 1 = unchanged. */
  contrast: number
}

export const NO_EFFECT: Effect = { mode: 'color', brightness: 0, contrast: 1 }

/**
 * Colour: brightness and contrast only. Black-and-white copy: grey, then the range 35–205 is stretched to
 * 0–255, so a light-grey paper background becomes white and the print becomes darker, like a photocopy.
 */
export function applyEffect(px: Uint8ClampedArray, e: Effect) {
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const base = e.mode === 'bw' ? ((v - 35) * 255) / (205 - 35) : v
    lut[v] = (Math.min(255, Math.max(0, base)) - 128) * e.contrast + 128 + e.brightness
  }
  if (e.mode === 'color' && e.brightness === 0 && e.contrast === 1) return
  for (let i = 0; i < px.length; i += 4) {
    if (e.mode === 'bw') {
      const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
      px[i] = px[i + 1] = px[i + 2] = lut[g]
    } else {
      px[i] = lut[px[i]]
      px[i + 1] = lut[px[i + 1]]
      px[i + 2] = lut[px[i + 2]]
    }
  }
}
