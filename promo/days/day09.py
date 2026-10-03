"""Day 9 · 房贷提前还款计算器. Page actions are written in beats of their own scene."""
import re

from promo.lib.capture import Scene, ease

BPM = 100
# Every line is read in one take with this style, so the narration stays steady.
STYLE = "用平稳、清晰、语速适中的语气做产品讲解，像一段专业的演示旁白。整段保持同一种音色和情绪，不要夸张，不要忽高忽低。"
PILL = "Day 9 / 30 · 房贷提前还款计算器"
APP = "day09-mortgage-prepay"
URL_LABEL = "房贷提前还款计算器"  # no address anywhere in the picture; the URL is only on the end card
CHORDS = ["Fmaj7", "Am7", "Dm7", "Bbmaj7"]
END = {
    "kicker": "30 天 30 个一句话工具 · DAY 9",
    "title": "房贷提前还款计算器",
    "url": "tools.licorne.uk",
    "note": "画面、配音和配乐都是代码生成的",
}
COVER = {
    "title": "提前还房贷\n能省**多少利息**？",
    "subtitle": "Day 9｜缩短年限 vs 减少月供，一张图算清",
    "tags": ["房贷", "提前还款", "理财工具"],
    "author": "@独角兽在欧洲写代码",
    "template": "暗夜",
}
DISCLAIMER = "示例利率仅作演示，结果以银行为准"

# The one example used all through the video: 100 万, 30 年, 3.5 %, 等额本息, 36 期 paid, 20 万 next month.
EXAMPLE = {"贷款金额": "100", "贷款年限": "30", "年利率": "3.5", "已还期数": "36", "提前还款金额 1": "20"}

CARDS = "main > div.space-y-6 > div.grid.md\\:grid-cols-3"  # the three result cards
RESULTS = {}  # what the tool showed, read from its page

# ---- page modes (CSS inside the tool): framing only, the tool itself is untouched.
APP_CSS = """
html.p main > div.space-y-6 > *{display:none!important}
html.p-form main > div.space-y-6 > :first-child{display:block!important;zoom:1.3}
html.p-cards main > div.space-y-6 > div.grid.md\\:grid-cols-3{display:grid!important}
html.p-cards [data-result] .text-2xl{font-size:1.9rem}
html.p-cards [data-result] p.text-sm{font-size:1.45rem;line-height:1.3}
html.p-cards [data-result] p.text-xs{font-size:1.05rem}
html.p-cards [data-result]{zoom:1.02}
html.p-chart main > div.space-y-6 > :nth-child(3){display:block!important;zoom:1.1}
html.p-table main > div.space-y-6 > :nth-child(4){display:block!important;zoom:1.25}
"""

# ---- overlays drawn on the stage (not in the tool)
CSS = """
#duel{position:absolute;left:60px;top:318px;width:960px;height:900px;opacity:0}
#duel .c{position:absolute;top:150px;width:420px;height:520px;border-radius:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
  font-family:'Noto Sans SC',Geist,sans-serif;opacity:0;box-shadow:0 30px 80px rgba(0,0,0,.55);border:2px solid #2a2a2a;background:#141414}
#duel .c b{font-size:70px;font-weight:900;color:#fafafa}
#duel .c i{font-style:normal;font-size:34px;color:#a3a3a3;font-weight:500}
#duel .c.a{left:10px;transform:rotate(-3deg)}
#duel .c.b{right:10px;transform:rotate(3deg)}
#duel .c.a b{color:#34d399}
#duel .q{position:absolute;left:0;right:0;top:300px;text-align:center;font:900 250px/1 Geist,sans-serif;color:#fafafa;opacity:0;z-index:2;text-shadow:0 10px 50px rgba(0,0,0,.8)}
#end .img{border-radius:20px;overflow:hidden}
#end .img img{height:auto;width:900px;max-width:none}
#end .disc{margin-top:10px;font-size:22px;color:#6f6f6f;font-weight:500}
"""


def setup(c):
    c.inject("""<div id="duel">
      <div class="c a" id="dl"><b>缩短年限？</b><i>月供不变</i></div>
      <div class="c b" id="dr"><b>减少月供？</b><i>年限不变</i></div>
      <div class="q" id="dq">?</div></div>""", CSS)
    c.app.add_style_tag(content=APP_CSS)
    c.app.evaluate("() => document.documentElement.classList.add('p', 'p-form')")
    # Every field starts empty, so the numbers can be typed on camera (nothing is filmed yet).
    for label in EXAMPLE:
        c.app.get_by_label(label, exact=True).fill("")
    c.app.evaluate("() => document.activeElement && document.activeElement.blur()")


# ---- scenes
def duel(c):
    c.style("win", opacity="0")
    c.style("duel", opacity="1")
    c.shot()
    for beat, id_, rot in [(1, "dl", -3), (3, "dr", 3)]:
        c.until(beat)
        c.tick()
        for k in range(9):
            t = ease((k + 1) / 9)
            c.style(id_, opacity=f"{t:.2f}", transform=f"translateY({50 * (1 - t):.1f}px) rotate({rot * t:.2f}deg)")
            c.shot()
    c.until(5.5)
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("dq", opacity=f"{t:.2f}", transform=f"scale({0.5 + 0.5 * t:.3f})")
        c.shot()


def fill_in(c):
    # Beat 0: the two cards give way to the tool.
    c.tick()
    for k in range(10):
        t = (k + 1) / 10
        c.style("duel", opacity=str(1 - t))
        c.style("win", opacity=str(t))
        c.shot()
    c.style("cursor", opacity="1")
    for i, (label, text) in enumerate(EXAMPLE.items()):
        sel = f"input[aria-label='{label}']"
        c.click(sel, 2.2 + i * 1.7, frames=8)
        for ch in text:
            c.pg.keyboard.type(ch)
            c.shot(settle=True)
            c.shot()
    c.until(11.5)
    c.fade("cursor", 1, 0, 6)


def read(c):
    """The text of the three result cards, exactly as the tool shows it."""
    return c.app.evaluate("""() => Object.fromEntries([...document.querySelectorAll('[data-result]')].map(e => [e.dataset.result,
        [...e.querySelectorAll('p')].map(p => p.innerText.replace(/\\s+/g, ' ').trim())]))""")


def results(c):
    # Start from "no prepayment" so the savings roll up from 0 when the real amount goes in.
    c.app.get_by_label("提前还款金额 1", exact=True).fill("0")
    c.app.evaluate("() => { document.documentElement.classList.remove('p-form'); document.documentElement.classList.add('p-cards')"
                   "; window.scrollTo(0, 0); document.querySelectorAll('[data-result]').forEach(e => e.style.opacity = 0) }")
    c.pg.wait_for_timeout(700)
    c.tick()
    c.shot(settle=True)
    for i, beat in enumerate([0.8, 1.6, 2.4]):
        c.until(beat)
        c.tick()
        for k in range(7):
            t = ease((k + 1) / 7)
            c.app.evaluate("([i, t]) => Object.assign(document.querySelectorAll('[data-result]')[i].style, {opacity: t, transform: `translateY(${16 * (1 - t)}px)`})", [i, t])
            c.shot()
    # Beat 3.3: the 20 万 goes in (a real input); the tool rolls the savings up from 0.
    c.until(3.3)
    c.tick()
    c.app.evaluate("""() => { const el = document.querySelector("input[aria-label='提前还款金额 1']")
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '20')
        el.dispatchEvent(new Event('input', { bubbles: true })) }""")
    for _ in range(22):
        c.shot(settle=True)
    RESULTS["cards"] = read(c)
    RESULTS["url"] = c.app.url
    print("scene 3 cards:", RESULTS["cards"])
    # For the end card: the three cards, with the stage overlays hidden (no frame is taken meanwhile).
    c.js("() => { for (const id of ['layer', 'cursor']) document.getElementById(id).style.display = 'none' }")
    RESULTS["png"] = c.pg.screenshot(clip=c.app_box(CARDS))
    c.js("() => { for (const id of ['layer', 'cursor']) document.getElementById(id).style.display = '' }")

    # Beat 6: the remaining-principal curves are drawn from left to right.
    c.until(6)
    c.app.evaluate("() => { const l = document.documentElement.classList; l.remove('p-cards'); l.add('p-chart'); window.scrollTo(0, 0)"
                   "; document.querySelectorAll('polyline[data-series]').forEach(p => { p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1' }) }")
    c.pg.wait_for_timeout(300)
    c.tick()
    c.shot(settle=True)
    c.until(6.6)
    frames = 70
    for k in range(frames):
        t = ease((k + 1) / frames)
        c.app.evaluate("t => document.querySelectorAll('polyline[data-series]').forEach(p => p.style.strokeDashoffset = 1 - t)", t)
        c.shot(settle=True)
    c.app.evaluate("() => document.querySelectorAll('polyline[data-series]').forEach(p => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = '' })")
    c.shot(settle=True)


def table(c):
    # Collapse every year, then show only the table card.
    c.app.evaluate("""() => { document.documentElement.classList.remove('p-chart'); document.documentElement.classList.add('p-table')
        document.querySelectorAll('button[aria-expanded=true]').forEach(b => b.click()); window.scrollTo(0, 0) }""")
    c.pg.wait_for_timeout(300)
    c.tick()
    c.pop("document.querySelector('main > div.space-y-6')", 6)
    c.style("cursor", opacity="1")
    # Beat 1.5: open the year that holds the prepayment (its row is highlighted); rows appear one by one.
    year = c.app.evaluate("() => { const r = [...document.querySelectorAll('button[aria-expanded]')]; return r.map(b => b.getAttribute('aria-label')) }")
    print("table years:", year[:6])
    target = c.app.evaluate("""() => { // the year in the prepayment month, found from the schedule data of the plan
        const s = new URLSearchParams(location.search), start = s.get('start'), paid = +s.get('paid')
        const [y, m] = start.split('-').map(Number), idx = y * 12 + m - 1 + paid  // period paid + 1
        return Math.floor(idx / 12) }""")
    sel = f"button[aria-label='{target} 年']"
    c.click(sel, 1.5, frames=10)
    c.app.evaluate("() => document.querySelectorAll('tbody tr').forEach(r => r.style.opacity = 0)")
    c.tick()
    n = c.app.evaluate("() => document.querySelectorAll('tbody tr').length")
    for i in range(n):
        for k in range(3):
            c.app.evaluate("([i, t]) => Object.assign(document.querySelectorAll('tbody tr')[i].style, {opacity: t})", [i, (k + 1) / 3])
            c.shot(settle=k == 0)
    # Beat 4: the page drifts down to the highlighted prepayment row, then back up.
    c.until(4)
    y1 = c.app.evaluate("() => { const r = document.querySelector('tbody tr.bg-success\\\\/10'); return r ? scrollY + r.getBoundingClientRect().top - 420 : 0 }")
    for k in range(14):
        c.app.evaluate("y => window.scrollTo(0, y)", max(0, y1) * ease_io((k + 1) / 14))
        c.shot(settle=True)
    c.until(5.6)
    for k in range(10):
        c.app.evaluate("y => window.scrollTo(0, y)", max(0, y1) * (1 - ease_io((k + 1) / 10)))
        c.shot(settle=True)
    # Beat 7: export the schedule as CSV.
    with c.pg.expect_download() as dl:
        c.click("button:has-text('导出 CSV')", 7, frames=10)
    print("scene 4 download:", dl.value.suggested_filename)
    c.until(9.5)
    c.fade("cursor", 1, 0, 6)


def ease_io(t):
    return t * t * (3 - 2 * t)


def end_card(c):
    c.js("u => document.getElementById('end-img').src = u", c.image_data_url(RESULTS["png"]))
    c.js("() => document.getElementById('end-img').decode()")
    c.js("t => { const p = document.createElement('p'); p.className = 'disc'; p.textContent = t; document.getElementById('end-note').after(p) }", DISCLAIMER)
    c.tick()
    for k in range(12):
        t = ease((k + 1) / 12)
        c.style("end", opacity=str(min(1, (k + 1) / 8)))
        c.js("s => document.querySelector('#end .img').style.transform = `scale(${s})`", 0.94 + 0.06 * t)
        c.shot()


SCENES = [
    Scene(("01", "想提前还房贷？", "先算清楚能省多少"),
          "手里有一笔钱，想提前还房贷，到底能省多少利息？缩短年限和减少月供，差别有多大？", "", duel),
    Scene(("02", "填上你的房贷", "金额、年限、利率、已还期数"),
          "先把贷款金额、年限、利率和已经还了多少期填进去，再填上打算提前还的金额。", "", fill_in),
    Scene(("03", "两种方案一起算", "省多少利息一目了然"),
          "两种方案同时算出来，各省多少利息、提前几年还完，一眼就能看清。", "", results, extra_beats=4),
    Scene(("04", "每一期都列清楚", "还能导出表格"),
          "每一期的本金和利息都列在表里，还能导出成表格慢慢看。", "", table, extra_beats=4),
    Scene(None, "第九天，房贷提前还款计算器。免费使用，数据全程不上传。", "", end_card, extra_beats=4),
]
