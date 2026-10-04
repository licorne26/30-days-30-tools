// Pixel preparation, off the main thread: scale small images up, grey, optionally invert.
export type Prep = { bitmap: ImageBitmap; invert: boolean }
export type Prepped = { blob: Blob; scale: number }

/** Images with a short edge under this are enlarged 2× before recognition. */
const SMALL = 800

self.onmessage = async (e: MessageEvent<Prep>) => {
  const { bitmap, invert } = e.data
  const scale = Math.min(bitmap.width, bitmap.height) < SMALL ? 2 : 1
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h) // transparent PNGs read as white, not black
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    if (invert) g = 255 - g
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(img, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  self.postMessage({ blob, scale } satisfies Prepped)
}
