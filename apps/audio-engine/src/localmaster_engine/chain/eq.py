"""Corrective/tonal EQ: cascade of RBJ-cookbook biquads (peaking + shelves)."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import signal


@dataclass(frozen=True)
class EqBand:
    freq_hz: float
    gain_db: float
    q: float = 0.707
    kind: str = "peaking"  # peaking | low_shelf | high_shelf


def _peaking(f: float, gain_db: float, q: float, fs: int) -> np.ndarray:
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / fs
    alpha = np.sin(w) / (2 * q)
    b = [1 + alpha * a, -2 * np.cos(w), 1 - alpha * a]
    den = [1 + alpha / a, -2 * np.cos(w), 1 - alpha / a]
    return np.array(b + den)


def _shelf(f: float, gain_db: float, q: float, fs: int, high: bool) -> np.ndarray:
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / fs
    cos_w, alpha = np.cos(w), np.sin(w) / (2 * q)
    two_sqrt_a_alpha = 2 * np.sqrt(a) * alpha
    sign = 1 if high else -1
    b0 = a * ((a + 1) + sign * (a - 1) * cos_w + two_sqrt_a_alpha)
    b1 = -2 * sign * a * ((a - 1) + sign * (a + 1) * cos_w)
    b2 = a * ((a + 1) + sign * (a - 1) * cos_w - two_sqrt_a_alpha)
    a0 = (a + 1) - sign * (a - 1) * cos_w + two_sqrt_a_alpha
    a1 = 2 * sign * ((a - 1) - sign * (a + 1) * cos_w)
    a2 = (a + 1) - sign * (a - 1) * cos_w - two_sqrt_a_alpha
    return np.array([b0, b1, b2, a0, a1, a2])


def _band_sos(band: EqBand, fs: int) -> np.ndarray:
    if band.kind == "peaking":
        coeffs = _peaking(band.freq_hz, band.gain_db, band.q, fs)
    elif band.kind == "low_shelf":
        coeffs = _shelf(band.freq_hz, band.gain_db, band.q, fs, high=False)
    elif band.kind == "high_shelf":
        coeffs = _shelf(band.freq_hz, band.gain_db, band.q, fs, high=True)
    else:
        raise ValueError(f"Unknown EQ band kind: {band.kind}")
    b, den = coeffs[:3], coeffs[3:]
    return np.concatenate([b / den[0], den / den[0]])


def process(
    samples: np.ndarray, sample_rate: int, *, bands: tuple[EqBand, ...]
) -> tuple[np.ndarray, dict]:
    if not bands:
        return samples.copy(), {"stage": "eq", "bands": []}
    sos = np.vstack([_band_sos(b, sample_rate) for b in bands])
    filtered = np.asarray(signal.sosfilt(sos, samples, axis=0))
    meta = [
        {"freq_hz": b.freq_hz, "gain_db": b.gain_db, "q": b.q, "kind": b.kind} for b in bands
    ]
    return filtered, {"stage": "eq", "bands": meta}
