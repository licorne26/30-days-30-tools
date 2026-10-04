// The public face of the OCR: prepare the picture in a worker, recognise it with tesseract.js
// (which runs its own worker), and hand back lines with boxes in the ORIGINAL picture's pixels.
// The engine, its wasm core and the language models are all files of this site (public/), so nothing
// is fetched from anyone else's server.
import { createWorker, type Worker } from 'tesseract.js'

export type Lang = 'chi_sim+eng' | 'eng'
export type Line = {
  text: string
  /** 0–100 */
  conf: number
  x: number
  y: number
  w: number
  h: number
  /** Paragraph number, from the engine's layout analysis. */
  para: number
}
export type Result = { lines: Line[]; width: number; height: number }

/** Lines below this confidence are flagged for a second look. */
export const LOW_CONF = 75
/** Download sizes of the models, shown before the first use. */
export const MODEL_MB: Record<Lang, number> = { 'chi_sim+eng': 6.6, eng: 4.1 }

const BASE = import.meta.env.BASE_URL
const abs = (p: string) => new URL(BASE + p, location.href).href

export type Progress = { phase: 'model' | 'engine' | 'read'; value: number }

let engine: { lang: Lang; worker: Promise<Worker> } | null = null
let report: (p: Progress) => void = () => {}

function workerFor(lang: Lang) {
  if (engine?.lang === lang) return engine.worker
  const old = engine?.worker
  old?.then((w) => w.terminate())
  const worker = createWorker(lang.split('+'), 1, {
    workerPath: abs('tesseract/worker.min.js'),
    corePath: abs('tesseract'),
    langPath: abs('models'),
    gzip: false,
    logger: (m: { status: string; progress: number }) => {
      if (m.status.includes('language')) report({ phase: 'model', value: m.progress })
      else if (m.status === 'recognizing text') report({ phase: 'read', value: m.progress })
      else report({ phase: 'engine', value: m.progress })
    },
  })
  engine = { lang, worker }
  return worker
}

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/

/** The engine puts spaces between Chinese characters; take them out, keep the ones between words. */
export function tidy(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\S) (?=\S)/g, (m, a: string, off: number, s: string) => (CJK.test(a) && CJK.test(s[off + 2] ?? '') ? a : m))
    .replace(/([⺀-鿿]) (?=[，。！？；：、）》”])/g, '$1')
}

/**
 * A new paragraph starts where the gap to the previous line is clearly bigger than normal line spacing.
 * (The engine's own paragraph guesses split an evenly spaced notice in two, so they are not used.)
 */
export function groupParagraphs(lines: Line[]) {
  if (!lines.length) return
  const gaps = lines.slice(1).map((l, i) => l.y - (lines[i].y + lines[i].h))
  const sorted = [...gaps].sort((a, b) => a - b)
  const typical = Math.max(0, sorted[Math.floor(sorted.length / 2)] ?? 0)
  const tall = lines.reduce((s, l) => s + l.h, 0) / lines.length
  let para = 0
  lines[0].para = 0
  gaps.forEach((g, i) => {
    if (g > typical + tall * 0.8) para++
    lines[i + 1].para = para
  })
}

/** Join lines of one paragraph: no space between Chinese lines, a space between English ones. */
export function joinLines(lines: string[]) {
  let out = ''
  for (const l of lines) {
    if (out && !(CJK.test(out.slice(-1)) || CJK.test(l[0] ?? ''))) out += ' '
    out += l
  }
  return out
}

function prep(bitmap: ImageBitmap, invert: boolean) {
  return new Promise<{ blob: Blob; scale: number }>((resolve, reject) => {
    const w = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      resolve(e.data)
      w.terminate()
    }
    w.onerror = (e) => reject(e)
    w.postMessage({ bitmap, invert }, [bitmap])
  })
}

export async function recognize(file: Blob, lang: Lang, invert: boolean, onProgress: (p: Progress) => void): Promise<Result> {
  report = onProgress
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const width = bitmap.width
  const height = bitmap.height
  const { blob, scale } = await prep(bitmap, invert)
  const worker = await workerFor(lang)
  const { data } = await worker.recognize(blob, {}, { blocks: true })
  const lines: Line[] = []
  for (const block of data.blocks ?? []) {
    for (const p of block.paragraphs) {
      for (const l of p.lines) {
        const text = tidy(l.text)
        if (!text) continue
        const { x0, y0, x1, y1 } = l.bbox
        lines.push({ text, conf: l.confidence, x: x0 / scale, y: y0 / scale, w: (x1 - x0) / scale, h: (y1 - y0) / scale, para: 0 })
      }
    }
  }
  lines.sort((a, b) => a.y - b.y || a.x - b.x)
  groupParagraphs(lines)
  return { lines, width, height }
}
