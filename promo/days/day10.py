"""Day 10 · 图片转文字. Page actions are written in beats of their own scene."""
import base64
import re
import subprocess
import sys
from pathlib import Path

from promo.lib.capture import Scene, ease

BPM = 112
# Every line is read in one take with this style, so the narration stays steady.
STYLE = "用平稳、清晰、语速适中的语气做产品讲解，像一段专业的演示旁白。整段保持同一种音色和情绪，不要夸张，不要忽高忽低。"
PILL = "Day 10 / 30 · 图片转文字"
APP = "day10-image-to-text"
URL_LABEL = "图片转文字"  # no address anywhere in the picture; the URL is only on the end card
CHORDS = ["Cmaj7", "Em7", "Fmaj7", "G"]
END = {
    "kicker": "30 天 30 个一句话工具 · DAY 10",
    "title": "图片转文字",
    "url": "tools.licorne.uk",
    "note": "画面、配音和配乐都是代码生成的",
}
COVER = {
    "title": "图片里的字\n**一键复制**出来",
    "subtitle": "Day 10｜截图直接粘贴，图片不上传",
    "tags": ["图片转文字", "文字识别", "效率工具"],
    "author": "@独角兽在欧洲写代码",
    "template": "暗夜",
}

# ---- demo picture: a made-up notice, rendered by assets/notice.py on first use
NOTICE = Path(__file__).resolve().parents[1] / "assets" / "notice.png"
if not NOTICE.exists():
    subprocess.run([sys.executable, str(NOTICE.with_suffix(".py"))], check=True)

BOXES = 'button[aria-label^="第"][aria-label*="行"]'
RESULT = {}  # what the tool recognised, read from its page

# ---- page modes (CSS inside the tool): framing only, the tool itself is untouched.
APP_CSS = """
html.p textarea{font-size:1.5rem!important;line-height:1.5!important}
html.p ul[aria-label]{display:none}
html.p [data-slot=card-content] > p:last-child{display:none}
html.p main > div.grid > div:first-child > :nth-child(n+2){display:none!important}
html.p [data-slot=card-content] label.flex.items-center{zoom:1.35}
html.p [data-slot=card-content] > div:first-child > div{zoom:1.15}
"""

# ---- overlays drawn on the stage (not in the tool)
CSS = """
#doc{position:absolute;left:260px;top:318px;width:560px;border-radius:18px;overflow:hidden;opacity:0;box-shadow:0 30px 80px rgba(0,0,0,.6);border:2px solid #2a2a2a}
#doc img{display:block;width:100%}
#nosel{position:absolute;left:0;top:0;background:#3a3a3a;color:#d4d4d4;font:600 30px 'Noto Sans SC',sans-serif;border-radius:12px;padding:12px 24px;opacity:0;z-index:6;box-shadow:0 12px 30px rgba(0,0,0,.5)}
#key{position:absolute;left:0;right:0;top:700px;display:flex;justify-content:center;gap:24px;opacity:0;z-index:6}
#key b{min-width:150px;height:150px;padding:0 30px;border-radius:30px;background:#fafafa;color:#0a0a0a;font:800 90px/150px Geist,'Noto Sans SC',sans-serif;text-align:center;box-shadow:0 8px 0 #8a8a8a,0 30px 60px rgba(0,0,0,.6)}
"""


def png_b64():
    return base64.b64encode(NOTICE.read_bytes()).decode()


def paste_picture(c):
    """The tool's own paste handler, fed a clipboard that holds the picture."""
    c.app.evaluate("""b64 => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i)
        const dt = new DataTransfer(); dt.items.add(new File([a], '通知截图.png', { type: 'image/png' }))
        window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt })) }""", png_b64())


def setup(c):
    url = c.image_data_url(NOTICE.read_bytes())
    c.inject(f"""<div id="doc"><img src="{url}"></div><div id="nosel">无法选择图片中的文字</div>
      <div id="key"><b>⌘</b><b>V</b></div>""", CSS)
    c.app.add_style_tag(content=APP_CSS)
    # A headless browser never lets a page write the real clipboard (the document is never "focused").
    # So the page's clipboard.writeText is swapped for a recorder: the tool runs its normal copy path
    # (and shows its "已复制" toast) and we can read back exactly the text it copied.
    c.app.evaluate("() => { navigator.clipboard.writeText = async (t) => { window.__copied = t } }")
    # Warm-up (nothing is filmed yet): recognise once so the language models are in the browser cache,
    # then go back to the empty drop zone. The recognition on camera uses the same real engine.
    paste_picture(c)
    c.app.wait_for_selector(BOXES, timeout=120000)
    c.app.evaluate("() => document.querySelector('button[aria-label=移除]').click()")  # DOM click: nothing is filmed yet
    c.app.wait_for_selector("label:has-text('截完图直接粘贴')")
    c.app.evaluate("() => document.documentElement.classList.add('p')")


# ---- scenes
def stuck(c):
    c.style("win", opacity="0")
    c.style("doc", opacity="1")
    c.shot()
    c.style("cursor", opacity="1")
    # Beat 1.5–5: the pointer drags across the lines as if to select them — nothing is selected.
    doc = c.js("() => { const r = document.getElementById('doc').getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }")
    x0, y0, w, h = doc
    c.cursor_pos = (x0 + w + 40, y0 + h + 40)
    c.cursor_to(x0 + 40, y0 + h * 0.42, 12)
    for beat, (ty, tx) in [(2.0, (0.42, 0.9)), (3.8, (0.62, 0.8)), (5.6, (0.8, 0.5))]:
        c.until(beat)
        c.tick()
        c.pg.mouse.move(c.cursor_pos[0], c.cursor_pos[1])
        c.cursor_press(True)
        c.cursor_to(x0 + w * tx, y0 + h * ty, 10)
        c.cursor_press(False)
        c.cursor_to(x0 + 40, y0 + h * (ty + 0.08), 4)
    # Beat 7.4: the grey hint.
    c.until(7.4)
    c.tick()
    cx, cy = c.cursor_pos
    c.style("nosel", left=f"{x0 + w / 2 - 190}px", top=f"{y0 + h + 28}px")
    for k in range(10):
        t = ease((k + 1) / 10)
        c.style("nosel", opacity=f"{t:.2f}", transform=f"translateY({16 * (1 - t):.1f}px)")
        c.shot()


def paste(c):
    # Beat 0: the picture gives way to the tool (empty drop zone).
    c.tick()
    for k in range(10):
        t = (k + 1) / 10
        c.style("doc", opacity=str(1 - t))
        c.style("nosel", opacity=str(1 - t))
        c.style("cursor", opacity=str(1 - t))
        c.style("win", opacity=str(t))
        c.shot()
    # Beat 1.5: a ⌘ V key hint.
    c.until(1.5)
    c.tick()
    for k in range(8):
        t = ease((k + 1) / 8)
        c.style("key", opacity=f"{t:.2f}", transform=f"translateY({30 * (1 - t):.1f}px) scale({0.9 + 0.1 * t:.3f})")
        c.shot()
    # Beat 3.5: the paste. The tool starts recognising; its own progress shows until the lines appear.
    c.until(3.5)
    c.style("key", opacity="0")
    paste_picture(c)
    c.tick()
    for _ in range(60):
        c.shot(settle=True)
        if c.app.locator(BOXES).count():
            break
    c.pg.wait_for_timeout(300)
    c.shot(settle=True)


def read_lines(c):
    return c.app.evaluate("() => [...document.querySelectorAll('button[aria-label^=\"第\"]')].map(b => b.getAttribute('aria-label'))")


def frames(c):
    # The two-column result view fills the window.
    c.app.evaluate("() => { document.querySelectorAll('button[aria-label^=\"第\"]').forEach(b => b.style.opacity = 0) }")
    c.tick()
    c.pop("document.querySelector('main > div.grid')", 6)
    labels = read_lines(c)
    RESULT["lines"] = [re.sub(r"^第 \d+ 行：", "", s) for s in labels]
    print("recognised lines:", RESULT["lines"])
    n = len(labels)
    # Beats 1.2–3.4: the boxes fade in from top to bottom, two or three frames per line.
    c.until(1.2)
    for i in range(n):
        c.tick() if i % 3 == 0 else None
        for k in range(3):
            c.app.evaluate("([i, t]) => document.querySelectorAll('button[aria-label^=\"第\"]')[i].style.opacity = t", [i, (k + 1) / 3])
            c.shot()
    # Beat 4.2: click the line with the time (the one with most digits); "已复制" pops up.
    pick = c.app.evaluate("""() => { const b = [...document.querySelectorAll('button[aria-label^="第"]')]
        const digits = s => (s.match(/\\d/g) || []).length
        let best = 0; b.forEach((e, i) => { if (digits(e.getAttribute('aria-label')) > digits(b[best].getAttribute('aria-label'))) best = i }); return best }""")
    RESULT["picked"] = RESULT["lines"][pick]
    c.style("cursor", opacity="1")
    c.click(f'button[aria-label^="第 {pick + 1} 行"]', 4.2, frames=12)
    c.pg.wait_for_timeout(150)
    for _ in range(18):
        c.shot(settle=True)
    RESULT["clip"] = c.app.evaluate("() => window.__copied")
    print("copied by the click:", repr(RESULT["clip"]), "| same as the line:", RESULT["clip"] == RESULT["picked"])
    c.until(8)
    c.fade("cursor", 1, 0, 6)


def merge(c):
    c.style("cursor", opacity="1")
    # Beat 2: "合并成段落" on; the text box is laid out again as one paragraph.
    c.click("label:has-text('合并成段落') input", 2, frames=10)
    c.pop("document.querySelector('main > div.grid')", 6)
    for _ in range(4):
        c.shot(settle=True)
    RESULT["merged"] = c.app.get_by_label("识别结果").input_value()
    print("merged text:", RESULT["merged"])
    # Beat 6: copy everything.
    c.click("button:has-text('复制全部')", 6, frames=10)
    for _ in range(14):
        c.shot(settle=True)
    # For the end card: image and text side by side, stage overlays hidden (no frame is taken meanwhile).
    c.js("() => { for (const id of ['layer', 'cursor']) document.getElementById(id).style.display = 'none' }")
    c.app.evaluate("() => { const t = document.querySelector('[role=status]'); if (t) t.remove() }")
    RESULT["png"] = c.pg.screenshot(clip=c.app_box("main > div.grid"))
    c.js("() => { for (const id of ['layer', 'cursor']) document.getElementById(id).style.display = '' }")
    c.until(9.5)
    c.fade("cursor", 1, 0, 6)


def end_card(c):
    c.js("u => document.getElementById('end-img').src = u", c.image_data_url(RESULT["png"]))
    c.js("() => document.getElementById('end-img').decode()")
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("end", opacity=str(min(1, (k + 1) / 8)))
        c.js("s => document.querySelector('#end .img').style.transform = `scale(${s})`", 0.94 + 0.06 * t)
        c.shot()


SCENES = [
    Scene(("01", "图片里的字复制不了？", "只能一个字一个字地敲"),
          "图片里的文字想复制出来，只能一个字一个字地敲，又慢又容易打错。", "", stuck),
    Scene(("02", "截图直接粘贴", "在浏览器里识别"),
          "截完图直接粘贴进来，几秒钟就在浏览器里识别好了，图片不用上传。", "", paste),
    Scene(("03", "每一行都框出来", "点一下复制一行"),
          "每一行文字都会被框出来，点一下就能复制这一行。", "", frames, extra_beats=2),
    Scene(("04", "可以改，一键复制全部", "还能合并成段落"),
          "识别结果可以直接修改，合并成段落后，一键复制全部。", "", merge, extra_beats=2),
    Scene(None, "第十天，图片转文字。免费使用，图片全程不上传。", "", end_card, extra_beats=4),
]
