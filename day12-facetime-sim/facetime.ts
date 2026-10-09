// Draws an iPhone-style video-call screen onto a canvas. Everything is laid out in a 1170 × 2532 design space
// and scaled, so the preview and the export are the same picture.

export const W = 1170
export const H = 2532

export type Corner = 'tl' | 'tr' | 'bl' | 'br'
/** How a photo sits in its frame: zoom 0.4–3 (1 = fills the frame), x / y 0–1 (0.5 = centred). Below 1 it leaves gaps that are filled with a blurred copy. */
export type Fit = { zoom: number; x: number; y: number }

export type Options = {
  name: string
  clock: string
  /** 0–100 */
  battery: number
  muted: boolean
  showControls: boolean
  showStatus: boolean
  pip: Corner
  /** Small window width as a share of the screen width. */
  pipSize: number
  /** Small window height ÷ width. */
  pipAspect: number
  big: Fit
  small: Fit
  avatar: Fit
  /** Where the small window was dropped (its top-left, design units). Unset = sit in the `pip` corner. */
  pipAt?: { x: number; y: number }
}

export const DEFAULTS: Options = {
  name: 'Fleur',
  clock: '9:41',
  battery: 80,
  muted: false,
  showControls: true,
  showStatus: true,
  pip: 'bl',
  pipSize: 0.34,
  pipAspect: 1.75,
  big: { zoom: 1, x: 0.5, y: 0.5 },
  small: { zoom: 1, x: 0.5, y: 0.5 },
  avatar: { zoom: 1, x: 0.5, y: 0.5 },
}

const FONT = '-apple-system,"SF Pro Text","PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif'
const MARGIN = 63
const TOP = 340 // the small window never goes above this
/** The right-hand column of round buttons (centre x, first centre y, spacing, radius). */
const COL = { x: 1030, y: 1810, step: 205, r: 82 }
const SHUTTER = { x: 1042, y: 239, r: 63 }

export type Img = CanvasImageSource & { width: number; height: number }

/** The small window's rectangle (design units) when it sits in `corner`. */
export function pipRect(o: Pick<Options, 'pip' | 'pipSize' | 'pipAspect' | 'showControls'>) {
  const w = W * o.pipSize
  const h = w * o.pipAspect
  const bottom = H - 110
  // On the right the window stays clear of the button column.
  const right = (o.showControls ? COL.x - COL.r - 36 : W - MARGIN) - w
  const x = o.pip === 'tl' || o.pip === 'bl' ? MARGIN : right
  const y = o.pip === 'tl' || o.pip === 'tr' ? TOP : bottom - h
  return { x, y, w, h }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** How far the photo overhangs its frame at this zoom (negative = it leaves a gap), in design units. */
export function span(img: { width: number; height: number }, w: number, h: number, fit: Fit) {
  const s = Math.max(w / img.width, h / img.height) * fit.zoom
  return { x: img.width * s - w, y: img.height * s - h }
}

/**
 * Fill a rectangle with a photo, like CSS `object-fit: cover`, then zoomed and moved by `fit`.
 * Zoomed out (below 1) the photo no longer fills the frame, so the gaps get a blurred, dimmed copy of it.
 */
function cover(ctx: CanvasRenderingContext2D, img: Img, x: number, y: number, w: number, h: number, fit: Fit) {
  const s = Math.max(w / img.width, h / img.height) * fit.zoom
  const dw = img.width * s
  const dh = img.height * s
  const dx = x - (dw - w) * fit.x
  const dy = y - (dh - h) * fit.y
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  if (dw < w - 0.5 || dh < h - 0.5) {
    const c = Math.max(w / img.width, h / img.height)
    ctx.filter = 'blur(40px)'
    ctx.drawImage(img, x - (img.width * c - w) / 2, y - (img.height * c - h) / 2, img.width * c, img.height * c)
    ctx.filter = 'none'
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(x, y, w, h)
  }
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}

function statusBar(ctx: CanvasRenderingContext2D, o: Options) {
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.font = `600 54px ${FONT}`
  ctx.fillText(o.clock, 205, 92)
  // Dynamic Island
  ctx.fillStyle = '#000'
  roundRect(ctx, W / 2 - 185, 40, 370, 106, 53)
  ctx.fill()
  ctx.fillStyle = '#30d158' // the camera-in-use dot
  ctx.beginPath()
  ctx.arc(W / 2 + 62, 93, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  // The three status icons, measured off a real iOS screenshot (design units; bottoms line up at y = 107).
  // Signal: four rounded bars of growing height.
  for (let i = 0; i < 4; i++) {
    const h = 13 + i * 8
    roundRect(ctx, 848 + i * 16.9, 107 - h, 11.5, h, 3.5)
    ctx.fill()
  }
  // Wi-Fi: a rounded wedge at the bottom and two arcs above it, one fan of 84°, point down at (940, 107).
  const wx = 955
  const wy = 107
  const half = (42 * Math.PI) / 180
  const up = -Math.PI / 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(wx, wy)
  ctx.arc(wx, wy, 12, up - half * 0.9, up + half * 0.9)
  ctx.closePath()
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fill()
  for (const [r, w, a] of [[22, 6, 0.9], [34, 6.5, 0.97]]) {
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.arc(wx, wy, r, up - half * a, up + half * a)
    ctx.stroke()
  }
  // Battery: faint outline, a white fill by charge, and a small tip.
  ctx.globalAlpha = 0.4
  ctx.lineWidth = 3.5
  roundRect(ctx, 1004.75, 67.75, 77.5, 40.5, 12)
  ctx.stroke()
  ctx.globalAlpha = 1
  roundRect(ctx, 1010.5, 73.5, Math.max(9, (66 * o.battery) / 100), 29, 8)
  ctx.fill()
  ctx.globalAlpha = 0.45
  roundRect(ctx, 1087, 79, 5, 18, 2.5)
  ctx.fill()
  ctx.restore()
}

function icon(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, color: string, k = 1) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(k, k)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (kind === 'camera') {
    // The FaceTime camera: a rounded body and a small wedge for the lens, about 70 × 46 in all.
    roundRect(ctx, -35, -23, 47, 46, 11)
    ctx.fill()
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.moveTo(18, -6)
    ctx.lineTo(33, -17)
    ctx.lineTo(33, 17)
    ctx.lineTo(18, 6)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
  } else if (kind === 'mic' || kind === 'muted') {
    // A filled capsule in a thin U-shaped holder, on a stem and a base line.
    ctx.lineWidth = 4.5
    roundRect(ctx, -9, -29, 18, 34, 9)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-20, -6)
    ctx.arc(0, -6, 20, Math.PI, 0, true)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 14)
    ctx.lineTo(0, 28)
    ctx.moveTo(-14, 28)
    ctx.lineTo(14, 28)
    ctx.stroke()
    if (kind === 'muted') {
      ctx.lineWidth = 5.5
      ctx.beginPath()
      ctx.moveTo(-26, -32)
      ctx.lineTo(28, 34)
      ctx.stroke()
    }
  } else if (kind === 'more') {
    for (const dx of [-25, 0, 25]) {
      ctx.beginPath()
      ctx.arc(dx, 0, 5.6, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (kind === 'end') {
    ctx.lineWidth = 8.5
    ctx.beginPath()
    ctx.moveTo(-23, -23)
    ctx.lineTo(23, 23)
    ctx.moveTo(23, -23)
    ctx.lineTo(-23, 23)
    ctx.stroke()
  }
  ctx.restore()
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

/** The shutter at the top right. */
function shutter(ctx: CanvasRenderingContext2D) {
  // The shutter, as on iOS: an off-white disc inside a translucent grey ring with a thin light edge.
  circle(ctx, SHUTTER.x, SHUTTER.y, SHUTTER.r, 'rgba(128,128,130,0.66)')
  ctx.beginPath()
  ctx.arc(SHUTTER.x, SHUTTER.y, SHUTTER.r - 1.5, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 3
  ctx.stroke()
  circle(ctx, SHUTTER.x, SHUTTER.y, 51.5, '#f5f3f1')
}

/** The column of round buttons on the right: video, mic, more, hang up. */
function controls(ctx: CanvasRenderingContext2D, o: Options) {
  const rows = ['camera', o.muted ? 'muted' : 'mic', 'more', 'end']
  rows.forEach((k, i) => {
    const cy = COL.y + i * COL.step
    const fill = k === 'end' ? '#f7303c' : k === 'more' ? 'rgba(38,36,32,0.78)' : 'rgba(246,245,243,0.96)'
    circle(ctx, COL.x, cy, COL.r, fill)
    const color = k === 'camera' ? '#34c759' : k === 'mic' || k === 'muted' ? '#f5a25d' : 'rgba(255,255,255,0.92)'
    icon(ctx, k, COL.x, cy, color, (k === 'camera' ? 1.12 : k === 'mic' || k === 'muted' ? 1.22 : 1) * (COL.r / 78))
  })
}

/** The name pill at the top left: a round avatar (the uploaded one, else the big photo), the name, a chevron. */
function namePill(ctx: CanvasRenderingContext2D, avatar: Img | null, big: Img | null, o: Options) {
  const x = MARGIN
  const y = 170
  const h = 138
  ctx.font = `600 52px ${FONT}`
  const tw = ctx.measureText(o.name).width
  const w = Math.min(760, 28 + 106 + 24 + tw + 40 + 40)
  ctx.save()
  roundRect(ctx, x, y, w, h, h / 2)
  ctx.fillStyle = 'rgba(70,70,72,0.5)'
  ctx.fill()
  ctx.restore()
  // avatar
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + 16 + 53, y + h / 2, 53, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) cover(ctx, avatar, x + 16, y + h / 2 - 53, 106, 106, o.avatar)
  else if (big) cover(ctx, big, x + 16, y + h / 2 - 53, 106, 106, { zoom: 1.4, x: 0.5, y: 0.35 })
  else {
    ctx.fillStyle = '#8e8e93'
    ctx.fillRect(x + 16, y + h / 2 - 53, 106, 106)
  }
  ctx.restore()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(o.name, x + 16 + 106 + 24, y + h / 2 + 2)
  // chevron
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const cx = x + w - 44
  ctx.beginPath()
  ctx.moveTo(cx - 8, y + h / 2 - 20)
  ctx.lineTo(cx + 10, y + h / 2)
  ctx.lineTo(cx - 8, y + h / 2 + 20)
  ctx.stroke()
}

/**
 * Draw the whole screen. `canvas` must already be `W*scale` wide (any `scale`, same aspect).
 * Pass `null` for a photo that has not been chosen yet: a plain placeholder is drawn instead.
 */
export function drawFaceTime(canvas: HTMLCanvasElement | OffscreenCanvas, big: Img | null, small: Img | null, avatar: Img | null, o: Options) {
  const scale = canvas.width / W
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, W, H)

  // The big picture
  if (big) cover(ctx, big, 0, 0, W, H, o.big)
  else {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#3b4252')
    g.addColorStop(1, '#1f2430')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `500 56px ${FONT}`
    ctx.fillText('在这里放大图', W / 2, H / 2 - 40)
  }

  // A soft shade under the status bar keeps the white text readable.
  const top = ctx.createLinearGradient(0, 0, 0, 420)
  top.addColorStop(0, 'rgba(0,0,0,0.3)')
  top.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, 420)

  if (o.showStatus) statusBar(ctx, o)
  namePill(ctx, avatar, big, o)

  // The small window
  const r = pipRect(o)
  const px = o.pipAt?.x ?? r.x
  const py = o.pipAt?.y ?? r.y
  const radius = 0 // square corners, like the real small window
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 10
  ctx.fillStyle = '#2a2d36'
  roundRect(ctx, px, py, r.w, r.h, radius)
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundRect(ctx, px, py, r.w, r.h, radius)
  ctx.clip()
  if (small) cover(ctx, small, px, py, r.w, r.h, o.small)
  else {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `500 40px ${FONT}`
    ctx.fillText('小窗', px + r.w / 2, py + r.h / 2)
  }
  ctx.restore()

  shutter(ctx)
  if (o.showControls) controls(ctx, o)
}
