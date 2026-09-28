"""Deterministic frame capture: open the stage, drive the real tool page inside it,
and screenshot one frame at a time on a beat grid. No screen recording, so the same
script always renders the same video."""
import base64
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from playwright.sync_api import sync_playwright

LIB = Path(__file__).parent

HIDE_CSS = """
header, main > a, main > div.mb-8, main > [data-slot=card], main > footer { display:none !important; }
main { padding: 24px 24px 0 !important; max-width: none !important; }
"""


def ease(t):
    return 1 - (1 - t) ** 3


def ease_io(t):
    return 3 * t * t - 2 * t * t * t


@dataclass
class Scene:
    """One shot of the video. `cap` is (number, title, line) or None for the end card."""
    cap: tuple | None
    say: str
    style: str
    act: Callable[["Capture"], None]
    extra_beats: int = 0
    # Filled in by make.py once the narration has been synthesized:
    voice: Path | None = None
    voice_sec: float = 0.0
    start: int = 0  # absolute beat
    beats: int = 0
    ticks: list = field(default_factory=list)


class Capture:
    def __init__(self, frames_dir: Path, *, fps: int, bpm: float, pill: str, app_url: str, url_label: str,
                 steps: int, end: dict, scale: float = 1.2):
        self.dir = frames_dir
        shutil.rmtree(frames_dir, ignore_errors=True)
        frames_dir.mkdir(parents=True)
        self.fps, self.beat = fps, 60 / bpm
        self.cfg = dict(pill=pill, app=app_url, urlLabel=url_label, steps=steps, scale=scale, end=end)
        self.scale = scale
        self.seq: list[list] = []  # [png path, seconds on screen]
        self.ticks: list[float] = []  # seconds where the UI changes -> click sounds
        self.scene_start = 0  # absolute beat of the current scene
        self._n = 0

    # ---- lifecycle
    def open(self):
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.launch()
        # 2× device pixels, screenshots in CSS pixels: text and canvases come out crisp at 1080×1440.
        ctx = self.browser.new_context(viewport={"width": 1080, "height": 1440}, device_scale_factor=2,
                                       color_scheme="dark", accept_downloads=True)
        self.pg = ctx.new_page()
        self.pg.goto((LIB / "stage.html").as_uri())
        self.pg.evaluate("c => setup(c)", self.cfg)
        self.pg.wait_for_load_state("networkidle")
        self.app = next(f for f in self.pg.frames if f.url.startswith(self.cfg["app"]))
        self.app.wait_for_load_state("networkidle")
        self.app.add_style_tag(content=HIDE_CSS)
        self.pg.evaluate("document.fonts.ready")
        self.pg.wait_for_timeout(300)
        return self

    def close(self):
        self.browser.close()
        self._pw.stop()

    # ---- time
    def now(self):
        return sum(s for _, s in self.seq)

    def shot(self, sec=None, settle=False):
        if settle:  # let React commit and the page paint twice before capturing
            self.app.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
        f = self.dir / f"{self._n:05d}.png"
        self._n += 1
        self.pg.screenshot(path=str(f), scale="css")
        self.seq.append([f, 1 / self.fps if sec is None else sec])

    def until(self, beat):
        """Hold the last frame so the next one lands exactly on `beat` of the current scene."""
        assert self.seq, "take a shot before until()"
        target = (self.scene_start + beat) * self.beat
        gap = target - self.now()
        assert gap >= -1e-6, f"timeline overran scene beat {beat} (abs {self.scene_start + beat}) by {-gap:.3f}s"
        self.seq[-1][1] += max(0, gap)

    def tick(self):
        """Mark a UI change at the current moment (becomes a click in the music)."""
        self.ticks.append(self.now())

    # ---- stage helpers
    def js(self, code, arg=None):
        return self.pg.evaluate(code, arg)

    def style(self, el_id, **props):
        self.js("([id, p]) => Object.assign(document.getElementById(id).style, p)", [el_id, props])

    def fade(self, el_id, a, b, frames=8, settle=False):
        for k in range(frames):
            self.style(el_id, opacity=str(a + (b - a) * (k + 1) / frames))
            self.shot(settle=settle)

    def set_caption(self, cap, index):
        num, title, sub = cap
        self.js("""([num, t, s, i]) => {
          document.getElementById('num').textContent = num
          document.getElementById('title').textContent = t
          document.getElementById('sub').textContent = s
          document.querySelectorAll('#steps b').forEach((b, k) => b.classList.toggle('on', k <= i))
        }""", [num, title, sub, index])

    def set_subtitle(self, text):
        self.js("t => document.getElementById('sub-text').textContent = t", text)

    def swap_text(self, cap, index, say, frames=5, first=False):
        """Fade caption and subtitle out and back in with the new scene's text."""
        if first:
            if cap:
                self.set_caption(cap, index)
            self.set_subtitle(say)
            return
        for k in range(frames):
            o = str(1 - (k + 1) / frames)
            self.style("cap", opacity=o)
            self.style("sub-bar", opacity=o)
            self.shot()
        if cap:
            self.set_caption(cap, index)
        else:
            self.js("i => document.querySelectorAll('#steps b').forEach(b => b.classList.add('on'))", index)
        self.set_subtitle(say)
        for k in range(frames):
            o = str((k + 1) / frames)
            if cap:  # the end card has no caption: leave it hidden
                self.style("cap", opacity=o)
            self.style("sub-bar", opacity=o)
            self.shot()

    def inject(self, html, css=""):
        """Add day-specific overlay markup into #layer (above the window, below the end card)."""
        self.js("([h, c]) => { const s = document.createElement('style'); s.textContent = c; document.head.append(s);"
                " document.getElementById('layer').insertAdjacentHTML('beforeend', h) }", [html, css])

    # ---- app helpers
    def app_box(self, selector):
        """Box of an element inside the tool (any Playwright selector), in stage (video) pixels."""
        r = self.app.locator(selector).first.evaluate(
            "e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }")
        f = self.js("() => { const r = document.getElementById('app').getBoundingClientRect(); return [r.x, r.y] }")
        s = self.scale
        return {"x": f[0] + r[0] * s, "y": f[1] + r[1] * s, "width": r[2] * s, "height": r[3] * s}

    def center(self, selector):
        b = self.app_box(selector)
        return b["x"] + b["width"] / 2, b["y"] + b["height"] / 2

    def pop(self, selector_js, frames=6):
        """A light scale bounce (0.965 → 1) on an element inside the tool, e.g. after a UI change."""
        for k in range(frames):
            s = 0.965 + 0.035 * ease((k + 1) / frames)
            self.app.evaluate(f"() => {{ const e = {selector_js}; e.style.transform = 'scale({s})' }}")
            self.shot(settle=k == 0)

    def image_data_url(self, png_bytes, mime="image/png"):
        return f"data:{mime};base64," + base64.b64encode(png_bytes).decode()

    # ---- pointer
    cursor_pos = (540.0, 1100.0)

    def cursor_show(self, x, y, frames=4):
        self.cursor_pos = (x, y)
        self.style("cursor", left=f"{x - 4}px", top=f"{y - 4}px")
        self.fade("cursor", 0, 1, frames)

    def cursor_to(self, x, y, frames=8, drag=False):
        """Glide the drawn cursor to (x, y). With drag=True the real mouse follows, button held."""
        x0, y0 = self.cursor_pos
        for k in range(frames):
            t = ease_io((k + 1) / frames)
            cx, cy = x0 + (x - x0) * t, y0 + (y - y0) * t
            self.style("cursor", left=f"{cx - 4}px", top=f"{cy - 4}px")
            if drag:
                self.pg.mouse.move(cx, cy)
            self.shot(settle=drag)
        self.cursor_pos = (x, y)

    def cursor_press(self, down=True):
        self.style("cursor", transform="scale(0.82)" if down else "scale(1)")

    def click(self, selector, beat, frames=8):
        """Glide the drawn cursor to an element inside the tool, then really click it exactly on `beat`."""
        x, y = self.center(selector)
        self.cursor_to(x, y, frames)
        self.until(beat)
        self.cursor_press(True)
        self.pg.mouse.click(x, y)
        self.tick()
        self.shot(settle=True)
        self.cursor_press(False)
