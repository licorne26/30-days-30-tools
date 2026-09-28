"""Day 5 · 图片压缩到指定大小. Page actions are written in beats of their own scene."""
import io
import subprocess
import sys
from pathlib import Path

from PIL import Image

from promo.lib.capture import Scene, ease

BPM = 112
# Every line is read in one take with this style, so the narration stays steady.
STYLE = "用平稳、清晰、语速适中的语气做产品讲解，像一段专业的演示旁白。整段保持同一种音色和情绪，不要夸张，不要忽高忽低。"
PILL = "Day 5 / 30 · 图片压缩到指定大小"
APP = "day05-image-compressor"
URL_LABEL = "licorne26.github.io/30-days-30-tools/day05-image-compressor"
CHORDS = ["Fmaj7", "Em7", "Dm7", "Cmaj7"]
END = {
    "kicker": "30 天 30 个一句话工具 · DAY 5",
    "title": "图片压缩到指定大小",
    "url": "licorne26.github.io/30-days-30-tools",
    "note": "画面、配音和配乐都是代码生成的",
}
COVER = {
    "title": "照片超过**50KB**？\n一键压到刚好",
    "subtitle": "Day 5｜报名照、签证照直接能用",
    "tags": ["报名照片", "图片压缩", "效率工具"],
    "author": "@独角兽在欧洲写代码",
    "template": "暗夜",
}

# ---- demo pictures: drawn by assets/idphoto.py, too big to commit, so made on first use
ASSETS = Path(__file__).resolve().parents[1] / "assets"
PHOTOS = [(ASSETS / f"idphoto_{c}.jpg", f"证件照-{n}.jpg") for c, n in [("blue", "蓝底"), ("white", "白底"), ("red", "红底")]]
if not all(p.exists() for p, _ in PHOTOS):
    subprocess.run([sys.executable, str(ASSETS / "idphoto.py")], check=True)

# The size in scene 1 (caption, card and narration) is the real size of the blue photo.
SIZE_MB = f"{PHOTOS[0][0].stat().st_size / 1e6:.1f}"


def spoken(num: str) -> str:
    """'3.8' -> '三点八', so the TTS reads it the way people say it."""
    return "".join("零一二三四五六七八九"[int(ch)] if ch.isdigit() else "点" for ch in num)


def thumb(path, size, portrait=False):
    """Small JPEG data for the stage overlays (the originals are several MB)."""
    im = Image.open(path)
    if portrait:  # ID-photo crop from the middle of the 4:3 picture
        w, h = im.size
        cw = h * 3 // 4
        im = im.crop(((w - cw) // 2, 0, (w + cw) // 2, h))
    im.thumbnail(size)
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=88)
    return buf.getvalue()


ROOT_JS = "document.querySelector('main > div.space-y-6')"
FRAME = "div:has(> [data-handle])"  # the before/after viewer
ROW1 = f"li button[aria-label='对比 {PHOTOS[0][1]}']"

# ---- page modes (CSS inside the tool): framing only, the tool itself is untouched
APP_CSS = """
html.p-nocmp main > div.space-y-6 > :first-child{display:none!important}
html.p-list main > div.space-y-6 > :not(:last-child){display:none!important}
html.p-list main > div.space-y-6 > :last-child{zoom:2}
html.p-list main > div.space-y-6 > :last-child > :not(:first-child):not(ul){display:none!important}
"""

# ---- overlays drawn on the stage (not in the tool)
CSS = """
#exam{position:absolute;left:60px;top:318px;width:960px;height:900px;border-radius:26px;background:#eef2f6;color:#1f2937;overflow:hidden;opacity:0;font-family:'Noto Sans SC',Geist,sans-serif}
#exam .hd{height:96px;background:#1f4f8f;color:#fff;display:flex;align-items:center;padding:0 44px;font-size:32px;font-weight:700}
#exam .hd small{margin-left:auto;font-size:22px;font-weight:500;opacity:.75}
#exam .st{display:flex;gap:14px;padding:30px 44px 26px;font-size:22px;color:#6b7280;font-weight:500}
#exam .st b{font-weight:500;border-radius:999px;padding:6px 18px;background:#e2e8f0}
#exam .st b.on{background:#1f4f8f;color:#fff}
#exam .box{margin:0 44px;background:#fff;border:1px solid #dbe2ea;border-radius:18px;padding:34px 36px}
#exam .row{display:flex;gap:34px}
#exam .ph{width:222px;height:296px;border-radius:10px;background:url(PHOTO) center/cover;flex-shrink:0;border:1px solid #dbe2ea}
#exam .meta{flex:1;display:flex;flex-direction:column;gap:14px;padding-top:4px}
#exam .fn{font-size:32px;font-weight:700}
#exam .sz{font-size:30px;font-weight:600;color:#374151;font-family:Geist,'Noto Sans SC';display:inline-block;transform-origin:0 50%}
#exam .req{font-size:23px;color:#6b7280;line-height:1.5}
#exam .bar{height:12px;border-radius:6px;background:#e5e7eb;overflow:hidden;margin-top:6px}
#exam .bar i{display:block;height:100%;width:0;background:#3b82f6;border-radius:6px}
#exam .err{margin-top:28px;font-size:30px;font-weight:700;color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 22px;opacity:0}
#exam .btn{margin:30px 44px 0;height:84px;border-radius:14px;background:#cbd5e1;color:#fff;font-size:32px;font-weight:700;display:flex;align-items:center;justify-content:center;letter-spacing:.3em}
.fl{position:absolute;left:0;top:0;width:220px;border-radius:10px;box-shadow:0 30px 60px rgba(0,0,0,.6);border:3px solid #fafafa;opacity:0;z-index:5}
.fl img{width:100%;display:block;border-radius:7px}
#end .img img{height:520px}
#end .cmp{background:#141414;text-align:center;font-family:Geist,'Noto Sans SC';font-size:58px;font-weight:900;padding:18px 0 22px;letter-spacing:-1px}
#end .cmp span{color:#8a8a8a}
#end .cmp b{color:#34d399}
"""
# Where the three thumbnails settle on the upload area: (dx, dy, rotation) from its centre.
PILE = [(-150, 6, -8), (0, -6, 3), (150, 8, 9)]


def setup(c):
    c.inject(f"""<div id="exam">
      <div class="hd">考试报名系统<small>第 2 步 / 共 3 步</small></div>
      <div class="st"><b>① 填写信息</b><b class="on">② 上传照片</b><b>③ 确认提交</b></div>
      <div class="box"><div class="row"><div class="ph"></div><div class="meta">
        <div class="fn">{PHOTOS[0][1]}</div>
        <div><span class="sz" id="exam-sz">{SIZE_MB} MB</span></div>
        <div class="req">要求：JPG 格式，蓝底或白底<br>文件大小不超过 50KB</div>
        <div class="bar"><i id="exam-bar"></i></div>
      </div></div>
      <div class="err" id="exam-err">✕ 照片大小不能超过 50KB，请重新上传</div></div>
      <div class="btn">提交</div></div>"""
             + "".join(f'<div class="fl" id="fl{i}"><img></div>' for i in range(3)),
             CSS.replace("PHOTO", c.image_data_url(thumb(PHOTOS[0][0], (444, 592), portrait=True), "image/jpeg")))
    urls = [c.image_data_url(thumb(p, (440, 330)), "image/jpeg") for p, _ in PHOTOS]
    c.js("us => us.forEach((u, i) => document.querySelector(`#fl${i} img`).src = u)", urls)
    c.app.add_style_tag(content=APP_CSS)
    c.app.evaluate("() => document.documentElement.classList.add('p-nocmp')")
    # Start from another target so picking 50KB in scene 2 is a visible change.
    # (A DOM click: nothing is filmed yet, and the scaled iframe confuses Playwright's hit test.)
    c.app.evaluate("() => [...document.querySelectorAll('button')].find(b => b.textContent === '100KB').click()")


def app_mode(c, add=(), remove=()):
    c.app.evaluate("([a, r]) => { const l = document.documentElement.classList; l.add(...a); l.remove(...r);"
                   " window.scrollTo(0, 0) }", [list(add), list(remove)])


# ---- scenes
def pain(c):
    # Same words as the narration; a no-break space keeps "五十 K" on one line of the subtitle bar.
    c.set_subtitle(SCENES[0].say.replace(" K", "\u00a0K"))
    c.style("win", opacity="0")
    c.style("exam", opacity="1")
    c.shot()
    # Beats 0.5–2.5: the upload bar fills.
    c.until(0.5)
    for k in range(32):
        c.js("w => document.getElementById('exam-bar').style.width = w", f"{ease((k + 1) / 32) * 100:.1f}%")
        c.shot()
    # Beat 3: rejected, and the card shakes.
    c.until(3)
    c.tick()
    c.js("() => { document.getElementById('exam-bar').style.background = '#dc2626'"
         "; document.getElementById('exam-err').style.opacity = 1 }")
    for k in range(14):
        c.style("exam", transform=f"translateX({18 * (1 - k / 14) * (1 if k % 2 else -1):.1f}px)")
        c.shot()
    c.style("exam", transform="none")
    c.shot()
    # Beat 8.5: "…却有三点八兆" — the size turns red.
    c.until(8.5)
    c.tick()
    c.style("exam-sz", color="#dc2626", fontWeight="800")
    for k in range(8):
        c.style("exam-sz", transform=f"scale({1 + 0.18 * (1 - ease((k + 1) / 8)) if k else 1.18})")
        c.shot()


def drop_in(c):
    # Beat 0: the upload page gives way to the real tool.
    c.tick()
    for k in range(10):
        t = (k + 1) / 10
        c.style("exam", opacity=str(1 - t))
        c.style("win", opacity=str(t))
        c.shot()

    # Beats 2, 3, 4: three photos are dragged in one after another and land on the upload area.
    tx, ty = c.center("label")
    c.style("cursor", opacity="1")
    for i, (dx, dy, rot) in enumerate(PILE):
        c.until(1.3 + i)
        sx, sy = 900, 1260
        ex, ey = tx + dx, ty + dy
        for k in range(14):
            t = ease((k + 1) / 14)
            x, y = sx + (ex - sx) * t, sy + (ey - sy) * t
            c.style(f"fl{i}", left=f"{x - 110}px", top=f"{y - 82}px", opacity=str(min(1, (k + 1) / 4)),
                    transform=f"scale({1.15 - 0.15 * t}) rotate({rot * t - 6 * (1 - t)}deg)")
            c.style("cursor", left=f"{x + 60}px", top=f"{y + 40}px")
            c.shot()
        c.tick()
    c.cursor_pos = (tx + 150 + 64, ty + 8 + 44)

    # Beat 4.2: the drop — all three go into the real file input.
    c.until(4.2)
    c.app.locator("input[type=file]").set_input_files(
        [{"name": name, "mimeType": "image/jpeg", "buffer": path.read_bytes()} for path, name in PHOTOS])
    c.app.wait_for_selector("li")
    c.pg.wait_for_timeout(150)
    for i in range(3):
        c.style(f"fl{i}", opacity="0")
    c.tick()
    c.pop(ROOT_JS, 8)

    # Beat 6: pick the 50KB preset ("比如五十 K").
    c.click("button:text-is('50KB')", 6, frames=10)
    c.pop(ROOT_JS, 6)
    for _ in range(12):  # the queue restarts and runs in the worker
        c.shot(settle=True)
    c.until(8.5)
    c.fade("cursor", 1, 0, 6)


def results(c):
    # Nothing is filmed while the worker finishes; the numbers below are the tool's own output.
    c.app.wait_for_function("() => document.querySelectorAll('li').length === 3 &&"
                            " [...document.querySelectorAll('li')].every(li => /达标|压不到/.test(li.innerText))")
    rows = c.app.evaluate("""sizes => [...document.querySelectorAll('li')].map((li, i) => {
        const p = li.querySelector('p.tabular-nums'), size = p.children[0].querySelector('span')
        return { from: sizes[i], text: size.textContent, kb: parseFloat(size.textContent) * (/MB/.test(size.textContent) ? 1e6 : 1e3) }
      })""", [p.stat().st_size for p, _ in PHOTOS])
    print("scene 3 rows:", [(r["from"], r["text"]) for r in rows])
    # Only the result list, zoomed 2×, so the sizes read on a phone. Rows start hidden.
    app_mode(c, add=["p-list"])
    c.app.evaluate("""() => document.querySelectorAll('li').forEach(li => {
        li.style.opacity = 0
        const p = li.querySelector('p.tabular-nums')
        ;[...p.children].slice(1).forEach(s => s.style.opacity = 0)
        p.nextElementSibling.style.opacity = 0 })""")
    c.tick()
    c.pop(ROOT_JS, 6)

    for i, r in enumerate(rows):
        c.until(1.2 + 2 * i)
        c.tick()
        for k in range(6):  # the row slides in
            t = ease((k + 1) / 6)
            c.app.evaluate("([i, t]) => Object.assign(document.querySelectorAll('li')[i].style,"
                           " {opacity: t, transform: `translateY(${10 * (1 - t)}px)`})", [i, t])
            c.shot()
        for k in range(18):  # the new size counts down from the original size (log scale)
            t = ease((k + 1) / 18)
            val = r["from"] * (r["kb"] / r["from"]) ** t
            c.app.evaluate("""([i, v, last, text]) => {
                const fmt = b => b < 1e6 ? `${(b / 1e3).toFixed(b < 1e4 ? 1 : 0)} KB` : `${(b / 1e6).toFixed(2)} MB`
                document.querySelectorAll('li')[i].querySelector('p.tabular-nums').children[0]
                  .querySelector('span').textContent = last ? text : fmt(v) }""", [i, val, k == 17, r["text"]])
            c.shot()
        c.tick()
        for k in range(6):  # ratio, resolution and the green badge light up
            t = ease((k + 1) / 6)
            c.app.evaluate("""([i, t]) => { const li = document.querySelectorAll('li')[i], p = li.querySelector('p.tabular-nums')
                ;[...p.children].slice(1).forEach(s => s.style.opacity = t)
                Object.assign(p.nextElementSibling.style, {opacity: t, transform: `scale(${0.9 + 0.1 * t})`, transformOrigin: '0 50%'}) }""",
                           [i, t])
            c.shot()


END_IMG = {}


def compare(c):
    # Beat 1.5: open the first photo; the viewer above the list shows it.
    c.style("cursor", opacity="1")
    c.click(ROW1, 1.5, frames=8)
    c.app.evaluate("() => document.querySelectorAll('li, li *').forEach(e => { e.style.opacity = ''; e.style.transform = '' })")
    app_mode(c, remove=["p-list", "p-nocmp"])
    c.tick()
    c.pop(f"document.querySelector('{FRAME}')", 8)

    # Beats 2.5–5.4: drag the divider to the left, all the way right, then back to the middle.
    box = c.app_box(FRAME)
    hx, hy = c.center("[data-handle]")
    hy += 120  # grab the line below the knob
    c.cursor_to(hx, hy, 6)
    c.until(2.5)
    c.pg.mouse.move(hx, hy)
    c.pg.mouse.down()
    c.cursor_press(True)
    c.tick()
    c.cursor_to(box["x"] + box["width"] * 0.08, hy, 12, drag=True)
    c.cursor_to(box["x"] + box["width"] * 0.92, hy, 26, drag=True)
    c.cursor_to(box["x"] + box["width"] * 0.5, hy, 14, drag=True)
    c.pg.mouse.up()
    c.cursor_press(False)
    c.tick()
    c.shot(settle=True)

    # For the end card: the viewer at the middle, with stage overlays hidden (no frame is taken meanwhile).
    c.js("() => { for (const id of ['layer', 'cursor']) document.getElementById(id).style.display = 'none' }")
    END_IMG["png"] = c.pg.screenshot(clip=c.app_box(FRAME))
    c.js("() => { for (const id of ['layer', 'cursor']) document.getElementById(id).style.display = '' }")
    END_IMG["after"] = c.app.evaluate(f"() => document.querySelector('li p.tabular-nums').children[0].querySelector('span').textContent")

    # Beat 6.5: 100% ("放大看").
    c.click("button:has-text('100% 看细节')", 6.5, frames=10)
    c.pop(f"document.querySelector('{FRAME}')", 6)

    # Beat 8.5: scroll down to the download button.
    c.until(8.5)
    y0 = c.app.evaluate("() => scrollY")
    y1 = c.app.evaluate("() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('全部下载'))"
                        "; return scrollY + b.getBoundingClientRect().top - 520 }")
    for k in range(12):
        c.app.evaluate("y => window.scrollTo(0, y)", y0 + (y1 - y0) * ease((k + 1) / 12))
        c.shot(settle=True)

    # Beat 10: download everything as compressed.zip ("一键打包下载").
    with c.pg.expect_download() as dl:
        c.click("button:has-text('全部下载')", 10, frames=10)
    print("scene 4 download:", dl.value.suggested_filename)
    c.until(12)
    c.fade("cursor", 1, 0, 6)


def end_card(c):
    c.js("u => document.getElementById('end-img').src = u", c.image_data_url(END_IMG["png"]))
    c.js("h => document.querySelector('#end .img').insertAdjacentHTML('beforeend', h)",
         f'<div class="cmp"><span>{SIZE_MB} MB</span> → <b>{END_IMG["after"]}</b></div>')
    c.pg.wait_for_timeout(100)
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("end", opacity=str(min(1, (k + 1) / 8)))
        c.js("s => document.querySelector('#end .img').style.transform = `scale(${s})`", 0.94 + 0.06 * t)
        c.shot()


SCENES = [
    Scene(("01", "照片又超大小了？", "报名系统只收 50KB 以内"),
          f"报名上传照片，系统提示不能超过五十 K，你的照片却有{spoken(SIZE_MB)}兆。", "", pain),
    Scene(("02", "拖进来，选好目标大小", "一次可以放好几张"),
          "把照片拖进来，选好目标大小，比如五十 K，一次可以放好几张。", "", drop_in),
    Scene(("03", "自动压到刚好不超标", "画质尽量保留"),
          "它会自动找到最高的画质，把每一张都压到刚好不超标。", "", results, extra_beats=2),
    Scene(("04", "前后对比，放大看细节", "看不出差别再下载"),
          "拖动中间这条线对比一下，放大看也看不出差别，然后一键打包下载。", "", compare, extra_beats=3),
    Scene(None, "第五天，图片压缩到指定大小。免费使用，图片全程不上传。", "", end_card, extra_beats=4),
]
