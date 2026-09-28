"""Day 4 · 九宫格切图. Page actions are written in beats of their own scene."""
from pathlib import Path

from promo.lib.capture import Scene, ease

BPM = 116
PILL = "Day 4 / 30 · 九宫格切图"
APP = "day04-grid-splitter"
URL_LABEL = "licorne26.github.io/30-days-30-tools/day04-grid-splitter"
CHORDS = ["Dm7", "Bbmaj7", "F", "C"]
END = {
    "kicker": "30 天 30 个一句话工具 · DAY 4",
    "title": "九宫格切图",
    "url": "licorne26.github.io/30-days-30-tools",
    "note": "画面、配音和配乐都是代码生成的",
}
COVER = {
    "title": "**九宫格**不用一张张裁了",
    "subtitle": "Day 4｜选好区域，一键切好打包",
    "tags": ["朋友圈", "九宫格", "效率工具"],
    "author": "@独角兽在欧洲写代码",
    "template": "大字报",
}

PHOTO = Path(__file__).resolve().parents[1] / "assets" / "landscape.jpg"
STAGE = "canvas[aria-label]"
GRID = "document.querySelector('canvas[aria-label]').closest('.grid')"  # stage + Moments preview

# ---- overlays drawn on the stage (not in the tool)
CSS = """
#pain{position:absolute;left:60px;top:318px;width:960px;height:900px;border-radius:26px;border:1px solid #262626;background:#111;overflow:hidden;opacity:0}
#pain .t{height:52px;display:flex;align-items:center;gap:10px;padding:0 20px;border-bottom:1px solid #262626;font-size:18px;color:#8a8a8a}
#pain .t i{width:12px;height:12px;border-radius:50%;background:#333;display:block}
#pain .t span{margin-left:14px}
#pain .tools{display:flex;gap:10px;padding:16px 50px}
#pain .tools b{font-size:20px;font-weight:500;color:#a3a3a3;border:1px solid #2a2a2a;border-radius:10px;padding:6px 16px}
#pain .tools b.on{background:#fafafa;color:#0a0a0a;border-color:#fafafa}
#pain .ph{position:relative;margin:4px 50px 0;width:860px;height:538px;background:url(PHOTO) center/cover;border-radius:8px}
#pain .ph::after{content:'';position:absolute;inset:0;background:rgba(0,0,0,.35);border-radius:8px}
#crook{position:absolute;left:330px;top:150px;width:230px;height:214px;border:3px dashed #fafafa;z-index:2;box-shadow:0 0 0 2000px rgba(0,0,0,.28);transform:rotate(-4deg)}
#crook::before,#crook::after{content:'';position:absolute;width:14px;height:14px;background:#fafafa}
#crook::before{left:-9px;top:-9px}#crook::after{right:-9px;bottom:-9px}
#pain .ph .n{position:absolute;right:18px;top:16px;z-index:3;font-size:30px;font-weight:900;background:#ef4444;color:#fff;border-radius:12px;padding:6px 16px}
#pain .strip{display:flex;gap:10px;padding:26px 50px 0;align-items:center}
#pain .strip s{width:74px;height:74px;border-radius:8px;display:block;background:#1c1c1c;border:2px solid #262626;text-decoration:none}
#pain .strip s.done{background-image:url(PHOTO);background-size:420px 262px;border-color:#3a3a3a}
#pain .strip s.now{border:2px dashed #ef4444}
#pain .strip em{font-style:normal;color:#8a8a8a;font-size:22px;margin-left:12px}
#zipdim{position:absolute;left:60px;top:318px;width:960px;height:900px;border-radius:26px;background:rgba(0,0,0,.55);opacity:0}
#zip{position:absolute;left:290px;top:352px;width:500px;border-radius:22px;background:#141414;border:1px solid #2e2e2e;box-shadow:0 40px 90px rgba(0,0,0,.7);opacity:0;padding:10px 0 12px}
#zip .h{display:flex;align-items:center;gap:14px;padding:12px 26px 14px;border-bottom:1px solid #262626;font-size:26px;font-weight:700;font-family:Geist,'Noto Sans SC'}
#zip .h small{margin-left:auto;font-size:20px;color:#8a8a8a;font-weight:500}
#zip .r{display:flex;align-items:center;gap:18px;padding:6px 26px;opacity:0;font-family:Geist}
#zip .r img{width:50px;height:50px;border-radius:6px;display:block}
#zip .r b{font-size:26px;font-weight:600}
#zip .r span{margin-left:auto;font-size:20px;color:#8a8a8a}
"""
# Slightly different crops of the photo for the "already cut, by hand" slots.
DONE = ["-8px -30px", "-92px -26px", "-170px -36px"]


def setup(c):
    photo = c.image_data_url(PHOTO.read_bytes())
    slots = "".join(f'<s class="done" style="background-position:{p}"></s>' for p in DONE)
    slots += '<s class="now"></s>' + "<s></s>" * 5 + "<em>还剩 6 张</em>"
    c.inject(f"""<div id="pain">
      <div class="t"><i></i><i></i><i></i><span>照片 — 编辑</span></div>
      <div class="tools"><b class="on">裁剪</b><b>旋转</b><b>比例：自由</b><b>存储为…</b></div>
      <div class="ph"><div id="crook"></div><div class="n">第 4 / 9 张</div></div>
      <div class="strip">{slots}</div></div>
      <div id="zipdim"></div><div id="zip"></div>""", CSS.replace("PHOTO", photo))
    c.js("u => document.getElementById('fly-img').src = u", photo)


# ---- scenes
def pain(c):
    c.style("win", opacity="0")
    c.style("pain", opacity="1")
    c.shot()
    # Nudging the crop box by hand, and it is still crooked.
    for beat, (x, y, rot) in [(3, (352, 140, 2.5)), (5, (318, 158, -2)), (7, (340, 146, 3.5))]:
        c.until(beat)
        c.tick()
        x0, y0, r0 = c.js("() => { const e = document.getElementById('crook'), s = getComputedStyle(e);"
                          " const m = new DOMMatrix(s.transform);"
                          " return [parseFloat(s.left), parseFloat(s.top), Math.atan2(m.b, m.a) * 180 / Math.PI] }")
        for k in range(6):
            t = ease((k + 1) / 6)
            c.style("crook", left=f"{x0 + (x - x0) * t}px", top=f"{y0 + (y - y0) * t}px",
                    transform=f"rotate({r0 + (rot - r0) * t}deg)")
            c.shot()


def drop_in(c):
    # Beat 0: the editor gives way to the real tool.
    c.tick()
    for k in range(10):
        t = (k + 1) / 10
        c.style("pain", opacity=str(1 - t))
        c.style("win", opacity=str(t))
        c.shot()

    # Beat 2: a thumbnail is dragged in from the corner and dropped on the upload area.
    c.until(2)
    tx, ty = c.center("label")
    sx, sy = 820, 1120
    c.style("cursor", opacity="1")
    for k in range(14):
        t = ease((k + 1) / 14)
        x, y = sx + (tx - sx) * t, sy + (ty - sy) * t
        c.style("fly", left=f"{x - 150}px", top=f"{y - 94}px", opacity=str(min(1, (k + 1) / 4)),
                transform=f"scale({1 - 0.3 * t}) rotate({-6 * (1 - t)}deg)")
        c.style("cursor", left=f"{x + 40}px", top=f"{y + 30}px")
        c.shot()
    c.cursor_pos = (tx + 44, ty + 34)

    # Beat 3: the file lands.
    c.until(3)
    c.app.locator("input[type=file]").set_input_files(str(PHOTO))
    c.app.wait_for_selector(STAGE)
    c.pg.wait_for_timeout(400)
    c.style("fly", opacity="0")
    c.tick()
    c.pop(GRID, 8)

    # Beat 4: drag the picture a little to the left (real pointer events on the stage canvas).
    x, y = c.center(STAGE)
    c.cursor_to(x, y, 5)
    c.until(4)
    c.tick()
    c.pg.mouse.move(x, y)
    c.pg.mouse.down()
    c.cursor_press(True)
    c.cursor_to(x - 120, y, 12, drag=True)
    c.pg.mouse.up()
    c.cursor_press(False)
    c.shot(settle=True)

    # Beat 5: zoom in a little with the wheel, around the cursor.
    c.until(5)
    c.tick()
    for _ in range(12):
        c.pg.mouse.wheel(0, -9)
        c.shot(settle=True)
    c.until(7)
    c.fade("cursor", 1, 0, 6)


def layouts(c):
    c.style("cursor", opacity="1")
    for beat, label in [(2, "九宫格"), (3, "四宫格"), (4, "三连图"), (5, "九宫格")]:
        c.click(f"button:has-text('{label}')", beat, frames=7)
        c.pop(GRID, 6)


def download(c):
    c.app.wait_for_selector("button[aria-label='下载第 1 张']:not([disabled])")  # full-size tiles are ready
    thumbs = c.app.evaluate("""() => [...document.querySelectorAll('img[alt^="第"]')].map(img => {
        const cv = document.createElement('canvas'); cv.width = cv.height = 100
        cv.getContext('2d').drawImage(img, 0, 0, 100, 100); return cv.toDataURL('image/jpeg', .9) })""")
    size = c.app.evaluate("() => document.body.innerText.match(/每格 (\\d+)×/)[1]")
    rows = "".join(f'<div class="r"><img src="{u}"><b>{i + 1:02d}.jpg</b><span>{size} × {size}</span></div>'
                   for i, u in enumerate(thumbs))
    c.js("h => document.getElementById('zip').innerHTML = h",
         f'<div class="h">grid-3x3.zip<small>{len(thumbs)} 张 · 按发布顺序</small></div>{rows}')

    with c.pg.expect_download():
        c.click("button:has-text('打包下载')", 2, frames=10)
        c.shot(settle=True)

    # Beat 3: the archive opens; one file per half beat, 01 to 09.
    c.until(3)
    c.tick()
    for k in range(6):
        t = ease((k + 1) / 6)
        c.style("zipdim", opacity=str(t))
        c.style("zip", opacity=str(t), transform=f"translateY({24 * (1 - t)}px)")
        c.style("cursor", opacity=str(1 - t))
        c.shot()
    for i in range(len(thumbs)):
        c.until(3.5 + i * 0.5)
        c.tick()
        for k in range(4):
            t = ease((k + 1) / 4)
            c.js("([i, t]) => Object.assign(document.querySelectorAll('#zip .r')[i].style,"
                 " {opacity: t, transform: `translateX(${-18 * (1 - t)}px)`})", [i, t])
            c.shot()


def end_card(c):
    # Grab the Moments preview for the card, with stage overlays hidden (no frame is taken meanwhile).
    c.js("() => { for (const id of ['layer', 'cursor']) document.getElementById(id).style.display = 'none' }")
    png = c.pg.screenshot(clip=c.app_box("[class*='rounded-[1.25rem]']"))  # app_box knows the iframe's scale
    c.js("() => { for (const id of ['layer', 'cursor']) document.getElementById(id).style.display = '' }")
    c.js("u => document.getElementById('end-img').src = u", c.image_data_url(png))
    c.pg.wait_for_timeout(100)
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("end", opacity=str(min(1, (k + 1) / 8)))
        c.js("s => document.querySelector('#end .img').style.transform = `scale(${s})`", 0.94 + 0.06 * t)
        c.shot()


SCENES = [
    Scene(("01", "九宫格还在一张张裁？", "裁歪了还得重来"),
          "发朋友圈九宫格，你是不是还在一张一张地裁？", "带点无奈，像在跟朋友吐槽", pain),
    Scene(("02", "拖进来，选好区域", "拖动平移，滚轮缩放"),
          "现在把图拖进来，拖一拖、缩一缩，选好要切的地方就行。", "轻松自然", drop_in),
    Scene(("03", "九宫格、四宫格、三连图", "右边就是发出去的样子"),
          "九宫格、四宫格、三连图，一键切换，右边直接看发出去的效果。", "有节奏感，稍快", layouts),
    Scene(("04", "一键打包下载", "文件名就是发布顺序"),
          "点一下打包下载，文件名就是发布顺序，照着一到九选就行。", "肯定、干脆", download),
    Scene(None, "第四天，九宫格切图。免费，图片不上传，链接在视频最后。", "收尾，友好", end_card, extra_beats=4),
]
