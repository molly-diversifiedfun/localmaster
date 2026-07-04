"""DC offset removal by per-channel mean subtraction."""
from __future__ import annotations

import numpy as np


def process(samples: np.ndarray, sample_rate: int) -> tuple[np.ndarray, dict]:
    offsets = np.mean(samples, axis=0)
    return samples - offsets, {
        "stage": "dc_offset",
        "removed_offsets": [round(float(o), 6) for o in offsets],
    }
