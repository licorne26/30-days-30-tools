// Pure geometry shared by the stage, the Moments preview and the export,
// so all three always agree on which source pixels end up in which cell.

export type LayoutId = '3x3' | '2x2' | '1x3'
export type Layout = { id: LayoutId; cols: number; rows: number; label: string }

export const LAYOUTS: Layout[] = [
  { id: '3x3', cols: 3, rows: 3, label: '九宫格' },
  { id: '2x2', cols: 2, rows: 2, label: '四宫格' },
  { id: '1x3', cols: 3, rows: 1, label: '三连图' },
]

export type Size = { width: number; height: number }
export type Rect = { x: number; y: number; w: number; h: number }

/**
 * Where the crop box sits on the source image.
 * zoom 1 = the largest crop box that fits inside the image; cx / cy = its centre in source pixels.
 */
export type View = { zoom: number; cx: number; cy: number }

export const MAX_ZOOM = 5
/** Each exported cell is at most this many pixels square. */
export const CELL_SIZE = 1080
/** Below this many source pixels per cell the result looks soft on a phone. */
export const BLURRY_BELOW = 600

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function cropSize(img: Size, layout: Layout, zoom: number) {
  const aspect = layout.cols / layout.rows
  const w = Math.min(img.width, img.height * aspect) / zoom
  return { w, h: w / aspect }
}

export function initialView(img: Size): View {
  return { zoom: 1, cx: img.width / 2, cy: img.height / 2 }
}

/** Keep the zoom in range and the crop box fully covered by the image, so no cell is ever blank. */
export function clampView(img: Size, layout: Layout, v: View): View {
  const zoom = clamp(v.zoom, 1, MAX_ZOOM)
  const { w, h } = cropSize(img, layout, zoom)
  return {
    zoom,
    cx: clamp(v.cx, w / 2, img.width - w / 2),
    cy: clamp(v.cy, h / 2, img.height - h / 2),
  }
}

export function cropRect(img: Size, layout: Layout, view: View): Rect {
  const v = clampView(img, layout, view)
  const { w, h } = cropSize(img, layout, v.zoom)
  return { x: v.cx - w / 2, y: v.cy - h / 2, w, h }
}

/** Source rectangle of every cell, in posting order: left to right, then top to bottom. */
export function cellRects(img: Size, layout: Layout, view: View): Rect[] {
  const c = cropRect(img, layout, view)
  const size = c.w / layout.cols
  const cells: Rect[] = []
  for (let r = 0; r < layout.rows; r++) {
    for (let col = 0; col < layout.cols; col++) {
      cells.push({ x: c.x + col * size, y: c.y + r * size, w: size, h: size })
    }
  }
  return cells
}

/** Source pixels per cell, and the square size each cell is exported at. */
export function cellResolution(img: Size, layout: Layout, view: View) {
  const source = cropRect(img, layout, view).w / layout.cols
  return { source, output: Math.max(1, Math.min(CELL_SIZE, Math.floor(source))) }
}

/** Move the crop by a drag of (dx, dy) screen pixels over a crop box drawn frameWidth pixels wide. */
export function pan(img: Size, layout: Layout, view: View, dx: number, dy: number, frameWidth: number): View {
  const k = cropRect(img, layout, view).w / frameWidth
  return clampView(img, layout, { ...view, cx: view.cx - dx * k, cy: view.cy - dy * k })
}

/**
 * Zoom while keeping one point still. (ax, ay) is that point's offset from the crop box centre,
 * as a fraction of the box's width / height — e.g. (0, 0) zooms around the centre.
 */
export function zoomAt(img: Size, layout: Layout, view: View, zoom: number, ax = 0, ay = 0): View {
  const before = cropRect(img, layout, view)
  const next = clampView(img, layout, { ...view, zoom })
  const after = cropSize(img, layout, next.zoom)
  const px = before.x + before.w / 2 + ax * before.w
  const py = before.y + before.h / 2 + ay * before.h
  return clampView(img, layout, { zoom: next.zoom, cx: px - ax * after.w, cy: py - ay * after.h })
}

/** Where the crop box is drawn inside a stage of the given size, leaving a margin to show what's cut off. */
export function frameRect(stage: Size, layout: Layout, margin = 0.08): Rect {
  const aspect = layout.cols / layout.rows
  const maxW = stage.width * (1 - margin * 2)
  const maxH = stage.height * (1 - margin * 2)
  const w = Math.min(maxW, maxH * aspect)
  const h = w / aspect
  return { x: (stage.width - w) / 2, y: (stage.height - h) / 2, w, h }
}

export function scaleRect(r: Rect, s: number): Rect {
  return { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s }
}
