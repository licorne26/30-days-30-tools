# promo：每天的宣传视频

一条命令做出当天工具的竖版宣传视频（1080×1440，30fps，H.264 + AAC）和小红书封面：

```bash
python promo/make.py day04
```

- **画面**：Playwright 打开本地 `npm run preview` 的真实页面，放进深色舞台，逐帧截图。不录屏，同样的代码每次渲染出同样的视频。
- **配音**：Gemini TTS，每句有自己的语气，本地缓存。
- **配乐**：numpy 从零合成（pad + 拨弦琶音 + 鼓），界面每次变化加一个很轻的点击声。
- **混音**：有人声时配乐自动压低，整体响度 -14 LUFS。
- **封面**：用 Day 3 的封面生成器自己做。

输出在 `promo/out/`：`day04.mp4`、`day04_cover.jpg`，中间文件在 `promo/out/day04/`。

## 安装

需要 Python 3.10+、Node（仓库本身的依赖）和 ffmpeg。

```bash
npm install
python3 -m venv promo/.venv
promo/.venv/bin/pip install -r promo/requirements.txt
promo/.venv/bin/python -m playwright install chromium
```

## 配置 `.env`

在仓库根目录建 `.env`（已在 `.gitignore` 里，不会被提交）：

```
GEMINI_API_KEY=你的 key
# 可选
GEMINI_TTS_MODEL=gemini-3.8-flash-tts
GEMINI_TTS_VOICE=Puck
```

TTS 结果按 `模型 + 音色 + 语气 + 文本` 缓存在 `promo/.cache/tts/`。改了旁白才会重新请求，所以反复调画面不花钱。

## 运行

```bash
promo/.venv/bin/python promo/make.py day04              # 构建网站、渲染视频、做封面
promo/.venv/bin/python promo/make.py day04 --no-build   # dist/ 已经是最新的
promo/.venv/bin/python promo/make.py day04 --no-cover
```

开始渲染前会打印每一镜的起止时间和旁白时长，旁白超出镜头会直接报错。结尾会打印成片的响度和真峰值。

## 时间线怎么算

- 一镜的长度 = 旁白时长 + 0.6 秒，向上取整到整拍，再加上这一镜的 `extra_beats`。旁白在镜头开始后 0.2 秒进入。
- 镜头里的动作按“这一镜的第几拍”来写：`c.until(3)` 把上一帧延长到第 3 拍。如果动画已经超过这一拍，直接报错，不会悄悄错位。遇到报错就把动作往后挪一拍，或者减少帧数。
- 一拍 = 60 / BPM 秒。116 BPM 时一拍约 0.52 秒，字幕切换占 10 帧（0.33 秒）。所以每镜的第一个动作一般放在第 2 拍。
- 配乐的段落跟镜头走：第一镜只有 pad 和琶音，第二镜开始进鼓，最后一镜鼓停、和弦收尾。

## 新增一天：`promo/days/dayNN.py`

复制 `day04.py` 改。一个 day 模块需要这些：

| 名字 | 说明 |
| --- | --- |
| `BPM` | 节拍，决定镜头长度的取整和配乐速度 |
| `PILL` | 舞台左上角的小标签，如 `Day 4 / 30 · 九宫格切图` |
| `APP` | 工具文件夹名，如 `day04-grid-splitter` |
| `URL_LABEL` | 窗口地址栏里显示的文字 |
| `CHORDS` | 和弦进行，一小节一个，如 `["Dm7", "Bbmaj7", "F", "C"]`。支持 `m 7 maj7 m7 6 sus2 sus4 add9 9 maj9 m9` |
| `END` | 结尾卡：`kicker`、`title`、`url`、`note` |
| `COVER` | 封面：`title`（`**重点词**` 高亮）、`subtitle`、`tags`、`author`、`template`（Day 3 的模板名） |
| `setup(c)` | 页面打开后调用一次，用 `c.inject(html, css)` 往舞台加这一天专用的叠加层 |
| `SCENES` | `Scene(cap, say, style, act, extra_beats=0)` 的列表 |

`Scene` 的字段：

- `cap`：顶部字幕 `("01", "标题", "一行说明")`。结尾卡用 `None`，这时顶部字幕隐藏，结尾卡盖住画面。
- `say`：旁白文字，也会显示在底部字幕条上，最多两行。
- 语气统一由分镜文件里的 `STYLE` 控制（不写就用 `tts.DEFAULT_STYLE`：平稳、清晰的讲解语气）。整段旁白在**一次请求**里读完，再按句间停顿切开，所以每句的音色和情绪一致；切不开时会自动退回逐句请求（语气相同）。`Scene` 里的 `style` 字段已不再使用。
- 默认音色是 `Charon`（偏讲解），可以在 `.env` 里用 `GEMINI_TTS_VOICE` 换。
- `act(c)`：这一镜的动作。开始时字幕已经切换好了。

`act` 里常用的 `c`（`lib/capture.py` 的 `Capture`）：

| 方法 | 作用 |
| --- | --- |
| `c.shot(settle=False)` | 截一帧（1/30 秒）。操作过页面后用 `settle=True`，等 React 画完再截 |
| `c.until(beat)` | 停在当前画面，直到这一镜的第 `beat` 拍 |
| `c.tick()` | 记录一次界面变化，配乐在这个时刻加点击声 |
| `c.app` | 工具页面的 Playwright frame，可以直接 `locator`、`set_input_files` |
| `c.click(selector, beat)` | 画出来的鼠标滑到元素上，正好在第 `beat` 拍真实点击 |
| `c.cursor_to(x, y, frames, drag=False)` | 移动鼠标；`drag=True` 时真实鼠标跟着移动（配合 `c.pg.mouse.down()` 做拖拽） |
| `c.pop(js_expr)` | 给页面里的元素一个轻微回弹（0.965 → 1） |
| `c.fade(id, a, b, frames)` / `c.style(id, **css)` | 控制舞台上的元素 |
| `c.center(selector)` / `c.app_box(selector)` | 页面里元素在视频画面上的位置。已经算上了页面 1.2 倍的缩放 |

小提示：

- 舞台上的叠加层都是 `pointer-events: none`，不会挡住对页面的真实点击。
- 页面按 800px 宽排版，再放大 1.2 倍放进窗口，字在手机上才看得清。窗口里大约能看到 700px 高的页面。
- 要截页面里某个元素做结尾卡图片，用 `c.pg.screenshot(clip=c.app_box(...))`。Playwright 自带的元素截图不认 iframe 的缩放，会截错位置。
- 演示用的图片放在 `promo/assets/`，要自己画，不用网上下载的图，也不用 AI 生成的照片。Day 4 的风景图由 `assets/landscape.py` 生成。

## 目录

```
promo/
  make.py            入口
  lib/stage.html     舞台模板（pill、字幕、窗口、字幕条、进度条、结尾卡）
  lib/capture.py     逐帧截图和通用动作
  lib/tts.py         Gemini TTS + 缓存（python -m promo.lib.tts "一句话" "语气" 可以单独试听）
  lib/music.py       合成配乐
  lib/mix.py         混音、响度、合成 MP4
  lib/cover.py       用 Day 3 做封面
  days/dayNN.py      每天的分镜
  assets/            演示素材
  out/  .cache/      输出和缓存（不进仓库）
```
