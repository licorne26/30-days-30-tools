// Reading pixels and matching run here, so the page stays responsive even with 20+ screenshots.
// Signatures are cached per screenshot and overlaps per pair, so reordering only re-matches new pairs.
import { contentRows, detectFixedBars, findOverlap, rowSignatures, scaledHeight, type Bars, type Overlap, type Sig } from './stitch'

export type Job = { key: string; width: number; items: { id: string; file: File }[] }

export type WorkerMessage =
  | { type: 'progress'; key: string; done: number; total: number }
  | { type: 'result'; key: string; bars: Bars; overlaps: (Overlap | null)[] }
  | { type: 'error'; key: string; message: string }

/** `native`: the screenshot already had the common width (no resampling). */
const sigs = new Map<string, Sig & { native: boolean }>()
const pairs = new Map<string, Overlap | null>()
let latest = ''

const post = (msg: WorkerMessage) => self.postMessage(msg)
const yieldToMessages = () => new Promise((r) => setTimeout(r))

async function signature(file: File, width: number) {
  const bitmap = await createImageBitmap(file)
  const native = bitmap.width === width
  const height = scaledHeight(bitmap, width)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { native, height, rows: rowSignatures(ctx.getImageData(0, 0, width, height).data, width, height) }
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { key, width, items } = e.data
  latest = key
  try {
    const list: (Sig & { native: boolean })[] = []
    for (const [i, it] of items.entries()) {
      const id = `${it.id}@${width}`
      if (!sigs.has(id)) {
        sigs.set(id, await signature(it.file, width))
        if (latest !== key) return // a newer job arrived; it will redo what is still missing
      }
      list.push(sigs.get(id)!)
      post({ type: 'progress', key, done: i + 1, total: items.length * 2 })
    }

    // Resampled screenshots never match pixel for pixel, so the bars are read from the ones at the
    // common width (when there are at least two) and then applied to every screenshot.
    const native = list.filter((s) => s.native)
    const bars = detectFixedBars(native.length >= 2 ? native : list)
    const overlaps: (Overlap | null)[] = [null]
    for (let i = 1; i < list.length; i++) {
      const id = [items[i - 1].id, items[i].id, width, bars.top, bars.bottom].join('|')
      if (!pairs.has(id)) {
        pairs.set(id, findOverlap(contentRows(list[i - 1], bars), contentRows(list[i], bars)))
        await yieldToMessages()
        if (latest !== key) return
      }
      overlaps.push(pairs.get(id)!)
      post({ type: 'progress', key, done: items.length + i + 1, total: items.length * 2 })
    }
    post({ type: 'result', key, bars, overlaps })
  } catch (err) {
    post({ type: 'error', key, message: err instanceof Error ? err.message : String(err) })
  }
}
