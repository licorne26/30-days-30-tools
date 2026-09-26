export type Tool = {
  day: number
  slug: string
  title: string
  description: string
  /** The one sentence given to the AI to build this tool. */
  prompt: string
}

export const REPO_URL = 'https://github.com/licorne26/30-days-30-tools'
export const X_URL = 'https://x.com/la_licorne9'
export const TOTAL_DAYS = 30

export const tools: Tool[] = [
  {
    day: 1,
    slug: 'day01-photo-privacy-cleaner',
    title: '照片隐私清理器',
    description: '读出照片里的 GPS 定位、手机型号和拍摄时间，一键导出干净的照片。',
    prompt:
      '做一个纯浏览器端的照片隐私清理器：拖入照片，先把 EXIF 里的 GPS 定位、设备型号、拍摄时间读出来展示给用户，再一键导出去掉所有元数据的干净照片，不上传、不联网。',
  },
  {
    day: 2,
    slug: 'day02-screenshot-beautifier',
    title: '截图美化器',
    description: '给截图加上渐变背景、窗口边框和阴影，一键导出适合 X 和小红书的尺寸。',
    prompt:
      '做一个纯浏览器端的截图美化器：拖入或直接粘贴截图，加上渐变背景、macOS 或浏览器窗口边框、圆角和阴影，可以选 16:9、3:4 等发帖比例，预览和导出用同一套 canvas 绘制，一键下载 PNG 或复制到剪贴板，不上传、不联网。',
  },
]

export function toolBySlug(slug: string) {
  const tool = tools.find((t) => t.slug === slug)
  if (!tool) throw new Error(`Unknown tool: ${slug}`)
  return tool
}

export function pageUrl(slug?: string) {
  return import.meta.env.BASE_URL + (slug ? `${slug}/` : '')
}
