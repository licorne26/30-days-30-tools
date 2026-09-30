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
  {
    day: 3,
    slug: 'day03-xhs-cover',
    title: '小红书封面生成器',
    description: '输入标题，重点词自动高亮，5 套模板一键导出 1080×1440 的小红书封面。',
    prompt:
      '做一个纯浏览器端的小红书封面生成器：输入标题，用 **两个星号** 包住的词自动高亮（荧光笔、变色或下划线），标题字号自动放到最大，给 5 套风格不同的排版模板和可换的重点色，实时预览 3:4 封面，一键导出 1080×1440 PNG，不上传、不联网。',
  },
  {
    day: 4,
    slug: 'day04-grid-splitter',
    title: '九宫格切图',
    description: '选好区域，一键切成九宫格、四宫格或三连图，按发布顺序打包下载。',
    prompt:
      '做一个纯浏览器端的九宫格切图工具：拖入一张图片，拖动和缩放选好裁剪区域，切成 3×3、2×2 或 1×3 的方格，用朋友圈的样子实时预览，一键打包下载按发布顺序命名的图片，不上传、不联网。',
  },
  {
    day: 5,
    slug: 'day05-image-compressor',
    title: '图片压缩到指定大小',
    description: '输入目标大小，每张图自动压到最清晰又不超标，报名照、签证照、网申直接能用。',
    prompt:
      '做一个纯浏览器端的图片压缩工具：拖入一张或多张图片，输入目标大小（比如 50KB、200KB），自动找到最高画质把每张压到目标以内，可以拖动滑块对比压缩前后，一键打包下载，不上传、不联网。',
  },
  {
    day: 6,
    slug: 'day06-qr-code',
    title: '二维码生成器',
    description: 'WiFi 二维码、网址、名片一键生成，可换颜色、码点样式、加 Logo，导出 PNG 和 SVG。',
    prompt:
      '做一个纯浏览器端的二维码生成器：支持 WiFi（扫码直接连网）、网址文字和名片三种内容，可以换配色、码点和码眼样式、在中间加 Logo、在下面加一行说明文字，实时预览，导出高清 PNG 和 SVG，WiFi 密码不上传、不联网。',
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
