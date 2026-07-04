"""Stereo width (M/S) + mono-bass below a Linkwitz-Riley crossover."""
from __future__ import annotations

import numpy as np
from scipy import signal


def _lr4(samples: np.ndarray, sample_rate: int, cutoff_hz: float, btype: str) -> np.ndarray:
    sos = signal.butter(2, cutoff_hz, btype=btype, fs=sample_rate, output="sos")
    once = signal.sosfilt(sos, samples, axis=0)
    return np.asarray(signal.sosfilt(sos, once, axis=0))


def process(
    samples: np.ndarray,
    sample_rate: int,
    *,
    width: float = 1.0,
    mono_bass_hz: float = 100.0,
) -> tuple[np.ndarray, dict]:
    if samples.shape[1] < 2:
        return samples.copy(), {"stage": "stereo", "skipped": "mono input"}
    lows = _lr4(samples, sample_rate, mono_bass_hz, "lowpass")
    highs = _lr4(samples, sample_rate, mono_bass_hz, "highpass")
    lows_mono = np.mean(lows, axis=1, keepdims=True)
    mid = np.mean(highs, axis=1, keepdims=True)
    side = (highs[:, :1] - highs[:, 1:]) / 2 * width
    highs_out = np.hstack([mid + side, mid - side])
    out = np.repeat(lows_mono, 2, axis=1) + highs_out
    return out, {"stage": "stereo", "width": width, "mono_bass_hz": mono_bass_hz}
