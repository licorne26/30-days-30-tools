"""Draw the Day 8 demo picture: an obviously fake sample card (made-up name, all-zero number, grey
silhouette, "样例证件 SAMPLE" in big letters). It does not copy any real ID layout, colour scheme,
emblem or official mark.

    python promo/assets/idcard.py   # writes promo/assets/idcard.jpg (1600×1000)

Not committed; promo/days/day08.py runs this script when the file is missing.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).with_name("idcard.jpg")
FONTS = ["/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/STHeiti Medium.ttc",
         "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/Library/Fonts/Arial Unicode.ttf"]


def font(size):
    for p in FONTS:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main():
    im = Image.new("RGB", (1600, 1000), (236, 240, 246))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((40, 40, 1560, 960), radius=44, fill=(250, 251, 253), outline=(186, 195, 209), width=4)
    d.rounded_rectangle((90, 80, 1000, 210), radius=24, fill=(255, 237, 213), outline=(234, 140, 40), width=5)
    d.text((125, 100), "样例证件 SAMPLE", font=font(80), fill=(180, 83, 9))
    d.text((100, 330), "姓名　张小样", font=font(70), fill=(40, 44, 56))
    d.text((100, 480), "号码", font=font(56), fill=(110, 116, 130))
    d.text((100, 560), "0000 0000 0000 0000", font=font(80), fill=(40, 44, 56))
    d.text((100, 760), "仅用于演示，非真实证件", font=font(48), fill=(130, 136, 150))
    cx, cy = 1250, 500
    d.ellipse((cx - 110, cy - 230, cx + 110, cy + 10), fill=(166, 171, 180))
    d.ellipse((cx - 230, cy + 50, cx + 230, cy + 470), fill=(166, 171, 180))
    im.save(OUT, quality=95)
    print(OUT)


if __name__ == "__main__":
    main()
