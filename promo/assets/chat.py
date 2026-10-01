"""Render the Day 7 demo screenshots: a made-up, generic-looking chat (not styled after any real app)
between 小林 and 阿杰 planning a weekend dinner, captured the way a phone user would.

    python promo/assets/chat.py   # writes promo/assets/chat_1..6.png, chat_full.png, chat_meta.json

- chat_1..6.png: 390×844 at 2× pixels, each scrolled ~70% of the screen further, so they overlap.
- chat_full.png: the whole conversation rendered at once with the same bars (what stitching should give).
- chat_meta.json: where the title-bar name and the first avatar of 小林 are, in chat_1 pixels (= long image).
Not committed; promo/days/day07.py runs this script when the files are missing.
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent
W, H, DPR = 390, 844, 2
SHOTS = 6
STEP = round(H * 0.7)
HEADER, FOOTER = 64, 72

ME, THEM = "阿杰", "小林"
# (who, text); "photo" is the restaurant picture placeholder, "time" a centred timestamp.
SCRIPT = [
    ("time", "周四 21:05"),
    (THEM, "周末有空吗？好久没一起吃饭了"),
    (ME, "有空！周六还是周日？"),
    (THEM, "周六晚上吧，周日我要早起"),
    (ME, "好，吃什么？"),
    (THEM, "江边新开了一家小馆，听说烤鱼特别好吃"),
    (THEM, "photo"),
    (ME, "看着不错！要订位吗？"),
    (THEM, "我问了，周六晚上人多，最好提前订"),
    (ME, "那我来订，几个人？"),
    (THEM, "就我们俩，再叫上小雨？"),
    (ME, "好啊，我问问她"),
    ("time", "周四 21:40"),
    (ME, "小雨说可以，不过她七点以后才下班"),
    (THEM, "那就七点半？"),
    (ME, "七点半有点晚，饿了怎么办"),
    (THEM, "哈哈，先吃点零食垫一下"),
    (ME, "行，那就七点半，我订三个人的位子"),
    (THEM, "在哪儿碰头？"),
    (ME, "直接在店门口吧，地铁站出来走五分钟"),
    (THEM, "好，我大概七点二十到"),
    ("time", "周五 12:18"),
    (ME, "订好了！靠窗的位子"),
    (THEM, "太好了，周六见！"),
    (ME, "周六见，记得带伞，可能下雨"),
    (THEM, "收到"),
]


def html():
    rows = []
    for who, text in SCRIPT:
        if who == "time":
            rows.append(f'<p class="t">{text}</p>')
            continue
        side = "me" if who == ME else "them"
        body = ('<div class="ph"><span>江边小馆 · 门口</span></div>' if text == "photo" else f'<div class="b">{text}</div>')
        rows.append(f'<div class="m {side}"><i>{who[-1]}</i>{body}</div>')
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0}}
body{{font:16px/1.5 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;background:#f4f5f9;color:#1d2433;padding:{HEADER + 10}px 14px {FOOTER + 12}px}}
header{{position:fixed;top:0;left:0;right:0;height:{HEADER}px;background:#fff;border-bottom:1px solid #e6e8ef;display:flex;align-items:center;padding:0 16px;gap:12px;z-index:2}}
header .back{{font-size:26px;color:#7a8194;line-height:1}}
header .who{{display:flex;flex-direction:column;line-height:1.2}}
header .who b{{font-size:17px}}
header .who small{{font-size:12px;color:#22a06b}}
header .more{{margin-left:auto;display:flex;gap:4px}}
header .more i{{width:5px;height:5px;border-radius:50%;background:#7a8194}}
footer{{position:fixed;bottom:0;left:0;right:0;height:{FOOTER}px;background:#fff;border-top:1px solid #e6e8ef;display:flex;align-items:center;gap:10px;padding:0 14px;z-index:2}}
footer .plus{{width:36px;height:36px;border-radius:50%;border:2px solid #c3c8d6;color:#7a8194;display:grid;place-items:center;font-size:22px}}
footer .in{{flex:1;height:42px;border-radius:21px;background:#f0f2f7;color:#9aa1b2;display:flex;align-items:center;padding:0 16px}}
footer .send{{width:42px;height:42px;border-radius:50%;background:#4f6ef7;color:#fff;display:grid;place-items:center;font-size:20px;font-weight:700}}
.t{{text-align:center;font-size:12px;color:#9aa1b2;margin:14px 0 4px}}
.m{{display:flex;gap:10px;margin:14px 0;align-items:flex-end}}
.m.me{{flex-direction:row-reverse}}
.m i{{width:40px;height:40px;border-radius:50%;color:#fff;font-style:normal;font-weight:700;display:grid;place-items:center;flex-shrink:0}}
.m.them i{{background:#f08a3c}}
.m.me i{{background:#2bb3a3}}
.b{{background:#fff;border:1px solid #e3e6ee;border-radius:18px 18px 18px 6px;padding:9px 14px;max-width:245px}}
.m.me .b{{background:#4f6ef7;border-color:#4f6ef7;color:#fff;border-radius:18px 18px 6px 18px}}
.ph{{width:220px;height:150px;border-radius:16px;background:linear-gradient(160deg,#f6c27a 0%,#e0794a 55%,#7b3f5e 100%);position:relative;overflow:hidden}}
.ph::before{{content:'';position:absolute;left:24px;right:24px;bottom:0;height:70px;background:#5a2e44;border-radius:10px 10px 0 0}}
.ph::after{{content:'';position:absolute;left:92px;bottom:0;width:36px;height:46px;background:#f6c27a;border-radius:4px 4px 0 0}}
.ph span{{position:absolute;left:12px;top:10px;color:#fff;font-size:13px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.3)}}
</style></head><body>
<header><span class="back">‹</span><div class="who"><b id="name">{THEM}</b><small>在线</small></div><div class="more"><i></i><i></i><i></i></div></header>
{''.join(rows)}
<footer><span class="plus">+</span><div class="in">发消息…</div><span class="send">↑</span></footer>
</body></html>"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=DPR)
        pg.set_content(html())
        pg.evaluate("document.fonts.ready")
        # Spread any missing height evenly between messages so six ~70% scrolls cover the chat exactly.
        need = STEP * (SHOTS - 1)
        have = pg.evaluate("document.documentElement.scrollHeight - innerHeight")
        n = pg.evaluate("document.querySelectorAll('.m, .t').length")
        if have < need:
            pg.evaluate(f"document.querySelectorAll('.m').forEach(m => m.style.marginBottom = '{14 + (need - have) / n:.2f}px')")
        top = pg.evaluate("document.documentElement.scrollHeight - innerHeight")
        for i in range(SHOTS):
            pg.evaluate(f"window.scrollTo(0, {round(top * i / (SHOTS - 1))})")
            pg.wait_for_timeout(50)
            pg.screenshot(path=str(OUT / f"chat_{i + 1}.png"))

        # Where the things to hide are, at scroll 0 (chat_1 = the top of the long image), in device pixels.
        pg.evaluate("window.scrollTo(0, 0)")
        box = lambda sel: pg.evaluate(f"""() => {{ const r = document.querySelector("{sel}").getBoundingClientRect()
            return [r.x * {DPR}, r.y * {DPR}, r.width * {DPR}, r.height * {DPR}] }}""")
        meta = {"name": box("#name"), "avatar": box(".m.them i"), "width": W * DPR}

        total = pg.evaluate("document.documentElement.scrollHeight")
        pg.set_viewport_size({"width": W, "height": total})
        pg.wait_for_timeout(100)
        pg.screenshot(path=str(OUT / "chat_full.png"))
        (OUT / "chat_meta.json").write_text(json.dumps(meta))
        b.close()
    print(OUT / "chat_1.png", f"… chat_{SHOTS}.png, chat_full.png ({W * DPR}×{total * DPR}), step {STEP}px")


if __name__ == "__main__":
    main()
