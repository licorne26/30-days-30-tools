"""Synthesized soundtrack in pure numpy/scipy: no samples, no loops.

  pad        detuned additive saw, low-passed, one chord per bar (4 beats)
  arpeggio   Karplus–Strong plucks, eighth notes, until the outro
  drums      four-on-the-floor kick, off-beat hats, claps on 2 and 4, between drums=(start, end) beats
  outro      from drums[1]: drums stop, the final chord rings out
  ticks      a soft 2.4 kHz click at each given time (seconds), for UI changes
"""
import re

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
QUALITY = {
    "": [0, 4, 7, 12], "m": [0, 3, 7, 12], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10],
    "6": [0, 4, 7, 9], "m6": [0, 3, 7, 9], "sus2": [0, 2, 7, 12], "sus4": [0, 5, 7, 12], "add9": [0, 4, 7, 14],
    "9": [0, 4, 10, 14], "maj9": [0, 4, 11, 14], "m9": [0, 3, 10, 14],
}


def chord(name: str) -> list[int]:
    """'Dm7' -> MIDI notes, root kept between A2 and G#3 so the progression voice-leads smoothly."""
    m = re.fullmatch(r"([A-G])([b#]?)(.*)", name)
    if not m or m.group(3) not in QUALITY:
        raise ValueError(f"unknown chord {name!r}")
    root = NOTE[m.group(1)] + {"b": -1, "#": 1, "": 0}[m.group(2)]
    root = 45 + (root - 45) % 12  # 45 = A2
    return [root + i for i in QUALITY[m.group(3)]]


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def env_adsr(n, a, d, s, r):
    a, d, r = int(a * SR), int(d * SR), min(n, int(r * SR))
    e = np.full(n, s, dtype=float)
    e[: min(a, n)] = np.linspace(0, 1, a, endpoint=False)[:n]
    e[a : a + d] = np.linspace(1, s, d, endpoint=False)[: max(0, min(d, n - a))]
    if r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def render(path, *, bpm, total_beats, chords, drums, ticks=(), final=None, seed=7):
    """Write a stereo 44.1 kHz WAV exactly total_beats long. `final` = the chord that rings out (default: the first)."""
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    N = int(round(total_beats * beat * SR))
    out = np.zeros(N + SR * 3)  # room for tails, cut at the end
    at = lambda b: int(round(b * beat * SR))

    def add(sig, b, gain=1.0):
        i = at(b)
        j = min(len(out), i + len(sig))
        if i < j:
            out[i:j] += sig[: j - i] * gain

    prog = [chord(c) for c in chords]
    final_notes = chord(final) if final else prog[0]
    d0, d1 = drums

    def pad(notes, beats):
        n = int(beats * beat * SR)
        t = np.arange(n) / SR
        s = np.zeros(n)
        for m in notes:
            for det in (-0.08, 0.08):
                f = midi(m + det)
                for h in range(1, 7):
                    s += np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28)) / h
        s = lp(s, 1400) / (len(notes) * 6)
        sub = np.sin(2 * np.pi * midi(notes[0] - 12) * t) * 0.35  # soft bass under the root
        return (s + sub) * env_adsr(n, 0.35, 0.3, 0.8, 0.5)

    # Bars before the outro cycle through the progression; the outro holds the final chord.
    bar = 0
    while bar * 4 < d1:
        length = min(4, d1 - bar * 4)
        add(pad(prog[bar % len(prog)], length + 0.4), bar * 4, 0.9)
        bar += 1
    tail = total_beats - d1
    add(pad(final_notes, tail + 4) * np.linspace(1, 0.6, int((tail + 4) * beat * SR)), d1, 0.95)

    pluck_cache = {}

    def pluck(note, dur=0.6):
        if note not in pluck_cache:
            n, p = int(dur * SR), int(SR / midi(note))
            buf = rng.uniform(-1, 1, p)
            y = np.zeros(n)
            for i in range(n):
                y[i] = buf[i % p]
                buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.996
            pluck_cache[note] = lp(y, 5000) * np.linspace(1, 0.2, n)
        return pluck_cache[note]

    PATTERN = [0, 2, 1, 3, 2, 1, 3, 2]
    b = 0.0
    while b < d1:
        notes = prog[int(b // 4) % len(prog)]
        k = int(round(b * 2)) % 8
        add(pluck(notes[PATTERN[k] % len(notes)] + 12), b, 0.5 if k % 2 == 0 else 0.36)
        b += 0.5
    for k, idx in enumerate([0, 1, 2, 3, 2]):  # slow last arpeggio over the final chord
        add(pluck(final_notes[idx] + 12, 1.2), d1 + k, 0.4 * (1 - k * 0.12))

    def kick():
        n = int(0.45 * SR)
        t = np.arange(n) / SR
        f = 50 + 110 * np.exp(-t * 28)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)

    def hat():
        n = int(0.06 * SR)
        return hp(rng.uniform(-1, 1, n), 7000) * np.exp(-np.arange(n) / SR * 70)

    def clap():
        n = int(0.22 * SR)
        t = np.arange(n) / SR
        body = sosfilt(butter(2, [900, 2600], "band", fs=SR, output="sos"), rng.uniform(-1, 1, n))
        e = np.exp(-t * 22)
        for d in (0.0, 0.011, 0.022):
            e += np.exp(-np.clip(t - d, 0, None) * 180) * (t >= d)
        return body * e * 0.5

    K, H, C = kick(), hat(), clap()
    for b in range(d0, d1):
        add(K, b, 0.42)
        add(H, b + 0.5, 0.12)
        if b % 2 == 1:  # beats 2 and 4 of each bar
            add(C, b, 0.2)
    for b in (d1 - 1, d1 - 0.75, d1 - 0.5, d1 - 0.25):  # fill into the outro
        add(C, b, 0.14)
    add(K, d1, 0.45)

    n = int(0.05 * SR)
    t = np.arange(n) / SR
    click = np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 90)
    for sec in ticks:
        add(click, sec / beat, 0.16)

    # Room: a different noise reverb per side. That gives width without the comb filtering a
    # channel delay causes when a phone speaker sums the two sides to mono.
    ir_n = int(1.4 * SR)
    dry = out / (np.max(np.abs(out)) + 1e-9)
    sides = []
    for _ in range(2):
        ir = lp(rng.uniform(-1, 1, ir_n) * np.exp(-np.arange(ir_n) / SR * 4.2), 5000)
        wet = fftconvolve(out, ir)[: len(out)]
        sides.append((dry + 0.18 * wet / (np.max(np.abs(wet)) + 1e-9))[:N])
    stereo = np.stack(sides, axis=1)

    fi, fo = int(0.05 * SR), int(min(2.0, total_beats * beat / 4) * SR)
    stereo[:fi] *= np.linspace(0, 1, fi)[:, None]
    stereo[-fo:] *= (np.linspace(1, 0, fo) ** 1.5)[:, None]
    stereo = np.tanh(stereo * 1.1)
    stereo = stereo / np.max(np.abs(stereo)) * 0.89
    wavfile.write(str(path), SR, (stereo * 32767).astype(np.int16))
    return N / SR
