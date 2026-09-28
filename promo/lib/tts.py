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
        "voice": os.environ.get("GEMINI_TTS_VOICE", "Puck"),
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


if __name__ == "__main__":
    path, sec = speak(sys.argv[1] if len(sys.argv) > 1 else "你好，这是一句测试。", sys.argv[2] if len(sys.argv) > 2 else "")
    print(path, f"{sec:.2f}s")
