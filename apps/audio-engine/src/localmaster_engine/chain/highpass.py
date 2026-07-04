"""Subsonic high-pass: 2nd-order Butterworth (gentle 12 dB/oct)."""
from __future__ import annotations

import numpy as np
from scipy import signal


def process(samples: np.ndarray, sample_rate: int, *, cutoff_hz: float = 30.0) -> tuple[np.ndarray, dict]:
    sos = signal.butter(2, cutoff_hz, btype="highpass", fs=sample_rate, output="sos")
    filtered = signal.sosfilt(sos, samples, axis=0)
    return np.asarray(filtered), {"stage": "highpass", "cutoff_hz": cutoff_hz}
