"""TPDF dither + quantization for 16-bit export.

Deterministic: the RNG seed is derived from the audio content + parameters by
the caller, so identical input+params produce bit-identical output.
"""
from __future__ import annotations

import numpy as np

INT16_FULL_SCALE = 32767


def tpdf_dither_to_int16(samples: np.ndarray, seed: int) -> tuple[np.ndarray, dict]:
    rng = np.random.default_rng(seed)
    lsb = 1.0 / INT16_FULL_SCALE
    noise = (rng.random(samples.shape) - rng.random(samples.shape)) * lsb
    dithered = np.clip(samples + noise, -1.0, 1.0)
    ints = np.clip(np.round(dithered * INT16_FULL_SCALE), -32768, 32767).astype(np.int16)
    return ints, {"stage": "dither", "kind": "TPDF", "seed": seed, "target_bits": 16}
