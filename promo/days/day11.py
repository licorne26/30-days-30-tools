"""Day 11 · 证件复印件排版. Page actions are written in beats of their own scene."""
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

from promo.lib.capture import Scene, ease

BPM = 106
# Every line is read in one take with this style, so the narration stays steady.
STYLE = "用平稳、清晰、语速适中的语气做产品讲解，像一段专业的演示旁白。整段保持同一种音色和情绪，不要夸张，不要忽高忽低。"
PILL = "Day 11 / 30 · 证件复印件排版"
APP = "day11-id-copy-a4"
URL_LABEL = "证件复印件排版"  # no address anywhere in the picture; the URL is only on the end card
CHORDS = ["Gmaj7", "Em7", "Cmaj7", "D"]
END = {
    "kicker": "30 天 30 个一句话工具 · DAY 11",
    "title": "证件复印件排版",
    "url": "tools.licorne.uk",
    "note": "画面、配音和配乐都是代码生成的",
}
COVER = {
    "title": "没有复印机？\n证件照**一页A4**打印",
    "subtitle": "Day 11｜拍歪也能拉正，真实尺寸",
    "tags": ["复印件", "证件照", "打印"],
    "author": "@独角兽在欧洲写代码",
    "template": "便签",
}

# ---- demo pictures: two obviously fake sample cards "photographed" crookedly, made by assets/idshots.py
ASSETS = Path(__file__).resolve().parents[1] / "assets"
SHOT = {"front": ASSETS / "idshot_front.jpg", "back": ASSETS / "idshot_back.jpg"}
if not all(p.exists() for p in SHOT.values()) or not (ASSETS / "idshots.json").exists():
    subprocess.run([sys.executable, str(ASSETS / "idshots.py")], check=True)
CORNERS = json.loads((ASSETS / "idshots.json").read_text())  # true card corners, as fractions of each photo

LABEL = {"front": "正面", "back": "背面"}
CORNER = ["左上角", "右上角", "右下角", "左下角"]
RESULT = {}  # what the tool exported, for the paper and the end card

# ---- page modes (CSS inside the tool): framing only, the tool itself is untouched.
# The root of the tool is `main > div`: [1] type card, [2] the two slots, [3] settings + A4 preview.
ROOT = "main > div"
APP_CSS = f"""
html.p {ROOT} > :nth-child(1){{display:none}}
/* slots: just the drop zones / photos */
html.p-slots {ROOT} > :nth-child(3){{display:none}}
html.p-slots {ROOT} > :nth-child(2) [data-slot=card-content] > :nth-child(n+3){{display:none}}
/* one big editor */
html.p-edit {ROOT} > :nth-child(3), html.p-edit-back {ROOT} > :nth-child(3){{display:none}}
html.p-edit {ROOT} > :nth-child(2), html.p-edit-back {ROOT} > :nth-child(2){{grid-template-columns:minmax(0,1fr)!important}}
html.p-edit {ROOT} > :nth-child(2) > :nth-child(2){{display:none}}
html.p-edit-back {ROOT} > :nth-child(2) > :nth-child(1){{display:none}}
html.p-edit [data-slot=card-content] > :nth-child(n+3), html.p-edit-back [data-slot=card-content] > :nth-child(n+3){{display:none}}
html.p-edit [data-slot=card-content] > :nth-child(2), html.p-edit-back [data-slot=card-content] > :nth-child(2){{max-width:600px;margin-inline:auto;width:100%}}
/* both slots with their straightened results */
html.p-res {ROOT} > :nth-child(3){{display:none}}
/* A4 preview with the watermark switch */
html.p-a4 {ROOT} > :nth-child(2){{display:none}}
html.p-a4 {ROOT} > :nth-child(3) > :first-child [data-slot=card-content] > :is(:nth-child(1),:nth-child(2),:nth-child(4),:nth-child(5)){{display:none}}
html.p-a4 {ROOT} > :nth-child(3) > :last-child > :nth-child(n+2){{display:none}}
html.p-a4 {ROOT} > :nth-child(3){{grid-template-columns:262px minmax(0,1fr)!important}}
html.p-a4 canvas[aria-label="A4 排版预览"]{{max-width:468px!important}}
/* export */
html.p-exp {ROOT} > :nth-child(2){{display:none}}
html.p-exp {ROOT} > :nth-child(3){{grid-template-columns:minmax(0,1fr)!important}}
html.p-exp {ROOT} > :nth-child(3) > :first-child{{display:none}}
html.p-exp {ROOT} > :nth-child(3) > :last-child{{max-width:460px;margin-inline:auto;zoom:1.12}}
html.p-exp {ROOT} > :nth-child(3) > :last-child > :last-child{{display:none}}
html.p-exp canvas[aria-label="A4 排版预览"]{{max-width:300px!important}}
"""

# ---- overlays drawn on the stage (not in the tool)
CSS = """
.sh{position:absolute;width:520px;border-radius:14px;overflow:hidden;opacity:0;box-shadow:0 30px 70px rgba(0,0,0,.6);border:3px solid #fafafa}
.sh img{display:block;width:100%}
#prn{position:absolute;left:690px;top:372px;width:270px;opacity:0}
#prn .no{position:absolute;inset:-10px}
#prn b{display:block;text-align:center;font:700 34px 'Noto Sans SC',sans-serif;color:#d4d4d4;margin-top:8px}
#fl2{position:absolute;left:0;top:0;width:300px;border-radius:10px;box-shadow:0 30px 60px rgba(0,0,0,.6);border:3px solid #fafafa;opacity:0;z-index:5}
#fl2 img{width:100%;display:block;border-radius:7px}
#pwrap{position:absolute;left:150px;top:290px;width:780px;height:932px;overflow:hidden;opacity:0;z-index:5}
#paper{position:absolute;left:40px;top:0;width:700px;transform:translateY(932px);box-shadow:0 30px 80px rgba(0,0,0,.65)}
#paper img{display:block;width:100%}
#dim{position:absolute;left:29.62%;width:40.76%;top:17.2%;height:34px;opacity:0}
#dim i{position:absolute;left:0;right:0;top:20px;height:4px;background:#f59e0b;border-radius:2px}
#dim u{position:absolute;top:10px;width:4px;height:24px;background:#f59e0b;border-radius:2px}
#dim span{position:absolute;left:50%;top:-34px;transform:translateX(-50%);background:#f59e0b;color:#1a1204;font:800 28px Geist,'Noto Sans SC',sans-serif;border-radius:10px;padding:2px 14px;white-space:nowrap}
#slot{position:absolute;left:130px;width:820px;top:1214px;height:24px;border-radius:12px;background:linear-gradient(#3a3a3a,#1a1a1a);border:1px solid #4a4a4a;opacity:0;z-index:6;box-shadow:0 10px 30px rgba(0,0,0,.6)}
#end .img img{height:640px}
"""

PRINTER = """<svg viewBox="0 0 270 220" width="270" height="220"><rect x="62" y="6" width="146" height="70" rx="6" fill="#f5f5f5"/>
<rect x="76" y="22" width="90" height="6" rx="3" fill="#c7c7c7"/><rect x="76" y="38" width="64" height="6" rx="3" fill="#c7c7c7"/>
<rect x="10" y="66" width="250" height="110" rx="22" fill="#4b5563"/><rect x="34" y="140" width="202" height="62" rx="6" fill="#e5e7eb"/>
<circle cx="224" cy="98" r="8" fill="#34d399"/></svg>
<svg class="no" viewBox="0 0 290 240" width="290" height="240"><circle cx="145" cy="110" r="104" fill="none" stroke="#ef4444" stroke-width="14"/>
<line x1="70" y1="36" x2="220" y2="184" stroke="#ef4444" stroke-width="14" stroke-linecap="round"/></svg>"""


def _jpeg(src, width):
    im = Image.open(src) if not isinstance(src, Image.Image) else src
    im = im.convert("RGB").resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def dom_click(c, js):
    """Click an element straight in the page (nothing is filmed around it)."""
    c.app.evaluate(f"() => {{ {js} }}")


def setup(c):
    f, b = (c.image_data_url(_jpeg(SHOT[k], 760), "image/jpeg") for k in ("front", "back"))
    c.inject(f"""<div class="sh" id="sh1"><img src="{f}"></div><div class="sh" id="sh2"><img src="{b}"></div>
      <div id="prn">{PRINTER}<b>复印机</b></div><div id="fl2"><img src="{b}"></div>
      <div id="pwrap"><div id="paper"><img id="paper-img"><div id="dim"><span>85.6 mm</span><i></i><u style="left:0"></u><u style="right:0"></u></div></div></div>
      <div id="slot"></div>""", CSS)
    c.js("u => document.getElementById('fly-img').src = u", f)
    c.app.add_style_tag(content=APP_CSS)
    # Start the watermark on another purpose, so picking 办理入职 on camera is a visible change (nothing is filmed yet).
    c.app.evaluate("""() => {
        const lab = [...document.querySelectorAll('label')].find(l => l.textContent.includes('加用途水印'))
        lab.querySelector('input').click()
        return new Promise(r => setTimeout(r, 100))
    }""")
    c.app.evaluate("() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '租房').click()")
    c.app.evaluate("() => [...document.querySelectorAll('label')].find(l => l.textContent.includes('加用途水印')).querySelector('input').click()")
    c.app.evaluate("() => document.documentElement.classList.add('p', 'p-slots')")


def set_mode(c, mode):
    c.app.evaluate("m => { const h = document.documentElement; [...h.classList].filter(x => x.startsWith('p-')).forEach(x => h.classList.remove(x)); h.classList.add(m) }", mode)


def drag_corner(c, face, i, filmed=True):
    """Drag corner i of a photo onto the card's real corner, with the drawn cursor and the magnifier."""
    h = c.center(f'button[aria-label="{LABEL[face]}{CORNER[i]}"]')
    box = c.app_box(f'canvas[aria-label="{LABEL[face]}照片"]')
    fx, fy = CORNERS[face][i]
    tx, ty = box["x"] + fx * box["width"], box["y"] + fy * box["height"]
    if not filmed:
        c.pg.mouse.move(*h)
        c.pg.mouse.down()
        c.pg.mouse.move(tx, ty, steps=6)
        c.pg.mouse.up()
        return
    c.cursor_to(*h, 5)
    c.pg.mouse.move(*h)
    c.pg.mouse.down()
    c.cursor_press(True)
    c.cursor_to(tx, ty, 9, drag=True)
    for _ in range(4):  # hold on the magnifier
        c.shot(settle=True)
    c.pg.mouse.up()
    c.cursor_press(False)
    c.tick()
    c.shot(settle=True)


# ---- scenes
def stuck(c):
    c.style("win", opacity="0")
    c.shot()
    # Beat 0.5: the two crooked photos pile up.
    c.until(0.5)
    c.tick()
    for k in range(9):
        t = ease((k + 1) / 9)
        c.style("sh1", left="70px", top=f"{440 - 40 * (1 - t):.0f}px", opacity=f"{t:.2f}", transform=f"rotate({-9 * t:.1f}deg)")
        c.shot()
    c.until(2.2)
    c.tick()
    for k in range(9):
        t = ease((k + 1) / 9)
        c.style("sh2", left="400px", top=f"{700 + 40 * (1 - t):.0f}px", opacity=f"{t:.2f}", transform=f"rotate({7 * t:.1f}deg)")
        c.shot()
    # Beat 4.5: a copier appears ...
    c.until(4.5)
    c.tick()
    c.fade("prn", 0, 1, 8)
    # ... beat 6.5: and is crossed out.
    c.until(6.5)
    c.tick()
    c.js("""() => { const l = document.querySelector('#prn .no'); l.style.transformOrigin = '50% 50%' }""")
    for k in range(8):
        t = ease((k + 1) / 8)
        c.js("t => { const n = document.querySelector('#prn .no'); n.style.opacity = t; n.style.transform = `scale(${1.25 - 0.25 * t})` }", t)
        c.shot()


def place(c):
    # Beat 0: the tool appears with two empty slots.
    c.tick()
    for k in range(6):
        t = (k + 1) / 6
        for el in ("sh1", "sh2", "prn"):
            c.style(el, opacity=str(1 - t))
        c.style("win", opacity=str(t))
        c.shot()
    shots = {"front": ("fly", 1.4), "back": ("fl2", 2.7)}
    for face, (el, beat) in shots.items():
        c.until(beat)
        c.tick()
        sx, sy = (150, 1260) if face == "front" else (700, 1260)
        tx, ty = c.center(f'label:has(input[aria-label="选择{LABEL[face]}照片"])')
        w = 300
        for k in range(9):
            t = ease((k + 1) / 9)
            c.style(el, left=f"{sx + (tx - w / 2 - sx) * t:.0f}px", top=f"{sy + (ty - 100 - sy) * t:.0f}px",
                    opacity=str(min(1, (k + 1) / 3)), transform=f"scale({1 - 0.12 * t:.3f}) rotate({(-6 if face == 'front' else 6) * (1 - t):.1f}deg)")
            c.shot()
        # It lands: the tool really loads that photo.
        c.app.locator(f'input[aria-label="选择{LABEL[face]}照片"]').set_input_files(str(SHOT[face]))
        c.app.wait_for_selector(f'canvas[aria-label="{LABEL[face]}照片"]')
        c.style(el, opacity="0")
        c.pg.wait_for_timeout(150)
        c.shot(settle=True)
        c.pop(f"document.querySelector('main > div > :nth-child(2) > :nth-child({1 if face == 'front' else 2})')", 5)
    # Beat 3.4: one big editor for the front photo; the four corners are dragged onto the card, one per beat or so.
    c.until(4.0)
    c.tick()
    set_mode(c, "p-edit")
    c.pop("document.querySelector('main > div > :nth-child(2)')", 5)
    c.style("cursor", opacity="1")
    c.cursor_pos = (700, 1000)
    for i in range(4):
        c.until(4.8 + 1.4 * i)
        drag_corner(c, "front", i)
    c.pg.wait_for_timeout(800)
    c.shot(settle=True)
    # The back photo is lined up the same way, off camera.
    set_mode(c, "p-edit-back")
    c.pg.wait_for_timeout(300)
    for i in range(4):
        drag_corner(c, "back", i, filmed=False)
    c.pg.wait_for_timeout(800)
    set_mode(c, "p-edit")
    c.pg.wait_for_timeout(300)


def straighten(c):
    # Beat 0: both slots with their straightened results.
    c.tick()
    set_mode(c, "p-res")
    c.fade("cursor", 1, 0, 4)
    c.pop("document.querySelector('main > div > :nth-child(2)')", 6)
    for _ in range(3):
        c.shot(settle=True)
    # Beat 3: the A4 page: the front card first, then the back.
    c.until(3)
    c.tick()
    set_mode(c, "p-a4")
    page = "document.querySelector('canvas[aria-label=\"A4 排版预览\"]')"
    for k in range(8):
        t = ease((k + 1) / 8)
        c.app.evaluate(f"() => {{ const e = {page}; e.style.clipPath = 'inset(0 0 100% 0)'; if ({k} === 7) e.style.clipPath = 'inset(0 0 40% 0)' }}")
        c.shot(settle=True)
    c.pg.wait_for_timeout(100)
    c.until(4.6)
    c.tick()
    for k in range(10):
        p = 40 * (1 - ease((k + 1) / 10))
        c.app.evaluate(f"() => {{ {page}.style.clipPath = 'inset(0 0 {p:.1f}% 0)' }}")
        c.shot(settle=True)
    c.app.evaluate(f"() => {{ {page}.style.clipPath = '' }}")
    # Beat 6.3: watermark on; beat 8.3: purpose 办理入职.
    c.style("cursor", opacity="1")
    c.cursor_pos = (760, 1100)
    c.click('label:has-text("加用途水印") input', 6.3, frames=9)
    for _ in range(3):
        c.shot(settle=True)
    c.click('button:has-text("办理入职")', 8.4, frames=9)
    for _ in range(8):
        c.shot(settle=True)
    c.until(12)
    c.fade("cursor", 1, 0, 5)


def export(c):
    # Beat 0: the export buttons.
    c.tick()
    set_mode(c, "p-exp")
    c.pop("document.querySelector('main > div > :nth-child(3)')", 6)
    c.style("cursor", opacity="1")
    c.cursor_pos = (760, 1100)
    c.shot(settle=True)
    # The real PNG of the same page (for the paper and the end card), taken without filming.
    with c.pg.expect_download(timeout=60000) as d:
        c.app.evaluate("() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('导出 PNG')).click()")
    path = c.dir.parent / "export.png"
    d.value.save_as(str(path))
    RESULT["png"] = path.read_bytes()
    im = Image.open(path)
    print("export png:", im.size)
    c.js("u => document.getElementById('paper-img').src = u", c.image_data_url(_jpeg(im, 1000), "image/jpeg"))
    c.js("() => document.getElementById('paper-img').decode()")
    # Beat 1.6: click 导出 PDF (a real download).
    with c.pg.expect_download(timeout=60000) as d:
        c.click('button:has-text("导出 PDF")', 1.6, frames=10)
    d.value.save_as(str(c.dir.parent / "export.pdf"))
    for _ in range(4):
        c.shot(settle=True)
    # Beat 3.6: the paper is "printed" out of a slot, bottom to top.
    c.until(3.6)
    c.tick()
    c.style("pwrap", opacity="1")
    c.style("slot", opacity="1")
    n = 28
    for k in range(n):
        t = ease_in_out((k + 1) / n)
        c.style("win", opacity=str(max(0, 1 - 2.5 * (k + 1) / n)))
        c.style("cursor", opacity=str(max(0, 1 - 4 * (k + 1) / n)))
        c.style("paper", transform=f"translateY({932 - 990 * t:.1f}px)")
        c.shot()
    # Beat 7: a dimension line over the front card: 85.6 mm.
    c.until(7)
    c.tick()
    for k in range(10):
        c.style("dim", opacity=str(min(1, (k + 1) / 6)))
        c.shot()
    c.until(12.5)


def ease_in_out(t):
    return 3 * t * t - 2 * t * t * t


def end_card(c):
    c.style("pwrap", opacity="0")
    c.style("slot", opacity="0")
    c.js("u => document.getElementById('end-img').src = u", c.image_data_url(_jpeg(Image.open(io.BytesIO(RESULT["png"])), 900), "image/jpeg"))
    c.js("() => document.getElementById('end-img').decode()")
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("end", opacity=str(min(1, (k + 1) / 8)))
        c.js("s => document.querySelector('#end .img').style.transform = `scale(${s})`", 0.94 + 0.06 * t)
        c.shot()


SCENES = [
    Scene(("01", "要交复印件？", "手边没复印机，照片还拍歪了"),
          "办事要交证件正反面复印件，手边没有复印机，拍的照片还是歪的。", "", stuck),
    Scene(("02", "放进照片，对准四个角", "拖一拖就行"),
          "把正面和反面的照片放进来，拖动四个角，对准证件的边缘。", "", place, extra_beats=3),
    Scene(("03", "自动拉正，按真实尺寸排版", "还能加用途水印"),
          "它会自动把证件拉正，按真实尺寸排在一页 A4 上，还能加上用途水印。", "", straighten, extra_beats=2),
    Scene(("04", "导出 PDF 直接打印", "大小和复印件一样"),
          "导出 PDF 直接打印，大小和复印件一模一样。", "", export, extra_beats=5),
    Scene(None, "第十一天，证件复印件排版。免费使用，证件照片全程不上传。", "", end_card, extra_beats=4),
]
