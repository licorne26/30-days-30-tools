"""Draw the Day 5 demo pictures: an ID-photo style illustration (plain backdrop, a simple
head-and-shoulders silhouette), in plain numpy, on blue, white and red backdrops.

    python promo/assets/idphoto.py   # writes promo/assets/idphoto_{blue,white,red}.jpg

4000×3000, JPG quality 95. Soft gradients plus light sensor-like grain keep each file at a
few MB, like a real phone photo, so the compressor has real work to do. Not committed (too
big); promo/days/day05.py runs this script when the files are missing.
"""
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 4000, 3000
GRAIN = 5.0  # noise sigma; tuned so the blue version is ~3.8 MB
BACKDROPS = {
    "blue": (62, 138, 216),
    "white": (246, 246, 244),
    "red": (204, 38, 46),
}
OUT = Path(__file__).parent


def silhouette():
    """Signed distance (px, negative inside) of head ∪ neck ∪ shoulders, plus a shading term."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)

    def ellipse(cx, cy, rx, ry):
        return (np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) - 1) * min(rx, ry)

    def round_rect(x0, y0, x1, y1, r):
        qx = np.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r)
        qy = np.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r)
        return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r

    def smooth_union(a, b, k):
        h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
        return b + (a - b) * h - k * h * (1 - h)

    head = ellipse(2000, 1130, 450, 560)
    neck = round_rect(1810, 1520, 2190, 1980, 160)
    shoulders = ellipse(2000, 3080, 1320, 1180)
    # Smooth joins read as a neck and trapezius instead of stacked shapes.
    d = smooth_union(smooth_union(head, neck, 60), shoulders, 260)
    # Light from the upper left: brighter toward it, darker toward the lower right.
    light = np.clip(1 - np.hypot(x - 1500, y - 700) / 2600, 0, 1)
    return d, light, x, y


def draw(backdrop, d, light, x, y, rng):
    bg = np.array(backdrop, np.float32)
    # Studio backdrop: a soft glow behind the head, falling off to the corners.
    glow = np.clip(1 - np.hypot(x - 2000, y - 1200) / 2800, 0, 1)[..., None]
    img = bg * (0.9 + 0.14 * glow)
    figure = np.array([44, 50, 64], np.float32) + light[..., None] * np.array([46, 46, 50], np.float32)
    # A darker rim just inside the outline gives the shape some volume.
    rim = np.clip(1 + d / 60, 0, 1)[..., None]
    figure = figure * (1 - 0.35 * rim)
    alpha = np.clip(0.5 - d, 0, 1)[..., None]  # 1 px anti-aliased edge
    img = img * (1 - alpha) + figure * alpha
    img += rng.normal(0, GRAIN, img.shape).astype(np.float32)
    return np.clip(img, 0, 255).astype(np.uint8)


def main():
    d, light, x, y = silhouette()
    for name, color in BACKDROPS.items():
        rng = np.random.default_rng(5)
        out = OUT / f"idphoto_{name}.jpg"
        Image.fromarray(draw(color, d, light, x, y, rng)).save(out, quality=95)
        print(out, f"{out.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
