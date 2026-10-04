"""Render the Day 10 demo picture: a made-up community notice in the style of a phone screenshot.
Everything in it is invented; there are no real community, company or app names.

    python promo/assets/notice.py   # writes promo/assets/notice.png (390 css px wide, 2× pixels)

Not committed; promo/days/day10.py runs this script when the file is missing.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).with_name("notice.png")
TITLE = "关于周末停水的通知"
BODY = ("各位业主：因供水管网检修，10月19日（周六）8:00至16:00，3号楼、5号楼将临时停水，请提前储备生活用水。"
        "恢复供水后，水质可能短时浑浊，请先放水数分钟再使用。给您带来的不便，敬请谅解。")
SIGN = "物业服务中心"
DATE = "10月16日"

HTML = f"""<html><body style="margin:0;background:#f4f5f7;width:390px;font-family:-apple-system,'PingFang SC','Noto Sans SC',sans-serif;color:#1f2933">
<div style="margin:0;padding:26px 22px 30px;background:#fff">
  <div style="font-size:30px;font-weight:800;line-height:1.35">{TITLE}</div>
  <div style="margin-top:22px;font-size:23px;line-height:1.75;text-align:left">{BODY}</div>
  <div style="margin-top:26px;font-size:23px;line-height:1.6;text-align:right">{SIGN}<br>{DATE}</div>
</div></body></html>"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 390, "height": 200}, device_scale_factor=2)
        pg.set_content(HTML)
        pg.screenshot(path=str(OUT), full_page=True)
        b.close()
    print(OUT)


if __name__ == "__main__":
    main()
