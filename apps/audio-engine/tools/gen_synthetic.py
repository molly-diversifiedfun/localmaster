"""Generate synthetic test audio for LocalMaster acceptance tests.

All signals are synthesized (tones/noise) — no copyrighted material.
Deterministic: fixed RNG seeds throughout.

Usage: uv run python tools/gen_synthetic.py [out_dir]
Default out_dir: <repo>/examples/generated/
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pyloudnorm
import soundfile as sf

SR = 44100
SEED = 20260704


def pink_noise(n_samples: int, seed: int) -> np.ndarray:
    """Pink (1/f) noise via FFT spectral shaping, mono, unscaled."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal(n_samples)
    spectrum = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n_samples, 1 / SR)
    shaping = np.ones_like(freqs)
    shaping[1:] = 1.0 / np.sqrt(freqs[1:])
    pink = np.fft.irfft(spectrum * shaping, n=n_samples)
    return pink / np.max(np.abs(pink))


def sine(freq: float, seconds: float, amp: float) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    return amp * np.sin(2 * np.pi * freq * t)


def scale_to_lufs(audio: np.ndarray, target_lufs: float) -> np.ndarray:
    """Return a copy gained so integrated loudness == target_lufs."""
    meter = pyloudnorm.Meter(SR)
    measured = meter.integrated_loudness(audio)
    gain_db = target_lufs - measured
    return audio * (10 ** (gain_db / 20))


def songlike(seconds: float, seed: int) -> np.ndarray:
    """Transient-rich stereo synth: kick pulses + hat bursts + pad. Unscaled."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    beat = int(0.5 * SR)  # 120 BPM kicks
    for start in range(0, n - beat, beat):
        dur = int(0.15 * SR)
        seg = np.arange(dur) / SR
        kick = np.sin(2 * np.pi * (55 + 40 * np.exp(-seg * 30)) * seg) * np.exp(-seg * 18)
        out[start : start + dur, 0] += kick
        out[start : start + dur, 1] += kick
    for start in range(beat // 2, n - beat, beat):  # offbeat hats
        dur = int(0.03 * SR)
        burst = rng.standard_normal(dur) * np.exp(-np.arange(dur) / SR * 200)
        out[start : start + dur, 0] += 0.25 * burst
        out[start : start + dur, 1] += 0.22 * burst
    pad = 0.08 * (np.sin(2 * np.pi * 220 * t) + 0.5 * np.sin(2 * np.pi * 331 * t))
    out[:, 0] += pad
    out[:, 1] += 0.9 * pad
    return out / np.max(np.abs(out))


def low_ramp(seconds: float) -> np.ndarray:
    """1 kHz sine at -90 dBFS with a linear fade-in ramp — dither test signal."""
    tone = sine(1000.0, seconds, amp=10 ** (-90 / 20))
    ramp = np.linspace(0.0, 1.0, tone.shape[0])
    return tone * ramp


def write(path: Path, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, audio.astype(np.float32), SR, subtype="FLOAT")
    print(f"wrote {path.name}  ({audio.shape[0] / SR:.0f}s)")


def main(out_dir: Path) -> None:
    write(out_dir / "pink_-20LUFS.wav", scale_to_lufs(pink_noise(30 * SR, SEED), -20.0))
    write(out_dir / "sine_100hz_-6dBFS.wav", sine(100.0, 10.0, amp=0.5))
    write(out_dir / "sine_1khz_-20dBFS.wav", sine(1000.0, 10.0, amp=0.1))
    write(out_dir / "ramp_-90dBFS.wav", low_ramp(10.0))
    write(out_dir / "songlike_30s.wav", scale_to_lufs(songlike(30.0, SEED + 1), -14.0))
    for i, lufs in enumerate([-28.0, -24.0, -20.0, -16.0, -12.0]):
        track = songlike(20.0, SEED + 10 + i)
        write(out_dir / f"album_track{i + 1}_{int(lufs)}LUFS.wav", scale_to_lufs(track, lufs))


if __name__ == "__main__":
    default = Path(__file__).resolve().parents[3] / "examples" / "generated"
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else default)
