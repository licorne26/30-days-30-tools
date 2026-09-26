export type Frame = 'none' | 'mac' | 'browser'
export type Ratio = 'auto' | '16:9' | '3:4' | '1:1' | '4:5'

export type Background =
  | { kind: 'gradient'; from: string; to: string }
  | { kind: 'solid'; color: string }
  | { kind: 'none' }

export type Options = {
  background: Background
  frame: Frame
  frameDark: boolean
  url: string
  /** Padding around the window, as a percentage of the screenshot width. */
  padding: number
  /** Corner radius, as a percentage of the screenshot width. */
  radius: number
  /** Shadow strength, 0–100. */
  shadow: number
  ratio: Ratio
}

const RATIOS: Record<Exclude<Ratio, 'auto'>, number> = {
  '16:9': 16 / 9,
  '3:4': 3 / 4,
  '1:1': 1,
  '4:5': 4 / 5,
}

const MAX_SIDE = 4096

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Output size in pixels for this image and these options, before any downscaling. */
function layout(img: { width: number; height: number }, o: Options) {
  const u = img.width / 1000
  const bar = o.frame === 'none' ? 0 : Math.round(o.frame === 'browser' ? 64 * u : 44 * u)
  const winW = img.width
  const winH = img.height + bar
  const pad = Math.round((o.padding / 100) * img.width)
  let w = winW + pad * 2
  let h = winH + pad * 2
  if (o.ratio !== 'auto') {
    const r = RATIOS[o.ratio]
    if (w / h > r) h = Math.round(w / r)
    else w = Math.round(h * r)
  }
  return { u, bar, winW, winH, w, h }
}

/**
 * Draws the framed screenshot onto the canvas. The same function is used for the
 * on-screen preview and the exported PNG, so what you see is what you download.
 */
export function render(canvas: HTMLCanvasElement, img: CanvasImageSource & { width: number; height: number }, o: Options) {
  const L = layout(img, o)
  const scale = Math.min(1, MAX_SIDE / Math.max(L.w, L.h))
  canvas.width = Math.round(L.w * scale)
  canvas.height = Math.round(L.h * scale)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, L.w, L.h)

  const bg = o.background
  if (bg.kind === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, L.w, L.h)
    g.addColorStop(0, bg.from)
    g.addColorStop(1, bg.to)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, L.w, L.h)
  } else if (bg.kind === 'solid') {
    ctx.fillStyle = bg.color
    ctx.fillRect(0, 0, L.w, L.h)
  }

  const x = Math.round((L.w - L.winW) / 2)
  const y = Math.round((L.h - L.winH) / 2)
  const r = (o.radius / 100) * img.width
  const u = L.u

  // Shadow: one wide soft layer plus one tight contact layer.
  if (o.shadow > 0) {
    const s = o.shadow / 100
    ctx.save()
    ctx.fillStyle = '#000'
    ctx.shadowColor = `rgba(0,0,0,${0.45 * s})`
    ctx.shadowBlur = 90 * u * s
    ctx.shadowOffsetY = 36 * u * s
    roundRect(ctx, x, y, L.winW, L.winH, r)
    ctx.fill()
    ctx.shadowColor = `rgba(0,0,0,${0.25 * s})`
    ctx.shadowBlur = 8 * u
    ctx.shadowOffsetY = 3 * u
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  roundRect(ctx, x, y, L.winW, L.winH, r)
  ctx.clip()

  if (o.frame !== 'none') {
    const dark = o.frameDark
    ctx.fillStyle = dark ? '#1f1f1f' : '#f4f4f5'
    ctx.fillRect(x, y, L.winW, L.bar)
    ctx.fillStyle = dark ? '#2e2e2e' : '#e4e4e7'
    ctx.fillRect(x, y + L.bar - Math.max(1, u), L.winW, Math.max(1, u))

    const dotR = 6.5 * u
    const cy = y + (o.frame === 'browser' ? 22 * u + dotR : L.bar / 2)
    ;['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
      ctx.beginPath()
      ctx.arc(x + 22 * u + dotR + i * 22 * u, cy, dotR, 0, Math.PI * 2)
      ctx.fillStyle = c
      ctx.fill()
    })

    if (o.frame === 'browser') {
      const bw = Math.min(L.winW * 0.56, 620 * u)
      const bh = 30 * u
      const bx = x + (L.winW - bw) / 2
      const by = cy - bh / 2
      ctx.fillStyle = dark ? '#2a2a2a' : '#ffffff'
      roundRect(ctx, bx, by, bw, bh, bh / 2)
      ctx.fill()
      ctx.fillStyle = dark ? '#a3a3a3' : '#71717a'
      ctx.font = `500 ${13 * u}px Geist, "PingFang SC", system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(o.url || 'example.com', bx + bw / 2, by + bh / 2 + 0.5 * u, bw - 24 * u)
    }
  }

  ctx.drawImage(img, x, y + L.bar, img.width, img.height)
  ctx.restore()

  // Hairline border so light screenshots don't melt into light backgrounds.
  ctx.save()
  roundRect(ctx, x + 0.5, y + 0.5, L.winW - 1, L.winH - 1, r)
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.lineWidth = Math.max(1, u)
  ctx.stroke()
  ctx.restore()
}
