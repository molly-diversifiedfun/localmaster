"""Gentle saturation: normalized tanh soft-clip with dry/wet mix."""
from __future__ import annotations

import numpy as np


def process(
    samples: np.ndarray, sample_rate: int, *, drive: float = 1.5, mix: float = 0.2
) -> tuple[np.ndarray, dict]:
    if drive <= 0 or mix <= 0:
        return samples.copy(), {"stage": "saturation", "drive": drive, "mix": 0.0}
    wet = np.tanh(drive * samples) / np.tanh(drive)
    out = (1.0 - mix) * samples + mix * wet
    return out, {"stage": "saturation", "drive": drive, "mix": mix}
