"""Draw the Day 6 demo logo: an orange rounded square with a white letter L, in PIL.

    python promo/assets/logo.py   # writes promo/assets/logo.png

The L is two rounded bars, so no font file is needed. Not committed; promo/days/day06.py
runs this script when the file is missing.
"""
from pathlib import Path

from PIL import Image, ImageDraw

S = 4  # supersampling for smooth edges
SIZE = 512
OUT = Path(__file__).with_name("logo.png")


def main():
    n = SIZE * S
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, n - 1, n - 1), radius=112 * S, fill=(249, 115, 22, 255))
    white = (255, 255, 255, 255)
    d.rounded_rectangle((168 * S, 112 * S, 240 * S, 400 * S), radius=20 * S, fill=white)  # stem
    d.rounded_rectangle((168 * S, 328 * S, 368 * S, 400 * S), radius=20 * S, fill=white)  # foot
    im.resize((SIZE, SIZE), Image.LANCZOS).save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
