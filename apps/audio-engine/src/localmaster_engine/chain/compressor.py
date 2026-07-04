"""Broadband stereo-linked compressor, block-based for speed and determinism.

Level detection per 64-sample block (linked peak), soft-knee gain computer,
attack/release one-pole smoothing at block rate, linear gain interpolation.
"""
from __future__ import annotations

import numpy as np

BLOCK = 64
EPS = 1e-12


def _block_levels_db(samples: np.ndarray) -> np.ndarray:
    n_blocks = int(np.ceil(samples.shape[0] / BLOCK))
    padded = np.zeros((n_blocks * BLOCK, samples.shape[1]))
    padded[: samples.shape[0]] = samples
    linked = np.max(np.abs(padded), axis=1)
    peaks = linked.reshape(n_blocks, BLOCK).max(axis=1)
    return 20 * np.log10(np.maximum(peaks, EPS))


def _gain_computer(levels_db: np.ndarray, threshold_db: float, ratio: float, knee_db: float) -> np.ndarray:
    over = levels_db - threshold_db
    slope = (1.0 / ratio) - 1.0
    gains = np.zeros_like(over)
    if knee_db > 0:
        in_knee = np.abs(over) <= knee_db / 2
        gains[in_knee] = slope * (over[in_knee] + knee_db / 2) ** 2 / (2 * knee_db)
    gains[over > knee_db / 2] = slope * over[over > knee_db / 2]
    return gains


def _smooth(gains_db: np.ndarray, sample_rate: int, attack_ms: float, release_ms: float) -> np.ndarray:
    block_s = BLOCK / sample_rate
    ca = float(np.exp(-block_s / max(attack_ms / 1000, 1e-4)))
    cr = float(np.exp(-block_s / max(release_ms / 1000, 1e-4)))
    smoothed = np.empty_like(gains_db)
    env = 0.0
    for i, g in enumerate(gains_db):
        coef = ca if g < env else cr
        env = coef * env + (1 - coef) * g
        smoothed[i] = env
    return smoothed


def process(
    samples: np.ndarray,
    sample_rate: int,
    *,
    threshold_db: float = -18.0,
    ratio: float = 2.0,
    attack_ms: float = 15.0,
    release_ms: float = 150.0,
    knee_db: float = 6.0,
    makeup_db: float = 0.0,
) -> tuple[np.ndarray, dict]:
    levels = _block_levels_db(samples)
    gains_db = _gain_computer(levels, threshold_db, ratio, knee_db)
    smoothed_db = _smooth(gains_db, sample_rate, attack_ms, release_ms)
    block_centers = np.arange(len(smoothed_db)) * BLOCK + BLOCK / 2
    per_sample_db = np.interp(np.arange(samples.shape[0]), block_centers, smoothed_db)
    gain = (10 ** ((per_sample_db + makeup_db) / 20))[:, None]
    meta = {
        "stage": "compressor",
        "threshold_db": threshold_db,
        "ratio": ratio,
        "max_gain_reduction_db": round(float(-np.min(smoothed_db)), 2),
        "makeup_db": makeup_db,
    }
    return samples * gain, meta
