"""Gemini text-to-speech with a local cache.

API: https://ai.google.dev/gemini-api/docs/generate-content/speech-generation
The key comes from GEMINI_API_KEY in the repo-root .env (or the environment).
"""
import base64
import hashlib
import io
import os
import sys
import wave
from pathlib import Path

import numpy as np
import requests

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "promo" / ".cache" / "tts"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
RATE = 24000  # Gemini TTS: 24 kHz, mono, 16-bit
SILENCE_DB = -45
DEFAULT_STYLE = "用平稳、清晰、语速适中的语气做产品讲解，像一段专业的演示旁白。整段保持同一种音色和情绪，不要夸张，不要忽高忽低。"


def _env():
    """Read KEY=VALUE lines from the repo-root .env without overriding real environment variables."""
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def settings():
    _env()
    return {
        "key": os.environ.get("GEMINI_API_KEY", ""),
        "model": os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts"),
        "voice": os.environ.get("GEMINI_TTS_VOICE", "Charon"),
    }


def _to_pcm(audio: bytes) -> np.ndarray:
    """Decode WAV (normally) or header-less 16-bit PCM (fallback) into int16 samples at 24 kHz."""
    if audio[:4] == b"RIFF":
        with wave.open(io.BytesIO(audio)) as w:
            assert w.getsampwidth() == 2, "expected 16-bit audio"
            pcm = np.frombuffer(w.readframes(w.getnframes()), np.int16)
            if w.getnchannels() > 1:
                pcm = pcm.reshape(-1, w.getnchannels()).mean(1).astype(np.int16)
            assert w.getframerate() == RATE, f"unexpected sample rate {w.getframerate()}"
            return pcm
    return np.frombuffer(audio[: len(audio) // 2 * 2], np.int16)


def _write_wav(path: Path, pcm: np.ndarray):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.astype(np.int16).tobytes())


def _trim(pcm: np.ndarray, pad=0.03) -> np.ndarray:
    """Cut leading and trailing silence below SILENCE_DB (10 ms windows), keeping a tiny pad."""
    win = RATE // 100
    n = len(pcm) // win
    if n == 0:
        return pcm
    frames = pcm[: n * win].astype(np.float64).reshape(n, win) / 32768
    db = 20 * np.log10(np.sqrt((frames**2).mean(1)) + 1e-12)
    loud = np.nonzero(db > SILENCE_DB)[0]
    if not len(loud):
        return pcm
    p = int(pad * RATE)
    return pcm[max(0, loud[0] * win - p) : min(len(pcm), (loud[-1] + 1) * win + p)]


def speak(text: str, style: str = "") -> tuple[Path, float]:
    """Return (path to a trimmed 24 kHz mono WAV, duration in seconds). Cached by model+voice+style+text."""
    s = settings()
    key = hashlib.sha1("\n".join([s["model"], s["voice"], style, text]).encode()).hexdigest()
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"{key}.wav"
    if not out.exists():
        if not s["key"]:
            sys.exit(f"GEMINI_API_KEY is not set. Put GEMINI_API_KEY=... in {ROOT / '.env'} (see promo/README.md).")
        part = {"text": text}
        if style:
            part["speech_metadata"] = {"style": style}
        body = {
            "contents": [{"role": "user", "parts": [part]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"voice": s["voice"]}}},
        }
        r = requests.post(ENDPOINT.format(model=s["model"]), json=body, timeout=120,
                          headers={"x-goog-api-key": s["key"], "Content-Type": "application/json"})
        if r.status_code != 200:
            sys.exit(f"Gemini TTS failed ({r.status_code}) for {text!r}:\n{r.text[:1500]}")
        try:
            data = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
        except (KeyError, IndexError) as e:
            sys.exit(f"Gemini TTS returned no audio ({e!r}):\n{r.text[:1500]}")
        raw = CACHE / f"{key}.raw.wav"
        _write_wav(raw, _to_pcm(base64.b64decode(data)))
        _write_wav(out, _trim(_to_pcm(raw.read_bytes())))
    with wave.open(str(out)) as w:
        return out, w.getnframes() / w.getframerate()


def _silent_runs(pcm: np.ndarray, min_sec: float):
    """(start, end) sample ranges quieter than SILENCE_DB for at least min_sec, 10 ms resolution."""
    win = RATE // 100
    n = len(pcm) // win
    frames = pcm[: n * win].astype(np.float64).reshape(n, win) / 32768
    quiet = 20 * np.log10(np.sqrt((frames**2).mean(1)) + 1e-12) <= SILENCE_DB
    runs, i = [], 0
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            if (j - i) * win >= min_sec * RATE:
                runs.append((i * win, j * win))
            i = j
        else:
            i += 1
    return runs


def speak_script(lines: list[str], style: str = "") -> list[tuple[Path, float]]:
    """Synthesize the whole narration in ONE request so every line has the same voice and tone,
    then cut it at the pauses between lines. Falls back to one request per line (same style)
    if the pauses can't be found cleanly."""
    s = settings()
    key = hashlib.sha1("\n".join([s["model"], s["voice"], style, "script", *lines]).encode()).hexdigest()
    outs = [CACHE / f"{key}.{i:02d}.wav" for i in range(len(lines))]
    if not all(o.exists() for o in outs):
        full, _ = speak(" <long pause> ".join(lines), style)
        pcm = _to_pcm(full.read_bytes())
        # The N-1 longest pauses are the line breaks.
        runs = sorted(_silent_runs(pcm, 0.18), key=lambda r: r[1] - r[0], reverse=True)[: len(lines) - 1]
        runs.sort()
        segs = []
        if len(runs) == len(lines) - 1:
            cuts = [0] + [(a + b) // 2 for a, b in runs] + [len(pcm)]
            segs = [_trim(pcm[cuts[i] : cuts[i + 1]]) for i in range(len(lines))]
            # Sanity check: seconds per character should be similar for every line.
            rates = [len(seg) / RATE / max(1, len(t)) for seg, t in zip(segs, lines)]
            med = sorted(rates)[len(rates) // 2]
            if any(r < med * 0.55 or r > med * 1.8 for r in rates):
                segs = []
        if not segs:
            print("tts: could not split the one-take narration cleanly, falling back to one request per line")
            return [speak(t, style) for t in lines]
        CACHE.mkdir(parents=True, exist_ok=True)
        for o, seg in zip(outs, segs):
            _write_wav(o, seg)
    res = []
    for o in outs:
        with wave.open(str(o)) as w:
            res.append((o, w.getnframes() / w.getframerate()))
    return res


if __name__ == "__main__":
    path, sec = speak(sys.argv[1] if len(sys.argv) > 1 else "你好，这是一句测试。", sys.argv[2] if len(sys.argv) > 2 else "")
    print(path, f"{sec:.2f}s")
