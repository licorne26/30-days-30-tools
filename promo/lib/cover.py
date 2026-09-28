"""Make the Xiaohongshu cover with our own Day 3 cover generator: fill the form, pick a
template, press 下载 PNG, convert to JPG."""
from pathlib import Path

from playwright.sync_api import sync_playwright

from .mix import ffmpeg


def make_cover(base_url: str, out_jpg: Path, *, title: str, subtitle: str, tags: list[str], author: str, template: str):
    out_jpg = Path(out_jpg)
    png = out_jpg.with_suffix(".png")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1100, "height": 1000}, accept_downloads=True)
        pg.goto(base_url + "day03-xhs-cover/")
        pg.locator("textarea").fill(title)
        pg.locator("label", has_text="副标题").locator("input").fill(subtitle)
        pg.locator("label", has_text="标签").locator("input").fill(" ".join(tags))
        pg.locator("label", has_text="署名").locator("input").fill(author)
        pg.locator("button", has_text=template).first.click()
        pg.wait_for_timeout(200)
        with pg.expect_download() as d:
            pg.locator("button", has_text="下载 PNG").click()
        d.value.save_as(png)
        b.close()
    ffmpeg("-i", png, "-q:v", "2", out_jpg)
    png.unlink()
    return out_jpg
