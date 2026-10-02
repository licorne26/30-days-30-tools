"""Day 8 · 证件照加水印. Page actions are written in beats of their own scene."""
import io
import subprocess
import sys
from pathlib import Path

from PIL import Image

from promo.lib.capture import Scene, ease

BPM = 104
# Every line is read in one take with this style, so the narration stays steady.
STYLE = "用平稳、清晰、语速适中的语气做产品讲解，像一段专业的演示旁白。整段保持同一种音色和情绪，不要夸张，不要忽高忽低。"
PILL = "Day 8 / 30 · 证件照加水印"
APP = "day08-id-watermark"
URL_LABEL = "证件照加水印"  # no address anywhere in the picture; the URL is only on the end card
CHORDS = ["Dm7", "G7", "Cmaj7", "Am7"]
END = {
    "kicker": "30 天 30 个一句话工具 · DAY 8",
    "title": "证件照加水印",
    "url": "tools.licorne.uk",
    "note": "画面、配音和配乐都是代码生成的",
}
COVER = {
    "title": "证件照发出去\n先加**水印**",
    "subtitle": "Day 8｜仅供租房使用，他用无效",
    "tags": ["证件照", "水印", "隐私保护"],
    "author": "@独角兽在欧洲写代码",
    "template": "大字报",
}

# ---- demo picture: an obviously fake sample card, drawn by assets/idcard.py on first use
CARD = Path(__file__).resolve().parents[1] / "assets" / "idcard.jpg"
if not CARD.exists():
    subprocess.run([sys.executable, str(CARD.with_suffix(".py"))], check=True)

PREVIEW = 'canvas[aria-label="加水印后的预览"]'
GRID = "document.querySelector('main > div.grid')"
BOX = "document.querySelector('div:has(> canvas[aria-label])')"

# ---- page modes (CSS inside the tool): framing only, the tool itself is untouched.
# The preview is capped at 380 css px high, so the watermark text is ~29 px in the video.
APP_CSS = """
html.p main > div.grid{grid-template-columns:minmax(0,1fr)!important;gap:14px!important}
html.p [data-slot=card]{zoom:1.35}
html.p div:has(> canvas[aria-label]){max-height:380px!important}
html.p canvas[aria-label]{max-height:362px!important}
html.p main > div.grid > div:last-child > :nth-child(n+4){display:none!important}
/* pick a purpose: just that block, card first */
html.p-pick [data-slot=card-content] > :not(:nth-child(3)){display:none!important}
html.p-pick [data-slot=card-content] > :nth-child(3) > :nth-child(n+3){display:none!important}
/* look controls: preview on top, colours and the first two slider rows below */
html.p-ctl main > div.grid > div:last-child{order:-1}
html.p-ctl [data-slot=card-content] > :not(:nth-child(5)){display:none!important}
html.p-ctl [data-slot=card-content] > :nth-child(5) > :nth-child(1),
html.p-ctl [data-slot=card-content] > :nth-child(5) > :nth-child(4){display:none!important}
html.p-ctl main > div.grid > div:last-child > :nth-child(n+2){display:none!important}
/* anti-removal: that switch on top, then preview + zoom + export */
html.p-exp [data-slot=card-content] > :not(:nth-child(5)){display:none!important}
html.p-exp [data-slot=card-content] > :nth-child(5) > :nth-child(-n+3){display:none!important}
"""

# ---- overlays drawn on the stage (not in the tool)
CSS = """
#chat{position:absolute;left:60px;top:318px;width:960px;height:900px;border-radius:26px;background:#eceff5;color:#1d2433;overflow:hidden;opacity:0;font-family:'Noto Sans SC',Geist,sans-serif}
#chat .hd{height:92px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;border-bottom:1px solid #d9dde6;background:#f7f8fb}
#chat .m{display:flex;gap:18px;padding:0 36px;margin-top:40px;opacity:0;align-items:flex-end}
#chat .m.r{flex-direction:row-reverse}
#chat .av{width:76px;height:76px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font-size:32px;font-weight:700;color:#fff;background:#94a3b8}
#chat .m.r .av{background:#2bb3a3}
#chat .b{max-width:640px;background:#fff;border:1px solid #e0e4ec;border-radius:22px 22px 22px 8px;padding:20px 28px;font-size:38px;line-height:1.45;font-weight:500}
#chat .pic{width:560px;border-radius:22px 22px 8px 22px;overflow:hidden;border:4px solid #4f6ef7;background:#fff}
#chat .pic img{display:block;width:100%}
#ask{position:absolute;left:60px;right:60px;top:372px;text-align:center;opacity:0}
#ask b{display:block;font:900 150px/1 Geist,'Noto Sans SC',sans-serif;color:#ef4444;text-shadow:0 8px 30px rgba(239,68,68,.45)}
#ask span{display:inline-block;margin-top:10px;background:rgba(10,10,10,.82);color:#fafafa;font:700 38px 'Noto Sans SC',sans-serif;border-radius:14px;padding:10px 26px}
.fl{position:absolute;left:0;top:0;width:300px;border-radius:12px;box-shadow:0 30px 60px rgba(0,0,0,.6);border:3px solid #fafafa;opacity:0;z-index:5}
.fl img{width:100%;display:block;border-radius:9px}
#end .img{border-radius:20px}
#end .img img{height:auto;width:760px;max-width:none}
"""


def setup(c):
    url = c.image_data_url(_jpeg(CARD, 800), "image/jpeg")
    c.inject(f"""<div id="chat"><div class="hd">房屋中介</div>
      <div class="m" id="m0"><div class="av">中</div><div class="b">麻烦发一下证件照片</div></div>
      <div class="m r" id="m1"><div class="av">我</div><div class="pic"><img src="{url}"></div></div>
      <div id="ask"><b>?</b><span>它还会被用在哪里？</span></div></div>
      <div class="fl" id="fl"><img src="{url}"></div>""", CSS)
    c.app.add_style_tag(content=APP_CSS)
    # Start on another purpose, so picking 租房 in scene 2 is a visible change (nothing is filmed yet).
    c.app.evaluate("() => document.documentElement.classList.add('p', 'p-pick')")


def _jpeg(path, width):
    im = Image.open(path)
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def bubble(c, i, frames=7):
    for k in range(frames):
        t = ease((k + 1) / frames)
        c.style(f"m{i}", opacity=str(t), transform=f"translateY({26 * (1 - t):.1f}px)")
        c.shot()


# ---- scenes
def worry(c):
    c.style("win", opacity="0")
    c.style("chat", opacity="1")
    c.shot()
    c.until(0.8)
    c.tick()
    bubble(c, 0)
    c.until(2.4)
    c.tick()
    bubble(c, 1)
    # Beat 4.2: a red question mark floats up over the picture.
    c.until(4.2)
    c.tick()
    for k in range(16):
        t = ease((k + 1) / 16)
        c.style("ask", opacity=f"{t:.2f}", transform=f"translateY({40 * (1 - t):.1f}px)")
        c.shot()


def pick(c):
    # Beat 0: the chat gives way to the tool (empty drop zone).
    c.tick()
    for k in range(10):
        t = (k + 1) / 10
        c.style("chat", opacity=str(1 - t))
        c.style("win", opacity=str(t))
        c.shot()
    # Beats 1.2–3.2: the sample card flies into the drop zone.
    tx, ty = c.center("label")
    c.style("cursor", opacity="1")
    c.until(1.2)
    sx, sy = 880, 1180
    for k in range(14):
        t = ease((k + 1) / 14)
        x, y = sx + (tx - sx) * t, sy + (ty - sy) * t
        c.style("fl", left=f"{x - 150:.1f}px", top=f"{y - 94:.1f}px", opacity=str(min(1, (k + 1) / 4)),
                transform=f"scale({1 - 0.35 * t:.3f}) rotate({-6 * (1 - t):.2f}deg)")
        c.style("cursor", left=f"{x + 60:.1f}px", top=f"{y + 40:.1f}px")
        c.shot()
    c.cursor_pos = (tx + 64, ty + 44)
    # Beat 3.4: the drop. The tool opens its editing layout; start on 办理入职.
    c.until(3.4)
    c.app.locator("input[type=file]").set_input_files(str(CARD))
    c.app.wait_for_selector(PREVIEW)
    c.app.evaluate("() => [...document.querySelectorAll('button')].find(b => b.textContent === '办理入职').click()")
    c.pg.wait_for_timeout(500)
    c.style("fl", opacity="0")
    c.tick()
    c.pop(GRID, 8)
    # Beat 6: pick 租房; the watermark text and the preview change.
    c.click("button:text-is('租房')", 6, frames=10)
    c.pop(BOX, 7)
    for _ in range(4):
        c.shot(settle=True)
    c.until(9.5)
    c.fade("cursor", 1, 0, 6)


def slide(c, label, target, beat):
    """Drag a slider's thumb with the real mouse to `target`; the drawn cursor follows."""
    sel = f"input[aria-label='{label}']"
    lo, hi, val = c.app.locator(sel).evaluate("e => [+e.min, +e.max, +e.value]")
    b = c.app_box(sel)
    thumb = 16 * c.scale * 1.35  # the card is zoomed 1.35 inside the page
    pos = lambda v: b["x"] + thumb / 2 + (v - lo) / (hi - lo) * (b["width"] - thumb)
    y = b["y"] + b["height"] / 2
    c.cursor_to(pos(val), y, 6)
    c.until(beat)
    c.pg.mouse.move(pos(val), y)
    c.pg.mouse.down()
    c.cursor_press(True)
    c.tick()
    c.cursor_to(pos(target), y, 10, drag=True)
    c.pg.mouse.up()
    c.cursor_press(False)
    c.shot(settle=True)
    c.pop(BOX, 5)


def tune(c):
    c.app.evaluate("() => { const l = document.documentElement.classList; l.remove('p-pick'); l.add('p-ctl') }")
    c.tick()
    c.pop(GRID, 6)
    c.style("cursor", opacity="1")
    c.click("button[aria-label='颜色 红']", 1.5, frames=8)
    c.pop(BOX, 6)
    slide(c, "透明度", 0.5, 3)
    slide(c, "密度", 2.0, 5)
    slide(c, "角度", -20, 7)
    c.until(9.5)
    c.fade("cursor", 1, 0, 6)


EXPORT = {}


def protect(c):
    c.app.evaluate("() => { const l = document.documentElement.classList; l.remove('p-ctl'); l.add('p-exp') }")
    c.tick()
    c.pop(GRID, 6)
    c.style("cursor", opacity="1")
    # Beat 1.5: anti-removal on.
    c.click("input[type=checkbox] >> nth=-1", 1.5, frames=8)
    c.pop(BOX, 6)
    # Beat 3.5: 100% — the jittered texts and the thin wave lines show.
    c.click("button:has-text('放大 100%')", 3.5, frames=8)
    c.pop(BOX, 5)
    for k in range(10):  # a slow drift down the top-left, where the sample label is
        c.app.evaluate("t => { const b = document.querySelector('div:has(> canvas[aria-label])'); b.scrollLeft = 0; b.scrollTop = 150 * t }", ease((k + 1) / 10))
        c.shot(settle=True)
    # Beat 9: export. The file the tool produced goes on the end card.
    with c.pg.expect_download() as dl:
        c.click("button.flex-1", 9, frames=10)
    out = c.dir.parent / "watermarked.jpg"
    dl.value.save_as(out)
    EXPORT["jpg"] = out
    print("scene 4 download:", dl.value.suggested_filename, "->", out, Image.open(out).size)
    c.until(12)
    c.fade("cursor", 1, 0, 6)


def end_card(c):
    im = Image.open(EXPORT["jpg"]).convert("RGB")
    im = im.resize((760, round(im.height * 760 / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=92)
    c.js("u => document.getElementById('end-img').src = u", c.image_data_url(buf.getvalue(), "image/jpeg"))
    c.js("() => document.getElementById('end-img').decode()")
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("end", opacity=str(min(1, (k + 1) / 8)))
        c.js("s => document.querySelector('#end .img').style.transform = `scale(${s})`", 0.94 + 0.06 * t)
        c.shot()


SCENES = [
    Scene(("01", "证件照直接发出去？", "被挪作他用就说不清了"),
          "证件照片发给别人，万一被拿去办别的事，就说不清了。", "", worry),
    Scene(("02", "拖进来，选好用途", "水印马上铺满"),
          "把照片拖进来，选好用途，比如租房，水印马上铺满整张图。", "", pick),
    Scene(("03", "颜色、透明度、密度、角度", "证件看得清，水印盖得住"),
          "颜色、透明度、密度和角度都能调，既看得清证件，又盖得住。", "", tune),
    Scene(("04", "防去除，一键导出", "水印随机错开，难以抹掉"),
          "打开防去除，每个水印都会轻微错开，很难被修图抹掉。最后一键导出。", "", protect),
    Scene(None, "第八天，证件照加水印。免费使用，证件照片全程不上传。", "", end_card, extra_beats=4),
]
