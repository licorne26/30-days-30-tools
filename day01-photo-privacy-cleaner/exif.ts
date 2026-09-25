// Minimal EXIF reader for JPEG: walks APP1 → TIFF → IFD0, Exif IFD and GPS IFD.
// Only the fields that matter for privacy are extracted.

export type PhotoInfo = {
  make?: string
  model?: string
  software?: string
  takenAt?: string
  lens?: string
  lat?: number
  lon?: number
}

const ASCII_TAGS: Record<number, keyof PhotoInfo> = {
  0x010f: 'make',
  0x0110: 'model',
  0x0131: 'software',
  0x0132: 'takenAt',
  0x9003: 'takenAt',
  0xa434: 'lens',
}
const EXIF_POINTER = 0x8769
const GPS_POINTER = 0x8825

export function readExif(buf: ArrayBuffer): PhotoInfo {
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {}
  let off = 2
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off)
    if ((marker & 0xff00) !== 0xff00) break
    const size = v.getUint16(off + 2)
    if (marker === 0xffe1 && off + 10 < v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      return parseTiff(v, off + 10)
    }
    off += 2 + size
  }
  return {}
}

function parseTiff(v: DataView, start: number): PhotoInfo {
  const le = v.getUint16(start) === 0x4949
  const u16 = (o: number) => v.getUint16(o, le)
  const u32 = (o: number) => v.getUint32(o, le)
  const inBounds = (o: number, n = 1) => o >= 0 && o + n <= v.byteLength
  const out: PhotoInfo = {}
  const gps: { latRef?: string; lonRef?: string } = {}

  const ascii = (o: number, n: number) => {
    let s = ''
    for (let i = 0; i < n && inBounds(o + i); i++) {
      const c = v.getUint8(o + i)
      if (!c) break
      s += String.fromCharCode(c)
    }
    return s.trim()
  }
  const rational = (o: number) => (inBounds(o, 8) ? u32(o) / (u32(o + 4) || 1) : 0)
  const dms = (o: number) => rational(o) + rational(o + 8) / 60 + rational(o + 16) / 3600

  const seen = new Set<number>()
  function readIfd(ifdOffset: number, isGps: boolean) {
    const base = start + ifdOffset
    if (seen.has(base) || !inBounds(base, 2)) return
    seen.add(base)
    const count = u16(base)
    for (let i = 0; i < count; i++) {
      const e = base + 2 + i * 12
      if (!inBounds(e, 12)) return
      const tag = u16(e)
      const type = u16(e + 2)
      const n = u32(e + 4)
      const dataAt = type === 2 && n <= 4 ? e + 8 : start + u32(e + 8)

      if (isGps) {
        if (tag === 1) gps.latRef = String.fromCharCode(v.getUint8(e + 8))
        else if (tag === 3) gps.lonRef = String.fromCharCode(v.getUint8(e + 8))
        else if (tag === 2) out.lat = dms(dataAt)
        else if (tag === 4) out.lon = dms(dataAt)
        continue
      }
      if (tag === EXIF_POINTER) readIfd(u32(e + 8), false)
      else if (tag === GPS_POINTER) readIfd(u32(e + 8), true)
      else if (type === 2 && ASCII_TAGS[tag]) {
        const key = ASCII_TAGS[tag]
        // Prefer DateTimeOriginal over the file's modify date.
        if (key === 'takenAt' && out.takenAt && tag === 0x0132) continue
        ;(out as Record<string, string>)[key] = ascii(dataAt, n)
      }
    }
  }

  readIfd(u32(start + 4), false)
  if (out.lat != null && gps.latRef === 'S') out.lat = -out.lat
  if (out.lon != null && gps.lonRef === 'W') out.lon = -out.lon
  if (out.lat === 0 && out.lon === 0) {
    delete out.lat
    delete out.lon
  }
  return out
}

/** Re-draw the pixels on a canvas: the new file carries no metadata at all. */
export async function cleanImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  const type = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, 0.92),
  )
}
