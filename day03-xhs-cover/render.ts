export const W = 1080
export const H = 1440

const SANS = '"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif'
const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Noto Serif SC","SimSun",serif'

export type Content = {
  /** Title; wrap words in **double asterisks** to highlight them. New lines are kept. */
  title: string
  subtitle: string
  tags: string[]
  author: string
}

type Highlight = 'marker' | 'color' | 'underline'

export type Template = {
  id: string
  name: string
  bg: string
  ink: string
  muted: string
  accent: string
  /** Colour of highlighted text; defaults to the ink colour. */
  accentInk?: string
  highlight: Highlight
  font: 'sans' | 'serif'
  align: 'left' | 'center'
  /** Optional decoration drawn behind the text. */
  decor?: 'grid' | 'lines' | 'block' | 'frame'
}

export const TEMPLATES: Template[] = [
  { id: 'poster', name: '大字报', bg: '#f6f1e7', ink: '#111111', muted: '#6b6558', accent: '#ffd43b', highlight: 'marker', font: 'sans', align: 'left' },
  { id: 'night', name: '暗夜', bg: '#0b0b0c', ink: '#fafafa', muted: '#8f8f8f', accent: '#34d399', accentInk: '#34d399', highlight: 'color', font: 'sans', align: 'left', decor: 'grid' },
  { id: 'memo', name: '便签', bg: '#fff7d6', ink: '#262320', muted: '#8a7f63', accent: '#ef4444', highlight: 'underline', font: 'sans', align: 'left', decor: 'lines' },
  { id: 'magazine', name: '杂志', bg: '#ffffff', ink: '#141414', muted: '#7a7a7a', accent: '#d9381e', accentInk: '#d9381e', highlight: 'color', font: 'serif', align: 'center', decor: 'frame' },
  { id: 'block', name: '撞色', bg: '#ffffff', ink: '#ffffff', muted: '#5c5c5c', accent: '#2f5bff', accentInk: '#ffe14d', highlight: 'color', font: 'sans', align: 'left', decor: 'block' },
]

type Glyph = { text: string; hl: boolean }

/** Split the title into wrap units: one CJK character, or one Latin word / number run. */
function tokenize(title: string): (Glyph | '\n')[] {
  const out: (Glyph | '\n')[] = []
  const parts = title.split('**')
  parts.forEach((part, i) => {
    const hl = i % 2 === 1
    for (const m of part.matchAll(/\n|[A-Za-z0-9$%.+#@'’-]+\s?|\s|[^\sA-Za-z0-9]/g)) {
      out.push(m[0] === '\n' ? '\n' : { text: m[0], hl })
    }
  })
  return out
}

const NO_LINE_START = new Set('，。！？、；：,.!?;:）」』》”’)…'.split(''))

function layoutLines(ctx: CanvasRenderingContext2D, tokens: (Glyph | '\n')[], maxW: number) {
  const lines: Glyph[][] = [[]]
  let w = 0
  for (const t of tokens) {
    if (t === '\n') {
      lines.push([])
      w = 0
      continue
    }
    const tw = ctx.measureText(t.text).width
    const line = lines[lines.length - 1]
    if (w + tw > maxW && line.length && !NO_LINE_START.has(t.text)) {
      // Drop trailing spaces from the finished line.
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop()
      if (/^\s+$/.test(t.text)) {
        lines.push([])
        w = 0
        continue
      }
      lines.push([t])
      w = tw
    } else {
      line.push(t)
      w += tw
    }
  }
  return lines.filter((l, i) => l.length || i < lines.length - 1)
}

function lineWidth(ctx: CanvasRenderingContext2D, line: Glyph[]) {
  return line.reduce((s, g) => s + ctx.measureText(g.text).width, 0)
}

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, t: Template, onBlock: boolean) {
  ctx.font = `600 32px ${SANS}`
  const tw = ctx.measureText(text).width
  const w = tw + 44
  const h = 58
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h / 2)
  if (onBlock || t.id === 'night') {
    ctx.fillStyle = t.id === 'night' ? '#1a1a1a' : '#f1f3f9'
    ctx.fill()
  } else {
    ctx.strokeStyle = t.ink
    ctx.globalAlpha = 0.85
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = t.id === 'night' ? '#d4d4d4' : t.id === 'block' ? '#1f2a4d' : t.ink
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 22, y + h / 2 + 1)
  return w
}

export function render(canvas: HTMLCanvasElement, c: Content, t: Template, scale = 1) {
  canvas.width = W * scale
  canvas.height = H * scale
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  // ---- background + decoration
  ctx.fillStyle = t.bg
  ctx.fillRect(0, 0, W, H)
  const pad = 96
  let top = 200
  let titleBottomLimit = 1040
  let titleColor = t.ink

  if (t.decor === 'grid') {
    ctx.strokeStyle = 'rgba(255,255,255,0.045)'
    ctx.lineWidth = 1
    for (let x = 0; x <= W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke()
    }
    for (let y = 0; y <= H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke()
    }
    const g = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 700)
    g.addColorStop(0, 'rgba(52,211,153,0.22)')
    g.addColorStop(1, 'rgba(52,211,153,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  } else if (t.decor === 'lines') {
    ctx.strokeStyle = 'rgba(160,130,60,0.18)'
    ctx.lineWidth = 2
    for (let y = 170; y < H - 60; y += 72) {
      ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(W - 60, y); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(239,68,68,0.35)'
    ctx.beginPath(); ctx.moveTo(84, 0); ctx.lineTo(84, H); ctx.stroke()
    // Tape
    ctx.save()
    ctx.translate(W / 2, 40)
    ctx.rotate(-0.03)
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.fillRect(-120, -26, 240, 64)
    ctx.restore()
  } else if (t.decor === 'frame') {
    ctx.strokeStyle = t.ink
    ctx.lineWidth = 3
    ctx.strokeRect(48, 48, W - 96, H - 96)
    ctx.lineWidth = 1
    ctx.strokeRect(60, 60, W - 120, H - 120)
  } else if (t.decor === 'block') {
    ctx.fillStyle = t.accent
    ctx.fillRect(0, 0, W, 980)
    titleBottomLimit = 900
  }

  // ---- kicker (author) at the top
  const font = t.font === 'serif' ? SERIF : SANS
  if (c.author) {
    ctx.font = `600 34px ${SANS}`
    ctx.fillStyle = t.decor === 'block' ? 'rgba(255,255,255,0.8)' : t.muted
    ctx.textAlign = t.align
    ctx.fillText(c.author, t.align === 'center' ? W / 2 : pad, 140)
    ctx.textAlign = 'left'
  }
  if (t.id === 'magazine') top = 250

  // ---- title
  // Poster mode: every line the user typed gets its own size, as large as fits the width.
  // If a typed line is too long for that, fall back to one size with automatic wrapping.
  const maxW = W - pad * 2
  const tokens = tokenize(c.title || '在这里输入标题')
  const bottom = t.decor === 'block' ? titleBottomLimit : H - 260
  const room = bottom - top - (c.subtitle && t.decor !== 'block' ? 140 : 0)
  const LH = 1.22

  const typed: Glyph[][] = [[]]
  for (const tk of tokens) {
    if (tk === '\n') typed.push([])
    else typed[typed.length - 1].push(tk)
  }
  const nonEmpty = typed.filter((l) => l.some((g) => g.text.trim()))

  let rows: { glyphs: Glyph[]; size: number }[] = []
  if (nonEmpty.length && nonEmpty.length <= 5) {
    ctx.font = `900 100px ${font}`
    let sizes = nonEmpty.map((l) => Math.min(t.align === 'center' ? 210 : 230, Math.floor((100 * maxW) / lineWidth(ctx, l))))
    // Keep the lines visually related: the largest is at most 1.8× the smallest.
    const smallest = Math.min(...sizes)
    sizes = sizes.map((s) => Math.min(s, Math.floor(smallest * 1.8)))
    const total = sizes.reduce((a, s) => a + s * LH, 0)
    if (total > room) sizes = sizes.map((s) => Math.floor((s * room) / total))
    if (Math.min(...sizes) >= 96) {
      rows = nonEmpty.map((glyphs, i) => ({ glyphs, size: sizes[i] }))
    }
  }
  if (!rows.length) {
    let size = 60
    for (let s = 168; s >= 60; s -= 4) {
      ctx.font = `900 ${s}px ${font}`
      const ls = layoutLines(ctx, tokens, maxW)
      if (ls.length <= 6 && ls.length * s * LH <= room) {
        size = s
        break
      }
    }
    ctx.font = `900 ${size}px ${font}`
    rows = layoutLines(ctx, tokens, maxW).map((glyphs) => ({ glyphs, size }))
  }

  // Subtitle lines are measured now so the whole text group can be centred.
  ctx.font = `500 42px ${SANS}`
  const subLines = c.subtitle ? layoutLines(ctx, tokenize(c.subtitle.replaceAll('**', '')), maxW).slice(0, 3) : []
  const titleH = rows.reduce((a, r) => a + r.size * LH, 0)
  const groupH = titleH + (t.decor === 'block' ? 0 : subLines.length ? 40 + subLines.length * 62 : 0)
  top = Math.max(top, top + (bottom - top - groupH) * 0.42)

  let y = top
  for (const { glyphs, size } of rows) {
    ctx.font = `900 ${size}px ${font}`
    const lw = lineWidth(ctx, glyphs)
    let x = t.align === 'center' ? (W - lw) / 2 : pad
    const baseline = y + size
    for (const g of glyphs) {
      const gw = ctx.measureText(g.text).width
      if (g.hl && !/^\s+$/.test(g.text)) {
        if (t.highlight === 'marker') {
          ctx.fillStyle = t.accent
          ctx.fillRect(x - 2, baseline - size * 0.42, gw + 4, size * 0.5)
        } else if (t.highlight === 'underline') {
          ctx.fillStyle = t.accent
          ctx.fillRect(x, baseline + size * 0.1, gw, Math.max(6, size * 0.07))
        }
      }
      ctx.fillStyle = g.hl && t.highlight === 'color' ? (t.accentInk ?? t.accent) : titleColor
      ctx.fillText(g.text, x, baseline)
      x += gw
    }
    y += size * LH
  }
  const titleEnd = y

  // ---- subtitle
  const subTop = t.decor === 'block' ? 1030 : titleEnd + 40
  if (subLines.length) {
    ctx.font = `500 42px ${SANS}`
    ctx.fillStyle = t.muted
    ctx.textAlign = t.align
    subLines.forEach((l, i) => {
      ctx.fillText(l.map((g) => g.text).join(''), t.align === 'center' ? W / 2 : pad, subTop + 42 + i * 62)
    })
    ctx.textAlign = 'left'
  }

  // ---- tags along the bottom
  const tags = c.tags.filter(Boolean).slice(0, 4)
  if (tags.length) {
    ctx.font = `600 32px ${SANS}`
    const widths = tags.map((tag) => ctx.measureText(`#${tag}`).width + 44)
    const total = widths.reduce((a, b) => a + b, 0) + (tags.length - 1) * 16
    let x = t.align === 'center' ? (W - total) / 2 : pad
    const y = H - 150
    tags.forEach((tag) => {
      x += chip(ctx, x, y, `#${tag}`, t, t.decor === 'block') + 16
    })
  }
}
