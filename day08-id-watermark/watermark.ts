// Watermark drawing shared by the preview (small canvas) and the export (full-size canvas).
// Every size is a fraction of the image width, so a thumbnail looks exactly like the export.

export type Mode = 'tile' | 'center'

export type Options = {
  text: string
  mode: Mode
  color: string
  /** 0–1 */
  opacity: number
  /** Font size as a share of the image width (0.04 = 4%). */
  size: number
  /** Spacing between watermarks, as a multiple of the text size (1 = tight, 3 = airy). */
  density: number
  /** Degrees, -45 to 45. */
  angle: number
  /** Random jitter and a thin wavy line between the texts. */
  antiRemove: boolean
}

export const DEFAULTS: Options = {
  text: '仅供租房使用，他用无效',
  mode: 'tile',
  color: '#6b7280',
  opacity: 0.35,
  size: 0.04,
  density: 1.6,
  angle: -30,
  antiRemove: false,
}

const FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif'

/** Small seeded generator (mulberry32): same seed, same sequence, in preview and export alike. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Today's date, e.g. 2026年10月2日. */
export function todayText(d = new Date()) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** A very thin wave under a watermark, `len` long, in pixels. */
function wave(ctx: CanvasRenderingContext2D, len: number, amp: number, lineWidth: number) {
  const step = Math.max(2, amp * 1.2)
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  for (let x = 0, i = 0; x <= len; x += step / 2, i++) {
    const y = i % 2 ? amp : -amp
    if (x === 0) ctx.moveTo(-len / 2, y)
    else ctx.lineTo(x - len / 2, y)
  }
  ctx.stroke()
}

/**
 * Draw the watermark over whatever is already on the canvas. The tiled grid is laid out around the
 * image centre and covers the diagonal, so after any rotation every corner is still covered.
 */
export function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, o: Options, seed: number) {
  const text = o.text.trim()
  if (!text) return
  const fontSize = Math.max(8, width * o.size)
  const rand = rng(seed)
  const rad = (o.angle * Math.PI) / 180

  ctx.save()
  ctx.font = `600 ${fontSize}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = o.color
  ctx.strokeStyle = o.color

  const textW = ctx.measureText(text).width
  /** One watermark centred at (x, y), turned by `base` radians (plus random jitter when anti-removal is on). */
  const one = (x: number, y: number, base: number) => {
    let alpha = o.opacity
    let a = base
    let dx = 0
    let dy = 0
    if (o.antiRemove) {
      // Random numbers are always drawn in the same order, so one seed gives one picture.
      dx = (rand() * 2 - 1) * 0.08 * textW
      dy = (rand() * 2 - 1) * 0.08 * textW
      a += ((rand() * 2 - 1) * 3 * Math.PI) / 180
      alpha += (rand() * 2 - 1) * 0.05
    }
    ctx.save()
    ctx.globalAlpha = Math.min(1, Math.max(0.02, alpha))
    ctx.translate(x + dx, y + dy)
    ctx.rotate(a)
    ctx.fillText(text, 0, 0)
    if (o.antiRemove) {
      ctx.translate(0, fontSize * 0.85)
      wave(ctx, textW * 0.9, fontSize * 0.07, Math.max(0.5, fontSize * 0.025))
    }
    ctx.restore()
  }

  if (o.mode === 'center') {
    one(width / 2, height / 2, rad)
  } else {
    const gapX = textW + fontSize * o.density * 1.2
    const gapY = fontSize * (1.5 + o.density * 1.4)
    const reach = Math.hypot(width, height) / 2 + textW // farthest any corner can be from the centre
    const cols = Math.ceil(reach / gapX)
    const rows = Math.ceil(reach / gapY)
    // The whole grid is rotated about the image centre; each text then sits upright in it.
    ctx.translate(width / 2, height / 2)
    ctx.rotate(rad)
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        // Alternate rows shift by half a column so the texts interlock.
        one(c * gapX + (r % 2 ? gapX / 2 : 0), r * gapY, 0)
      }
    }
  }
  ctx.restore()
}
