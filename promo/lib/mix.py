"""Voice + music mix and the final MP4.

1. Lay every narration clip on one 48 kHz voice track at its scene offset.
2. Level: voice ~-18 dBFS RMS, music ~12 dB below it.
3. ffmpeg: duck the music under the voice (sidechaincompress), sum, then two-pass
   loudnorm to -14 LUFS / -1.5 dBTP (measured on the encoded MP4).
4. ffmpeg: frames (concat with per-frame durations) + audio -> H.264 + AAC, +faststart.
"""
import json
import re
import subprocess
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

SR = 48000
VOICE_RMS_DB = -18
MUSIC_BELOW_DB = 12


def _db_to_gain(db):
    return 10 ** (db / 20)


def _rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) + 1e-12


def _read(path):
    sr, x = wavfile.read(str(path))
    x = x.astype(np.float64) / 32768
    return sr, x


def ffmpeg(*args, capture=False):
    r = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-nostats", *map(str, args)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{r.stderr[-3000:]}")
    return r.stderr if capture else None


def voice_track(clips, seconds, path):
    """clips = [(wav path, start seconds)]. Writes a stereo 48 kHz track at VOICE_RMS_DB."""
    track = np.zeros(int(round(seconds * SR)))
    parts = []
    for wav, start in clips:
        sr, x = _read(wav)
        if x.ndim > 1:
            x = x.mean(1)
        if sr != SR:
            g = np.gcd(sr, SR)
            x = resample_poly(x, SR // g, sr // g)
        i = int(round(start * SR))
        j = min(len(track), i + len(x))
        track[i:j] += x[: j - i]
        parts.append(x)
    gain = _db_to_gain(VOICE_RMS_DB) / _rms(np.concatenate(parts))
    track *= gain
    track /= max(1, np.max(np.abs(track)) / 0.97)  # never clip before the mix
    wavfile.write(str(path), SR, (np.stack([track, track], 1) * 32767).astype(np.int16))


def music_track(src, seconds, path):
    """Resample the synth to 48 kHz, fit to length and set it MUSIC_BELOW_DB under the voice."""
    sr, x = _read(src)
    g = np.gcd(sr, SR)
    x = resample_poly(x, SR // g, sr // g, axis=0)
    n = int(round(seconds * SR))
    x = np.pad(x, ((0, max(0, n - len(x))), (0, 0)))[:n]
    x *= _db_to_gain(VOICE_RMS_DB - MUSIC_BELOW_DB) / _rms(x)
    x /= max(1, np.max(np.abs(x)) / 0.97)
    wavfile.write(str(path), SR, (x * 32767).astype(np.int16))


AAC_HEADROOM = 0.5  # AAC encoding overshoots peaks a little; aim lower so the MP4 stays under true_peak


def mix(music, voice, out, target_lufs=-14, true_peak=-1.5):
    duck = ("[1:a]asplit=2[vo][sc];"
            "[0:a][sc]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=350[duck];"
            "[duck][vo]amix=inputs=2:normalize=0[m]")
    pre = Path(out).with_name(Path(out).stem + "_premaster.wav")
    ffmpeg("-i", music, "-i", voice, "-filter_complex", duck, "-map", "[m]", "-ar", SR, pre)

    ln = f"loudnorm=I={target_lufs}:TP={true_peak - AAC_HEADROOM}:LRA=11"
    stats = ffmpeg("-i", pre, "-af", ln + ":print_format=json", "-f", "null", "-", capture=True)
    m = json.loads(re.findall(r"\{[^{}]*\}", stats)[-1])
    ln2 = (f"{ln}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
           f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    ffmpeg("-i", pre, "-af", ln2, "-ar", SR, "-c:a", "pcm_s16le", out)


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBTP) via ffmpeg ebur128."""
    s = ffmpeg("-i", path, "-af", "ebur128=peak=true", "-f", "null", "-", capture=True)
    summary = s[s.rfind("Summary:"):]
    i = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary).group(1))
    return i, tp


def mux(seq, audio, out, fps, seconds):
    """seq = [[png, seconds], ...] from Capture."""
    lst = Path(out).with_suffix(".frames.txt")
    with open(lst, "w") as f:
        for p, sec in seq:
            if sec > 0:
                f.write(f"file '{p}'\nduration {sec:.5f}\n")
        f.write(f"file '{seq[-1][0]}'\n")
    ffmpeg("-f", "concat", "-safe", "0", "-i", lst, "-i", audio,
           "-vf", f"fps={fps},format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
           "-c:a", "aac", "-b:a", "192k", "-t", f"{seconds:.3f}", "-movflags", "+faststart", out)
