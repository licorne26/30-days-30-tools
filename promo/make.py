"""Render one day's promo video and cover.

    python promo/make.py day04 [--no-build] [--no-cover]

Pipeline: narration (Gemini TTS, cached) -> timeline on the beat grid -> frame capture of the
real tool -> synthesized music -> ducked mix + loudness -> MP4, then the cover via Day 3.
Outputs land in promo/out/.
"""
import argparse
import importlib
import math
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

PROMO = Path(__file__).resolve().parent
ROOT = PROMO.parent
sys.path.insert(0, str(ROOT))

from promo.lib import cover, mix, music, tts  # noqa: E402
from promo.lib.capture import Capture  # noqa: E402

FPS = 30
PORT = 4317
BASE = f"http://localhost:{PORT}/"
LEAD = 0.2  # narration starts this long after its scene
PAD = 0.6  # scene = narration + PAD, rounded up to whole beats


def serve():
    proc = subprocess.Popen(["npm", "run", "preview", "--", "--port", str(PORT), "--strictPort"], cwd=ROOT,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try:
            urllib.request.urlopen(BASE, timeout=1)
            return proc
        except OSError:
            time.sleep(0.2)
    proc.terminate()
    sys.exit(f"preview server did not come up on {BASE} (is port {PORT} taken?)")


def plan(day):
    """Synthesize every line, then size each scene to its narration on the beat grid."""
    beat = 60 / day.BPM
    start = 0
    # One take for the whole script keeps the voice and tone steady from line to line.
    voices = tts.speak_script([s.say for s in day.SCENES], getattr(day, "STYLE", tts.DEFAULT_STYLE))
    for s, (path, sec) in zip(day.SCENES, voices):
        s.voice, s.voice_sec = path, sec
    for s in day.SCENES:
        s.beats = math.ceil((s.voice_sec + PAD) / beat - 1e-9) + s.extra_beats
        s.start, start = start, start + s.beats
    return start


def report(day, total):
    beat = 60 / day.BPM
    print(f"\n{'scene':<6}{'beats':>12}{'start':>9}{'end':>9}{'voice':>18}{'spare':>8}")
    for i, s in enumerate(day.SCENES, 1):
        a, b = s.start * beat, (s.start + s.beats) * beat
        v0, v1 = a + LEAD, a + LEAD + s.voice_sec
        assert v1 <= b + 1e-6, f"scene {i}: narration runs past the scene end"
        print(f"{i:<6}{f'{s.start}-{s.start + s.beats}':>12}{a:>8.2f}s{b:>8.2f}s"
              f"{f'{v0:.2f}-{v1:.2f}s ({s.voice_sec:.2f})':>18}{b - v1:>7.2f}s")
    print(f"total {total} beats = {total * beat:.2f}s at {day.BPM} BPM\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day", help="module in promo/days, e.g. day04")
    ap.add_argument("--no-build", action="store_true", help="skip npm run build")
    ap.add_argument("--no-cover", action="store_true")
    args = ap.parse_args()

    day = importlib.import_module(f"promo.days.{args.day}")
    out = PROMO / "out"
    work = out / args.day
    work.mkdir(parents=True, exist_ok=True)
    beat = 60 / day.BPM

    total = plan(day)
    report(day, total)

    if not args.no_build:
        subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    server = serve()
    try:
        c = Capture(work / "frames", fps=FPS, bpm=day.BPM, pill=day.PILL, app_url=BASE + day.APP + "/",
                    url_label=day.URL_LABEL, steps=len(day.SCENES), end=day.END).open()
        day.setup(c)
        for i, s in enumerate(day.SCENES):
            c.scene_start = s.start
            if i:
                c.until(0)
            c.swap_text(s.cap, i, s.say, first=i == 0)
            n = len(c.ticks)
            s.act(c)
            s.ticks = c.ticks[n:]
            c.until(s.beats)
        seconds = c.now()
        assert abs(seconds - total * beat) < 1e-6, (seconds, total * beat)
        print(f"captured {len(c.seq)} frames, {seconds:.2f}s, {len(c.ticks)} UI ticks")
        c.close()

        synth = work / "music.wav"
        music.render(synth, bpm=day.BPM, total_beats=total, chords=day.CHORDS,
                     drums=(day.SCENES[1].start, day.SCENES[-1].start), ticks=c.ticks)
        voice, bed, final = work / "voice.wav", work / "music_48k.wav", work / "final.wav"
        mix.voice_track([(s.voice, s.start * beat + LEAD) for s in day.SCENES], seconds, voice)
        mix.music_track(synth, seconds, bed)
        mix.mix(bed, voice, final)
        mp4 = out / f"{args.day}.mp4"
        mix.mux(c.seq, final, mp4, FPS, seconds)
        lufs, tp = mix.loudness(mp4)
        print(f"{mp4}  {seconds:.2f}s  {lufs:.1f} LUFS  true peak {tp:.1f} dBTP")

        if not args.no_cover:
            jpg = cover.make_cover(BASE, out / f"{args.day}_cover.jpg", **day.COVER)
            print(jpg)
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
