"""Draw the Day 4 demo picture: a 16:10 sunset over mountains and a lake, in plain numpy.

    python promo/assets/landscape.py   # writes promo/assets/landscape.jpg (needs ffmpeg)

Drawn on a 1600×1000 design grid and rendered at S× that. 4000×2500 keeps every 3×3 cell
above the tool's 600 px "blurry" threshold even after zooming in a little in the demo.
"""
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

import numpy as np

S = 2.5
W, H = int(1600 * S), int(1000 * S)
HORIZON = int(700 * S)  # lake line
rng = np.random.default_rng(4)
y, x = (np.mgrid[0:H, 0:W] / S).astype(np.float32)  # design-grid coordinates


def lerp_stops(t, stops):
    """Piecewise-linear colour ramp: stops = [(t, (r, g, b)), ...]."""
    ts = [s for s, _ in stops]
    return np.stack([np.interp(t, ts, [c[i] for _, c in stops]) for i in range(3)], -1)


# Sky: deep indigo at the top, rose in the middle, warm peach at the horizon.
sky = lerp_stops(y / 700, [(0, (28, 30, 74)), (0.42, (122, 72, 128)), (0.75, (238, 128, 110)), (1, (255, 196, 138))])

# Sun low over the ridge, with a wide soft glow.
SX, SY, SR = 1030, 470, 66  # design grid
d = np.hypot(x - SX, y - SY)
sky += (np.clip(1 - d / 620, 0, 1) ** 2.2)[..., None] * np.array([70, 48, 12])
sun = np.clip((SR - d) * S + 0.5, 0, 1)[..., None]
img = sky * (1 - sun) + np.array([255, 240, 206]) * sun

# A few faint stars in the dark part of the sky.
for _ in range(90):
    sx, sy = rng.integers(0, W - 2), rng.integers(0, int(230 * S))
    img[sy : sy + 2, sx : sx + 2] = np.minimum(255, img[sy : sy + 2, sx : sx + 2] + rng.uniform(40, 110))


def ridge(base, amp, seed, octaves=6):
    r = np.random.default_rng(seed)
    xs = np.arange(W) / W
    h = np.zeros(W)
    for k in range(1, octaves + 1):
        h += np.sin(xs * np.pi * (1.3 * k + r.uniform(0, 1)) + r.uniform(0, 6.28)) / k**1.25
    return base - amp * h


# Mountain layers, far to near: lighter and hazier in the distance.
for base, amp, col, seed in [
    (560, 70, (176, 98, 124), 11),
    (610, 60, (124, 64, 108), 12),
    (660, 48, (76, 40, 82), 13),
    (705, 30, (44, 26, 56), 14),
]:
    top = ridge(base, amp, seed)[None, :]
    cover = np.clip((y - top) * S + 0.5, 0, 1)[..., None]  # anti-aliased edge
    shade = np.clip((y - top) / 260, 0, 1)[..., None] * 0.25  # darker toward the foot
    img = img * (1 - cover) + (np.array(col) * (1 - shade)) * cover

# Lake: mirrored scene, darkened and tinted, with horizontal shimmer.
lake_h = H - HORIZON
mirror = img[HORIZON - lake_h : HORIZON][::-1].copy()
depth = (np.arange(lake_h) / lake_h)[:, None, None]
mirror = mirror * (0.72 - 0.25 * depth) + np.array([18, 22, 52]) * (0.28 + 0.25 * depth)
for r in range(lake_h):  # gentle ripple: shift each row a little
    mirror[r] = np.roll(mirror[r], int(round(np.sin(r / S * 0.21) * (1 + r / S / 60) * S)), axis=0)
for _ in range(260):  # glints under the sun, wider further from the shore
    r = int(rng.uniform(4 * S, lake_h - 2 * S))
    cx = rng.normal(SX, 50 + r / S * 0.9) * S
    half = rng.uniform(8, 40) * (0.5 + r / lake_h) * S
    xs = np.arange(max(0, int(cx - half)), min(W, int(cx + half)))
    if len(xs):
        fall = np.exp(-abs(cx / S - SX) / 220) * rng.uniform(0.3, 1)
        mirror[r : r + int(S), xs] += fall * 110 * (1 - np.abs(xs - cx) / half)[:, None] * np.array([1, 0.82, 0.6])
img[HORIZON:] = mirror

# Birds: small arcs over the sun.
for bx, by, s in [(870, 330, 11), (905, 350, 8), (940, 322, 9), (1180, 300, 7)]:
    t = np.linspace(-1, 1, 120)
    for side in (-1, 1):
        for w in range(int(S)):  # stroke width
            px = ((bx + side * s * (t + 1) / 2) * S).astype(int)
            py = ((by - s * 0.45 * np.sin((t + 1) / 2 * np.pi)) * S).astype(int) + w
            img[py, px] = img[py, px] * 0.3 + np.array([40, 24, 48]) * 0.7

img = np.clip(img + rng.normal(0, 1.4, img.shape), 0, 255).astype(np.uint8)


def write_png(path, rgb):
    h, w, _ = rgb.shape
    raw = b"".join(b"\x00" + rgb[r].tobytes() for r in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    Path(path).write_bytes(png)


out = Path(__file__).with_name("landscape.jpg")
with tempfile.TemporaryDirectory() as tmp:
    png = Path(tmp) / "landscape.png"
    write_png(png, img)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(png), "-q:v", "2", str(out)], check=True)
print(out)
