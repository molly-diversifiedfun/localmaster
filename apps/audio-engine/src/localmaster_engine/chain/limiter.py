"""Lookahead peak limiter with oversampled (4x) inter-sample peak detection.

Design: per-sample required gain from the oversampled peak envelope, sliding
minimum over the lookahead window, Hann smoothing (guarantees no overshoot at
the detected envelope: each smoothed value is a mean of window-minima that all
cover the current sample), then a block-rate one-pole release. A small safety
margin (0.1 dB) absorbs residual inter-sample error from the final resampling.
Limitation (labeled): detection is 4x-oversampled rather than a full true-peak
reconstruction limiter; the margin + tests keep output under the ceiling.
"""
from __future__ import annotations

import numpy as np
from scipy import signal
from scipy.ndimage import minimum_filter1d

SAFETY_DB = 0.1
OVERSAMPLE = 4
RELEASE_BLOCK = 64
EPS = 1e-12


def _peak_envelope(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    """Per-base-sample peak magnitude including 4x inter-sample detection."""
    up = signal.resample_poly(samples, OVERSAMPLE, 1, axis=0)
    n = samples.shape[0]
    up = up[: n * OVERSAMPLE]
    if up.shape[0] < n * OVERSAMPLE:
        up = np.pad(up, ((0, n * OVERSAMPLE - up.shape[0]), (0, 0)))
    linked = np.max(np.abs(up), axis=1)
    return linked.reshape(n, OVERSAMPLE).max(axis=1)


def _release_smooth(gain: np.ndarray, sample_rate: int, release_ms: float) -> np.ndarray:
    """Slow upward gain recovery at block rate; downward stays instant."""
    n_blocks = int(np.ceil(gain.shape[0] / RELEASE_BLOCK))
    padded = np.pad(gain, (0, n_blocks * RELEASE_BLOCK - gain.shape[0]), constant_values=1.0)
    block_min = padded.reshape(n_blocks, RELEASE_BLOCK).min(axis=1)
    coef = float(np.exp(-(RELEASE_BLOCK / sample_rate) / max(release_ms / 1000, 1e-4)))
    out = np.empty_like(block_min)
    env = 1.0
    for i, g in enumerate(block_min):
        env = g if g < env else coef * env + (1 - coef) * g
        out[i] = env
    centers = np.arange(n_blocks) * RELEASE_BLOCK + RELEASE_BLOCK / 2
    per_sample = np.interp(np.arange(gain.shape[0]), centers, out)
    return np.minimum(gain, per_sample)


def process(
    samples: np.ndarray,
    sample_rate: int,
    *,
    ceiling_dbtp: float = -1.0,
    lookahead_ms: float = 5.0,
    release_ms: float = 80.0,
) -> tuple[np.ndarray, dict]:
    ceiling = 10 ** ((ceiling_dbtp - SAFETY_DB) / 20)
    envelope = _peak_envelope(samples, sample_rate)
    required = np.minimum(1.0, ceiling / np.maximum(envelope, EPS))
    window = max(int(lookahead_ms / 1000 * sample_rate) | 1, 3)
    lows = minimum_filter1d(required, size=window, mode="nearest")
    hann = np.hanning(window)
    smoothed = signal.fftconvolve(np.pad(lows, window // 2, mode="edge"), hann / hann.sum(), mode="same")
    smoothed = smoothed[window // 2 : window // 2 + required.shape[0]]
    gain = np.minimum(smoothed, required)
    gain = _release_smooth(gain, sample_rate, release_ms)
    out = np.clip(samples * gain[:, None], -ceiling, ceiling)
    max_gr = float(-20 * np.log10(max(np.min(gain), EPS)))
    sustained_gr = float(-20 * np.log10(max(np.percentile(gain, 0.5), EPS)))
    meta = {
        "stage": "limiter",
        "ceiling_dbtp": ceiling_dbtp,
        "max_gain_reduction_db": round(max_gr, 2),
        "sustained_gain_reduction_db": round(sustained_gr, 2),
        "lookahead_ms": lookahead_ms,
        "release_ms": release_ms,
        "detection": "4x-oversampled peak (not full true-peak reconstruction)",
    }
    return out, meta
