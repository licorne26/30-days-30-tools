"""Day 11 demo pictures: two obviously fake sample cards (front from idcard.py, plus a back drawn here),
each "photographed" onto a desk with a known perspective, like a crooked phone photo.

    python promo/assets/idshots.py [out_dir]

writes idshot_front.jpg, idshot_back.jpg (1600×1200), the flat cards (idcard_front.png, idcard_back.png,
1011×638 = 85.6 × 54 mm at 300 dpi) and idshots.json with the true corner positions as fractions of the photo
(top-left, top-right, bottom-right, bottom-left). Not committed; promo/days/day11.py runs this when files are missing.

Both cards say "样例证件 SAMPLE"; made-up name and all-zero numbers; no real layout, emblem or official mark.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import idcard  # noqa: E402  (Day 8 sample card)

CARD = (1011, 638)
PHOTO = (1600, 1200)
# Where the card corners land in the photo, as fractions (tl, tr, br, bl): front is turned a few degrees and
# seen from one side, back is leaning the other way.
QUADS = {
    "front": [(0.17, 0.2), (0.86, 0.12), (0.9, 0.72), (0.12, 0.8)],
    "back": [(0.12, 0.17), (0.88, 0.22), (0.83, 0.8), (0.15, 0.74)],
}


def front_card():
    idcard.main()
    return Image.open(idcard.OUT).convert("RGB").resize(CARD, Image.LANCZOS)


def back_card():
    f = idcard.font
    im = Image.new("RGB", (1600, 1009), (236, 240, 246))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((40, 40, 1560, 969), radius=44, fill=(250, 251, 253), outline=(186, 195, 209), width=4)
    d.rectangle((40, 130, 1560, 250), fill=(96, 108, 128))
    d.rounded_rectangle((90, 300, 1000, 430), radius=24, fill=(255, 237, 213), outline=(234, 140, 40), width=5)
    d.text((125, 320), "样例证件 SAMPLE", font=f(80), fill=(180, 83, 9))
    d.text((100, 500), "签发机关　样例办证中心", font=f(62), fill=(40, 44, 56))
    d.text((100, 610), "有效期限　2000.01.01—2099.12.31", font=f(62), fill=(40, 44, 56))
    d.text((100, 780), "仅用于演示，非真实证件（反面）", font=f(48), fill=(130, 136, 150))
    for i in range(46):  # a grey bar pattern, not a real code
        x = 100 + i * 31
        d.rectangle((x, 860, x + (8 if i % 3 else 17), 940), fill=(120, 126, 140))
    return im.resize(CARD, Image.LANCZOS)


def desk(seed, size=PHOTO):
    rng = np.random.default_rng(seed)
    w, h = size
    y = np.linspace(0, 1, h)[:, None]
    x = np.linspace(0, 1, w)[None, :]
    base = np.stack([150 + 30 * y + 10 * x, 108 + 24 * y + 8 * x, 74 + 16 * y + 0 * x], axis=-1)
    grain = np.sin((y * 90 + np.sin(x * 7) * 1.5) * 2 * np.pi) * 5  # faint wood grain
    arr = base + grain[..., None] + rng.normal(0, 3, (h, w, 1))
    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))


def coeffs(quad, size):
    """PIL wants the map from output (photo) pixels back to source (card) pixels."""
    w, h = size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    A, b = [], []
    for (X, Y), (x, y) in zip(quad, src):
        A.append([X, Y, 1, 0, 0, 0, -x * X, -x * Y])
        A.append([0, 0, 0, X, Y, 1, -y * X, -y * Y])
        b += [x, y]
    return np.linalg.solve(np.array(A, float), np.array(b, float)).tolist()


def shoot(card, quad_frac, seed, size=PHOTO):
    w, h = size
    quad = [(x * w, y * h) for x, y in quad_frac]
    bg = desk(seed, size)
    k = coeffs(quad, card.size)
    layer = card.transform(size, Image.PERSPECTIVE, k, Image.BICUBIC)
    mask = Image.new("L", card.size, 255).transform(size, Image.PERSPECTIVE, k, Image.BILINEAR)
    shadow = mask.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.5))
    bg.paste(Image.new("RGB", size, (30, 20, 10)), (14, 22), shadow)
    bg.paste(layer, (0, 0), mask)
    arr = np.asarray(bg).astype(float) + np.random.default_rng(seed + 1).normal(0, 2.5, (h, w, 1))
    return Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))


def main(out=HERE, size=PHOTO):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    cards = {"front": front_card(), "back": back_card()}
    meta = {}
    for i, (face, card) in enumerate(cards.items()):
        card.save(out / f"idcard_{face}.png")
        shoot(card, QUADS[face], 11 + i, size).save(out / f"idshot_{face}.jpg", quality=92)
        meta[face] = QUADS[face]
    (out / "idshots.json").write_text(json.dumps(meta))
    print(out)


if __name__ == "__main__":
    main(*(sys.argv[1:2] or []))
