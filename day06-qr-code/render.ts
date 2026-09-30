import { encode, QrCodeDataType } from 'uqr'

/**
 * The QR card is first described as a list of shapes; the canvas preview, the PNG export and the
 * SVG export all draw that same list, so they always match.
 */

export type DotStyle = 'square' | 'rounded' | 'dots'
export type EyeStyle = 'square' | 'rounded' | 'circle'

export type Design = {
  fg: string
  bg: string
  eye: string
  dots: DotStyle
  eyes: EyeStyle
  /** Quiet zone around the code, in modules. 4 is what the spec asks for. */
  margin: number
  title: string
  subtitle: string
  logo: HTMLImageElement | ImageBitmap | null
  /** Data URL of the logo, needed to embed it in the SVG. */
  logoUrl: string | null
}

type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: string }
  | { t: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { t: 'text'; x: number; y: number; size: number; weight: number; fill: string; text: string }
  | { t: 'logo'; x: number; y: number; s: number }

export type Layout = { width: number; height: number; shapes: Shape[]; version: number; size: number; ecc: string }

const QR_PX = 1000
const FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif'

export function layout(text: string, d: Design): Layout {
  // A logo covers the middle of the code, so it needs the highest error correction.
  const ecc = d.logo ? 'H' : 'M'
  const qr = encode(text || ' ', { ecc, border: 0 })
  const n = qr.size
  const m = QR_PX / n
  const pad = d.margin * m
  const hasTitle = d.title.trim().length > 0
  const hasSub = d.subtitle.trim().length > 0
  const capH = hasTitle || hasSub ? Math.max(pad, 40) * 0.2 + (hasTitle ? 96 : 0) + (hasSub ? 64 : 0) + Math.max(pad, 56) * 0.7 : 0
  const width = QR_PX + pad * 2
  const height = QR_PX + pad * 2 + capH
  const shapes: Shape[] = [{ t: 'rect', x: 0, y: 0, w: width, h: height, r: 0, fill: d.bg }]

  // Area under the logo is left empty (the error correction restores it).
  const plate = d.logo ? Math.round(QR_PX * 0.22) : 0
  const pc = QR_PX / 2
  const underLogo = (x: number, y: number) =>
    plate > 0 && Math.abs((x + 0.5) * m - pc) < plate / 2 + m * 0.3 && Math.abs((y + 0.5) * m - pc) < plate / 2 + m * 0.3

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.data[y][x] || qr.types[y][x] === QrCodeDataType.Position || underLogo(x, y)) continue
      const px = pad + x * m
      const py = pad + y * m
      if (d.dots === 'dots') shapes.push({ t: 'circle', cx: px + m / 2, cy: py + m / 2, r: m * 0.43, fill: d.fg })
      else if (d.dots === 'rounded') shapes.push({ t: 'rect', x: px + m * 0.04, y: py + m * 0.04, w: m * 0.92, h: m * 0.92, r: m * 0.32, fill: d.fg })
      // Plain squares overlap by a hair so no seams show between neighbours.
      else shapes.push({ t: 'rect', x: px, y: py, w: m + 0.6, h: m + 0.6, r: 0, fill: d.fg })
    }
  }

  // The three finder patterns ("eyes"), drawn as one ring + one centre.
  for (const [ex, ey] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    const x = pad + ex * m
    const y = pad + ey * m
    if (d.eyes === 'circle') {
      shapes.push({ t: 'circle', cx: x + 3.5 * m, cy: y + 3.5 * m, r: 3.5 * m, fill: d.eye })
      shapes.push({ t: 'circle', cx: x + 3.5 * m, cy: y + 3.5 * m, r: 2.5 * m, fill: d.bg })
      shapes.push({ t: 'circle', cx: x + 3.5 * m, cy: y + 3.5 * m, r: 1.5 * m, fill: d.eye })
    } else {
      const ro = d.eyes === 'rounded' ? 2 * m : 0
      shapes.push({ t: 'rect', x, y, w: 7 * m, h: 7 * m, r: ro, fill: d.eye })
      shapes.push({ t: 'rect', x: x + m, y: y + m, w: 5 * m, h: 5 * m, r: ro * 0.6, fill: d.bg })
      shapes.push({ t: 'rect', x: x + 2 * m, y: y + 2 * m, w: 3 * m, h: 3 * m, r: d.eyes === 'rounded' ? m : 0, fill: d.eye })
    }
  }

  if (d.logo) {
    const px = pad + pc - plate / 2
    shapes.push({ t: 'rect', x: px, y: px, w: plate, h: plate, r: plate * 0.22, fill: d.bg })
    const inset = plate * 0.1
    shapes.push({ t: 'logo', x: px + inset, y: px + inset, s: plate - inset * 2 })
  }

  let ty = QR_PX + pad * 2 + Math.max(pad, 40) * 0.2
  if (hasTitle) {
    shapes.push({ t: 'text', x: width / 2, y: ty + 72, size: 68, weight: 800, fill: d.fg, text: d.title.trim() })
    ty += 96
  }
  if (hasSub) {
    shapes.push({ t: 'text', x: width / 2, y: ty + 46, size: 42, weight: 500, fill: d.fg, text: d.subtitle.trim() })
  }

  return { width: Math.round(width), height: Math.round(height), shapes, version: qr.version, size: n, ecc }
}

/** Draw the card; `scale` 1 gives roughly 1100 px wide, which is plenty for print. */
export function drawCanvas(canvas: HTMLCanvasElement, l: Layout, d: Design, scale = 1) {
  canvas.width = Math.round(l.width * scale)
  canvas.height = Math.round(l.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  for (const s of l.shapes) {
    if (s.t === 'rect') {
      ctx.fillStyle = s.fill
      ctx.beginPath()
      ctx.roundRect(s.x, s.y, s.w, s.h, s.r)
      ctx.fill()
    } else if (s.t === 'circle') {
      ctx.fillStyle = s.fill
      ctx.beginPath()
      ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2)
      ctx.fill()
    } else if (s.t === 'text') {
      ctx.fillStyle = s.fill
      ctx.font = `${s.weight} ${s.size}px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(s.text, s.x, s.y, l.width * 0.9)
    } else if (s.t === 'logo' && d.logo) {
      // Fit the logo inside the square, keeping its aspect ratio.
      const w = d.logo.width
      const h = d.logo.height
      const k = s.s / Math.max(w, h)
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(s.x, s.y, s.s, s.s, s.s * 0.16)
      ctx.clip()
      ctx.drawImage(d.logo, s.x + (s.s - w * k) / 2, s.y + (s.s - h * k) / 2, w * k, h * k)
      ctx.restore()
    }
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const r2 = (v: number) => Math.round(v * 100) / 100

export function toSvg(l: Layout, d: Design) {
  const out: string[] = []
  for (const s of l.shapes) {
    if (s.t === 'rect')
      out.push(`<rect x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.w)}" height="${r2(s.h)}"${s.r ? ` rx="${r2(s.r)}"` : ''} fill="${s.fill}"/>`)
    else if (s.t === 'circle') out.push(`<circle cx="${r2(s.cx)}" cy="${r2(s.cy)}" r="${r2(s.r)}" fill="${s.fill}"/>`)
    else if (s.t === 'text')
      out.push(
        `<text x="${r2(s.x)}" y="${r2(s.y)}" font-size="${s.size}" font-weight="${s.weight}" fill="${s.fill}" text-anchor="middle" font-family='${FONT}'>${esc(s.text)}</text>`,
      )
    else if (s.t === 'logo' && d.logoUrl)
      out.push(
        `<clipPath id="lg"><rect x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.s)}" height="${r2(s.s)}" rx="${r2(s.s * 0.16)}"/></clipPath><image href="${d.logoUrl}" x="${r2(s.x)}" y="${r2(s.y)}" width="${r2(s.s)}" height="${r2(s.s)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#lg)"/>`,
      )
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.width} ${l.height}" width="${l.width}" height="${l.height}">${out.join('')}</svg>`
}

/** WCAG relative luminance, to warn about colour pairs that phone cameras struggle with. */
function luminance(hex: string) {
  const v = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
  const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastIssue(fg: string, bg: string): string | null {
  const a = luminance(fg)
  const b = luminance(bg)
  if (a > b) return '码点比背景浅（反色），不少手机相机扫不出来，建议深色码点配浅色背景。'
  if ((b + 0.05) / (a + 0.05) < 4) return '码点和背景颜色太接近，可能扫不出来，建议加大深浅对比。'
  return null
}
