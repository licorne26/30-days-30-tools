"""Day 7 · 长截图拼接. Page actions are written in beats of their own scene."""
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

from promo.lib.capture import Scene, ease, ease_io

BPM = 108
# Every line is read in one take with this style, so the narration stays steady.
STYLE = "用平稳、清晰、语速适中的语气做产品讲解，像一段专业的演示旁白。整段保持同一种音色和情绪，不要夸张，不要忽高忽低。"
PILL = "Day 7 / 30 · 长截图拼接"
APP = "day07-screenshot-stitcher"
URL_LABEL = "长截图拼接"  # no address anywhere in the picture; the URL is only on the end card
CHORDS = ["Am7", "Dm7", "G", "Cmaj7"]
END = {
    "kicker": "30 天 30 个一句话工具 · DAY 7",
    "title": "长截图拼接",
    "url": "tools.licorne.uk",
    "note": "画面、配音和配乐都是代码生成的",
}
COVER = {
    "title": "聊天记录\n**一张长图**发完",
    "subtitle": "Day 7｜自动去重拼接，还能打码",
    "tags": ["长截图", "聊天记录", "效率工具"],
    "author": "@独角兽在欧洲写代码",
    "template": "撞色",
}

# ---- demo screenshots: a made-up chat rendered by assets/chat.py on first use
ASSETS = Path(__file__).resolve().parents[1] / "assets"
SHOTS = [ASSETS / f"chat_{i}.png" for i in range(1, 7)]
if not all(p.exists() for p in [*SHOTS, ASSETS / "chat_meta.json"]):
    subprocess.run([sys.executable, str(ASSETS / "chat.py")], check=True)
META = json.loads((ASSETS / "chat_meta.json").read_text())  # name / avatar boxes in long-image pixels


def png_url(c, im):
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return c.image_data_url(buf.getvalue())


CANVAS = 'canvas[aria-label="拼好的长图"]'
BOX_JS = "document.querySelector('div.overscroll-contain')"  # the preview's scroll box
SEAMS_JS = "[...document.querySelectorAll('div.pointer-events-none.absolute.inset-x-0')]"

# ---- page modes (CSS inside the tool): framing only, the tool itself is untouched.
# p-pv: just the preview, full width, so chat text is ~37 px in the video; seam labels zoomed 2.2× (~29 px).
# p-mo: the mosaic and export buttons (zoomed 1.7×) above a shorter preview.
APP_CSS = """
html.p-pv main > div.grid, html.p-mo main > div.grid{grid-template-columns:1fr!important}
html.p-pv main > div.grid > [data-slot=card]{display:none!important}
html.p-pv main > div.grid > div:last-child > :not(:first-child),
html.p-mo main > div.grid > div:last-child > :not(:first-child){display:none!important}
html.p-pv div.overscroll-contain{height:640px!important}
html.p-mo div.overscroll-contain{height:420px!important}
html div.overscroll-contain button.rounded-full{zoom:2.2}
html.p-hide div.pointer-events-none.absolute.inset-x-0{opacity:0}
html.p-mo [data-slot=card]{zoom:1.7}
html.p-mo [data-slot=card-content] > :nth-child(1),
html.p-mo [data-slot=card-content] > :nth-child(2),
html.p-mo [data-slot=card-content] > :nth-child(4),
html.p-mo [data-slot=card-content] > :nth-child(3) > :not(:last-child),
html.p-mo [data-slot=card-content] > :nth-child(3) > :last-child > :nth-child(n+3),
html.p-mo [data-slot=card-content] > :nth-child(5) > :not(:nth-child(2)){display:none!important}
"""

# ---- overlays drawn on the stage (not in the tool)
CSS = """
#pile{position:absolute;inset:0;pointer-events:none}
.card{position:absolute;left:0;top:0;width:290px;border-radius:18px;overflow:hidden;opacity:0;
  box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 0 3px #fafafa;transform-origin:50% 50%}
.card img{display:block;width:100%}
.card b{position:absolute;left:12px;top:78px;background:#0a0a0a;color:#fafafa;font:700 26px Geist,sans-serif;border-radius:10px;padding:2px 12px}
#count{position:absolute;left:820px;top:350px;background:#ef4444;color:#fff;font:900 40px 'Noto Sans SC',Geist,sans-serif;border-radius:999px;padding:8px 26px;opacity:0;z-index:3;box-shadow:0 10px 30px rgba(239,68,68,.35)}
#end .img{position:relative;width:460px;height:600px}
#end .img img{width:100%;height:auto;max-width:none}
#end .img::after{content:'';position:absolute;left:0;right:0;bottom:0;height:240px;background:linear-gradient(rgba(10,10,10,0),#0a0a0a)}
"""
CW, CH = 290, 290 * 1688 // 780  # card size on the stage
# Where each card settles in the pile: centre (x, y) and rotation.
PILE = [(330, 760, -10), (430, 790, -4), (540, 760, 3), (640, 795, 8), (745, 770, 12), (560, 805, -2)]


def setup(c):
    cards = "".join(f'<div class="card" id="cd{i}"><img><b>{i + 1}</b></div>' for i in range(6))
    c.inject(f'<div id="pile">{cards}<div id="count">6 张</div></div>', CSS)
    urls = [png_url(c, Image.open(p).resize((CW * 2, CH * 2), Image.LANCZOS)) for p in SHOTS]
    c.js("us => us.forEach((u, i) => document.querySelector(`#cd${i} img`).src = u)", urls)
    c.app.add_style_tag(content=APP_CSS)
    c.app.evaluate("() => document.documentElement.classList.add('p-pv', 'p-hide')")


def place(c, i, x, y, rot, scale=1.0, opacity=1.0):
    c.style(f"cd{i}", left=f"{x - CW / 2:.1f}px", top=f"{y - CH / 2:.1f}px", opacity=f"{opacity:.3f}",
            transform=f"rotate({rot:.2f}deg) scale({scale:.3f})")


def card_state(c, i):
    return c.js("""i => { const e = document.getElementById('cd' + i), s = getComputedStyle(e), m = new DOMMatrix(s.transform)
        return [parseFloat(s.left) + e.offsetWidth / 2, parseFloat(s.top) + e.offsetHeight / 2,
                Math.atan2(m.b, m.a) * 180 / Math.PI, Math.hypot(m.a, m.b), parseFloat(s.opacity)] }""", i)


# ---- scenes
def pile(c):
    c.style("win", opacity="0")
    c.shot()
    # Beats 1–3.5: six screenshots are dealt one after another onto a messy pile.
    for i, (x, y, rot) in enumerate(PILE):
        c.until(1 + i * 0.5)
        c.tick()
        for k in range(8):
            t = ease((k + 1) / 8)
            place(c, i, 540 + (x - 540) * t, 1750 + (y - 1750) * t, -24 + (rot + 24) * t, opacity=min(1, (k + 1) / 3))
            c.shot()
    # The last one lands: the pile wobbles and the count pops up.
    c.until(4.2)
    c.tick()
    for k in range(12):
        dx = 14 * (1 - k / 12) * (1 if k % 2 else -1)
        c.style("pile", transform=f"translateX({dx:.1f}px) rotate({dx / 20:.2f}deg)")
        if k < 8:
            t = ease((k + 1) / 8)
            c.style("count", opacity=f"{t:.2f}", transform=f"scale({0.6 + 0.4 * t:.3f})")
        c.shot()
    c.style("pile", transform="none")
    c.shot()
    # Beat 7.5: "顺序还容易乱" — two cards swap places.
    c.until(7.5)
    c.tick()
    a, b = 1, 4
    (ax, ay, ar), (bx, by, br) = PILE[a][:3], PILE[b][:3]
    for k in range(14):
        t = ease((k + 1) / 14)
        lift = 60 * (1 - abs(2 * t - 1))
        place(c, a, ax + (bx - ax) * t, ay + (by - ay) * t - lift, ar + (br - ar) * t)
        place(c, b, bx + (ax - bx) * t, by + (ay - by) * t + lift / 2, br + (ar - br) * t)
        if k == 7:
            c.style(f"cd{a}", zIndex="2")
        c.shot()


def drop_in(c):
    # Beat 0: the tool appears; the pile gathers into a small stack at the bottom right.
    c.tick()
    start = [card_state(c, i) for i in range(6)]
    for k in range(10):
        t = ease((k + 1) / 10)
        c.style("win", opacity=f"{(k + 1) / 10:.2f}")
        c.style("count", opacity=f"{1 - t:.2f}")
        for i, (x, y, rot, sc, _) in enumerate(start):
            place(c, i, x + (900 - x) * t, y + (1080 - i * 6 - y) * t, rot + (-6 + i * 2.5 - rot) * t, sc + (0.42 - sc) * t)
        c.shot()

    # Beats 1.5–4: they go into the upload area one by one.
    tx, ty = c.center("label")
    c.style("cursor", opacity="1")
    for n, i in enumerate(range(5, -1, -1)):  # top of the stack first
        c.until(1.5 + n * 0.5)
        x0, y0, r0, s0, _ = card_state(c, i)
        for k in range(8):
            t = ease((k + 1) / 8)
            x, y = x0 + (tx - x0) * t, y0 + (ty - y0) * t
            place(c, i, x, y, r0 * (1 - t), s0 + (0.3 - s0) * t, opacity=1 if k < 6 else (8 - k - 1) / 2)
            c.style("cursor", left=f"{x + 40:.1f}px", top=f"{y + 30:.1f}px")
            c.shot()
        c.tick()
    c.cursor_pos = (tx + 44, ty + 34)

    # Beat 4.6: the real drop — the six files go into the tool, which aligns them in its worker.
    c.until(4.6)
    c.app.locator("input[type=file]").set_input_files(
        [{"name": f"聊天截图 {i + 1}.png", "mimeType": "image/png", "buffer": p.read_bytes()} for i, p in enumerate(SHOTS)])
    c.app.wait_for_function(f"() => {SEAMS_JS}.length === 5")
    c.pg.wait_for_timeout(200)
    labels = c.app.evaluate(f"() => {SEAMS_JS}.map(s => s.innerText)")
    print("scene 2 seams:", labels)
    c.tick()
    c.fade("cursor", 1, 0, 4)
    c.pop(BOX_JS, 8)

    # Beats 5.5–9.5: glide to each seam and light its label (numbers are the tool's own output).
    for i in range(5):
        c.until(5.5 + i)
        y0 = c.app.evaluate(f"() => {BOX_JS}.scrollTop")
        y1 = c.app.evaluate(f"i => {{ const b = {BOX_JS}, sm = {SEAMS_JS}[i]; return sm.offsetTop - b.clientHeight / 2 }}", i)
        for k in range(8):
            c.app.evaluate(f"y => {BOX_JS}.scrollTop = y", y0 + (y1 - y0) * ease_io((k + 1) / 8))
            c.shot(settle=True)
        c.tick()
        for k in range(6):
            t = ease((k + 1) / 6)
            c.app.evaluate(f"([i, t]) => Object.assign({SEAMS_JS}[i].style, {{opacity: t, transform: `scale(${{0.94 + 0.06 * t}})`, transformOrigin: '100% 0'}})", [i, t])
            c.shot()


def scroll_through(c):
    # Beat 0.6: back to the top, guide lines off (the tool's own button; its panel is outside this framing).
    c.app.evaluate(f"() => {BOX_JS}.scrollTop = 0")
    c.app.evaluate("() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('隐藏辅助线')).click()")
    c.tick()
    c.shot(settle=True)
    # Beats 1.5–15.5: one slow pass from the title bar down to the input bar.
    c.until(1.5)
    top = c.app.evaluate(f"() => {BOX_JS}.scrollHeight - {BOX_JS}.clientHeight")
    frames = round(14 * 60 / BPM * 30)
    for k in range(frames):
        c.app.evaluate(f"y => {BOX_JS}.scrollTop = y", top * ease_io((k + 1) / frames))
        c.shot(settle=True)


EXPORT = {}


def mosaic(c):
    # The mosaic and export buttons above a shorter preview, scrolled back to the top.
    c.app.evaluate(f"() => {{ const l = document.documentElement.classList; l.remove('p-pv'); l.add('p-mo'); {BOX_JS}.scrollTop = 0 }}")
    c.tick()
    c.pop(BOX_JS, 6)
    c.style("cursor", opacity="1")
    c.click("button:has-text('打码模式')", 2, frames=10)

    def drag(box, beat, pad=12):
        cb = c.app_box(CANVAS)
        k = cb["width"] / META["width"]
        x, y, w, h = box
        x0, y0 = cb["x"] + (x - pad) * k, cb["y"] + (y - pad) * k
        x1, y1 = cb["x"] + (x + w + pad) * k, cb["y"] + (y + h + pad) * k
        c.cursor_to(x0, y0, 8)
        c.until(beat)
        c.pg.mouse.move(x0, y0)
        c.pg.mouse.down()
        c.cursor_press(True)
        c.tick()
        c.cursor_to(x1, y1, 12, drag=True)
        c.pg.mouse.up()
        c.cursor_press(False)
        c.tick()
        c.shot(settle=True)

    drag(META["avatar"], 3.5)  # 小林's avatar on the first message
    drag(META["name"], 5.5)  # the name in the title bar

    # Beat 8.5: "然后一键导出".
    with c.pg.expect_download() as dl:
        c.click("button:has-text('导出')", 8.5, frames=10)
    out = c.dir.parent / "long-screenshot.png"
    dl.value.save_as(out)
    EXPORT["png"] = out
    print("scene 4 download:", dl.value.suggested_filename, "->", out, Image.open(out).size)
    c.until(10)
    c.fade("cursor", 1, 0, 6)


def end_card(c):
    # The exported long image, scaled down and standing up; only its top part shows, fading out.
    im = Image.open(EXPORT["png"])
    top = im.crop((0, 0, im.width, round(im.width * 600 / 460))).resize((920, 1200), Image.LANCZOS)  # 2× the 460×600 box
    c.js("u => document.getElementById('end-img').src = u", png_url(c, top))
    c.js("() => document.getElementById('end-img').decode()")
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("end", opacity=str(min(1, (k + 1) / 8)))
        c.js("s => document.querySelector('#end .img').style.transform = `scale(${s})`", 0.94 + 0.06 * t)
        c.shot()


SCENES = [
    Scene(("01", "截了好几张？", "对方还得一张张翻"),
          "聊天记录截了好几张，发给别人还得一张一张翻，顺序还容易乱。", "", pile),
    Scene(("02", "一起拖进来", "自动找重叠、去重复"),
          "把截图一起拖进来，它会自动找到重叠的部分，去掉重复的内容。", "", drop_in, extra_beats=2),
    Scene(("03", "一张长图，看不出接缝", "顶栏和底栏只留一份"),
          "拼好的长图从头到尾一气呵成，看不出接缝，标题栏和输入栏也只留一份。", "", scroll_through, extra_beats=4),
    Scene(("04", "框一下就打码", "名字头像不露出来"),
          "名字和头像不想露出来？框一下就打上马赛克，然后一键导出。", "", mosaic, extra_beats=2),
    Scene(None, "第七天，长截图拼接。免费使用，截图全程不上传。", "", end_card, extra_beats=4),
]
