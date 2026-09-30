"""Day 6 · 二维码生成器. Page actions are written in beats of their own scene."""
import subprocess
import sys
from pathlib import Path

from promo.lib.capture import Scene, ease

BPM = 110
# Every line is read in one take with this style, so the narration stays steady.
STYLE = "用平稳、清晰、语速适中的语气做产品讲解，像一段专业的演示旁白。整段保持同一种音色和情绪，不要夸张，不要忽高忽低。"
PILL = "Day 6 / 30 · 二维码生成器"
APP = "day06-qr-code"
URL_LABEL = "二维码生成器"  # no address anywhere in the picture; the URL is only on the end card
CHORDS = ["Cmaj7", "Am7", "Fmaj7", "G"]
END = {
    "kicker": "30 天 30 个一句话工具 · DAY 6",
    "title": "二维码生成器",
    "url": "tools.licorne.uk",
    "note": "画面、配音和配乐都是代码生成的",
}
COVER = {
    "title": "**WiFi密码**\n不用再念了",
    "subtitle": "Day 6｜扫码直接连网，密码不上传",
    "tags": ["WiFi", "二维码", "效率工具"],
    "author": "@独角兽在欧洲写代码",
    "template": "便签",
}

# Demo network: made up, never a real one.
SSID, PASSWORD = "MyHome-5G", "welcome2026"

# ---- demo logo: drawn by assets/logo.py on first use
LOGO = Path(__file__).resolve().parents[1] / "assets" / "logo.png"
if not LOGO.exists():
    subprocess.run([sys.executable, str(LOGO.with_suffix(".py"))], check=True)

NAME_INPUT = "input[placeholder='路由器上显示的网络名']"
PASS_INPUT = "input[autocomplete='off']"
PREVIEW_JS = "document.querySelector('main button.flex-1').parentElement.previousElementSibling"  # the QR box

# ---- page modes (CSS inside the tool): framing only, the tool itself is untouched.
# The form card is zoomed 1.7× (14 px text -> 28.6 px in the video) and shows just the part a scene is about:
# the two fields while typing (narrow card, big code), the look options afterwards.
APP_CSS = """
html.p-type main > div > div.grid{grid-template-columns:320px minmax(0,1fr)!important}
html.p-style main > div > div.grid{grid-template-columns:440px minmax(0,1fr)!important}
html.p main > div > div.grid > [data-slot=card]{zoom:1.7}
html.p [data-slot=card-content]{padding-inline:12px!important}
html.p-type [data-slot=card-content] > :first-child,
html.p-type [data-slot=card-content] > :nth-child(n+3),
html.p-type [data-slot=card-content] > :nth-child(2) > :nth-child(3){display:none!important}
html.p-style [data-slot=card-content] > :nth-child(-n+3),
html.p-style [data-slot=card-content] > :nth-child(7),
html.p-style [data-slot=card-content] > :nth-child(4) > :nth-child(3),
html.p-style [data-slot=card-content] > :nth-child(6) > :first-child{display:none!important}
html.p-style [data-slot=card-content] > :nth-child(6){grid-template-columns:1fr!important}
"""

# ---- overlays drawn on the stage (not in the tool)
CSS = """
#chat{position:absolute;left:60px;top:318px;width:960px;height:900px;border-radius:26px;background:#ededed;color:#111;overflow:hidden;opacity:0;font-family:'Noto Sans SC',Geist,sans-serif}
#chat .hd{height:92px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:700;border-bottom:1px solid #d9d9d9;background:#f6f6f6}
#chat .m{display:flex;gap:18px;padding:0 36px;margin-top:44px;opacity:0;align-items:flex-start}
#chat .m.r{flex-direction:row-reverse}
#chat .av{width:76px;height:76px;border-radius:14px;flex-shrink:0;display:grid;place-items:center;font-size:32px;font-weight:700;color:#fff;background:#94a3b8}
#chat .m.r .av{background:#f97316}
#chat .b{max-width:640px;background:#fff;border-radius:16px;padding:20px 26px;font-size:38px;line-height:1.45;font-weight:500}
#chat .m.r .b{background:#95ec69}
#chat .b b{font-family:Geist,'Noto Sans SC';font-weight:700}
#wall{position:absolute;left:60px;top:318px;width:960px;height:900px;border-radius:26px;overflow:hidden;opacity:0;
  background:radial-gradient(700px 520px at 30% 20%,#f6f1e8 0%,#e7dfd2 70%,#ddd3c3 100%)}
#wall .card{position:absolute;left:255px;top:74px;width:450px;border-radius:8px;box-shadow:0 26px 50px rgba(60,40,20,.28),0 3px 8px rgba(60,40,20,.2);transform-origin:50% 0}
#wall .card img{display:block;width:100%;border-radius:8px}
#wall .tape{position:absolute;width:150px;height:46px;background:rgba(232,214,160,.78);box-shadow:0 2px 5px rgba(0,0,0,.12);top:-20px}
#wall .tape.a{left:-44px;transform:rotate(-38deg)}
#wall .tape.b{right:-44px;transform:rotate(38deg)}
#wall p{position:absolute;left:0;right:0;top:760px;text-align:center;font-size:32px;font-weight:700;color:#5b4a36;opacity:0;font-family:'Noto Sans SC',sans-serif}
"""
MESSAGES = [
    ("", "客", "WiFi 密码多少？"),
    ("r", "我", f"<b>{SSID}</b>，密码 <b>{PASSWORD}</b>，全小写"),
    ("", "客", "连不上……是不是输错了"),
]


def setup(c):
    msgs = "".join(f'<div class="m {side}" id="m{i}"><div class="av">{who}</div><div class="b">{text}</div></div>'
                   for i, (side, who, text) in enumerate(MESSAGES))
    c.inject(f"""<div id="chat"><div class="hd">客人</div>{msgs}</div>
      <div id="wall"><div class="card" id="wall-card"><i class="tape a"></i><i class="tape b"></i><img id="wall-img"></div>
      <p id="wall-note">密码只在浏览器里生成，不上传</p></div>""", CSS)
    c.app.add_style_tag(content=APP_CSS)
    c.app.evaluate("() => document.documentElement.classList.add('p', 'p-type')")
    # Both fields start empty, so the code is seen appearing as the name is typed.
    c.app.locator(NAME_INPUT).fill("")
    c.app.locator(PASS_INPUT).fill("")


def bubble(c, i, frames=7):
    for k in range(frames):
        t = ease((k + 1) / frames)
        c.style(f"m{i}", opacity=str(t), transform=f"translateY({26 * (1 - t):.1f}px) scale({0.96 + 0.04 * t})")
        c.shot()


# ---- scenes
def pain(c):
    c.style("win", opacity="0")
    c.style("chat", opacity="1")
    c.shot()
    # Beat 2: "又被问 WiFi 密码" · beat 5: reading it out · beat 8.5: still wrong, with a little shake.
    for beat, i in [(2, 0), (5, 1), (8.5, 2)]:
        c.until(beat)
        c.tick()
        bubble(c, i)
    for k in range(12):
        c.style("m2", transform=f"translateX({14 * (1 - k / 12) * (1 if k % 2 else -1):.1f}px)")
        c.shot()
    c.style("m2", transform="none")
    c.shot()


def type_into(c, selector, text, beat):
    """Click a field on the beat, then type one character every 2 frames; the QR code follows live."""
    c.click(selector, beat, frames=8)
    x, y = c.cursor_pos
    c.cursor_to(x + 110, y + 44, 3)  # out of the way of the text
    for ch in text:
        c.pg.keyboard.type(ch)
        c.shot(settle=True)
        c.shot()


def fill_in(c):
    # Beat 0: the chat gives way to the real tool.
    c.tick()
    for k in range(10):
        t = (k + 1) / 10
        c.style("chat", opacity=str(1 - t))
        c.style("win", opacity=str(t))
        c.shot()
    c.style("cursor", opacity="1")
    type_into(c, NAME_INPUT, SSID, 2)
    c.pop(PREVIEW_JS, 5)
    type_into(c, PASS_INPUT, PASSWORD, 4.5)
    c.pop(PREVIEW_JS, 5)
    # Beat 7.5: the eye icon shows the password.
    c.click("button[aria-label='显示密码']", 7.5, frames=8)
    c.shot(settle=True)
    c.until(9.5)
    c.fade("cursor", 1, 0, 6)


def style_it(c):
    # The card now shows the look options instead of the two fields.
    c.app.evaluate("() => { const l = document.documentElement.classList; l.remove('p-type'); l.add('p-style') }")
    c.tick()
    c.pop("document.querySelector('[data-slot=card-content]')", 6)
    c.style("cursor", opacity="1")
    # One change per beat; the preview bounces a little each time.
    for beat, sel in [(2, "button[aria-label='配色 墨绿']"), (3, "button[aria-label='配色 深蓝']"),
                      (4, "button[aria-label='配色 咖啡']"), (5, "button:text-is('圆点')"), (6, "button:text-is('圆形')")]:
        c.click(sel, beat, frames=6)
        c.pop(PREVIEW_JS, 5)
    # Beat 7: the logo. The file goes straight into the input (a real click would open the system file dialog).
    x, y = c.center("label:has-text('上传图片')")
    c.cursor_to(x, y, 6)
    c.until(7)
    c.cursor_press(True)
    c.app.locator("input[type=file]").set_input_files(str(LOGO))
    c.app.wait_for_selector("button:has-text('移除')")
    c.tick()
    c.shot(settle=True)
    c.cursor_press(False)
    c.pop(PREVIEW_JS, 6)


EXPORT = {}


def export(c):
    # Beat 2: download the PNG. The very file the tool produced is what goes on the wall and the end card.
    with c.pg.expect_download() as dl:
        c.click("button:has-text('下载 PNG')", 2, frames=10)
    png = c.dir.parent / "qr-card.png"
    dl.value.save_as(png)
    EXPORT["png"] = png
    print("scene 4 download:", dl.value.suggested_filename, "->", png)
    url = c.image_data_url(png.read_bytes())
    c.js("u => document.getElementById('wall-img').src = u", url)
    c.js("u => document.getElementById('end-img').src = u", url)
    c.js("() => Promise.all([...document.querySelectorAll('#wall-img, #end-img')].map(i => i.decode()))")

    # Beat 4: "打印出来贴在墙上" — the card goes up on the wall, slightly tilted.
    c.until(4)
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("wall", opacity=str(min(1, (k + 1) / 6)))
        c.style("cursor", opacity=str(max(0, 1 - (k + 1) / 6)))
        c.style("wall-card", transform=f"translateY({-40 * (1 - t):.1f}px) rotate({-3 * t - 6 * (1 - t):.2f}deg) scale({1.06 - 0.06 * t})")
        c.shot()
    # Beat 7: "密码全程不离开你的浏览器".
    c.until(7)
    c.tick()
    c.fade("wall-note", 0, 1, 8)


def end_card(c):
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("end", opacity=str(min(1, (k + 1) / 8)))
        c.js("s => document.querySelector('#end .img').style.transform = `scale(${s})`", 0.94 + 0.06 * t)
        c.shot()


SCENES = [
    Scene(("01", "又被问 WiFi 密码？", "念一遍大小写，还是输错"),
          "家里来客人，又被问 WiFi 密码。念一遍大小写和数字，对方还是输错了。", "", pain),
    Scene(("02", "填好名称和密码", "二维码马上生成"),
          "把 WiFi 名称和密码填进去，二维码马上生成，手机相机一扫就能连上。", "", fill_in),
    Scene(("03", "配色、码点、Logo", "做成自己的风格"),
          "配色、码点和码眼都能换，中间还能放上自己的 Logo。", "", style_it, extra_beats=2),
    Scene(("04", "导出高清图片", "打印出来贴墙上"),
          "一键导出高清图片，打印出来贴在墙上。密码全程不离开你的浏览器。", "", export, extra_beats=1),
    Scene(None, "第六天，二维码生成器。免费使用，WiFi 密码不上传。", "", end_card, extra_beats=4),
]
