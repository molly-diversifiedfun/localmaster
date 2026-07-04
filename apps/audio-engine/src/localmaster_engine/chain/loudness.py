"""Loudness stage: iterative normalize→limit toward target with a cumulative
transient-guard budget.

Each pass gains toward target, spending budget equal to the gain reduction the
limiter must apply to the SUSTAINED signal (99.5th-percentile envelope). Dense
material (noise-like) spends little budget per pass, so iteration converges on
the target. Transient material (kicks) spends the budget immediately, the loop
stops, and the shortfall is reported — never silently crushed.
"""
from __future__ import annotations

import numpy as np
import pyloudnorm

from localmaster_engine.chain import limiter as limiter_mod

MAX_ITERATIONS = 8
CONVERGED_LU = 0.25
SUSTAINED_PERCENTILE = 99.5
EPS = 1e-12


def _sustained_level_db(samples: np.ndarray) -> float:
    envelope = np.max(np.abs(samples), axis=1)
    return float(20 * np.log10(max(np.percentile(envelope, SUSTAINED_PERCENTILE), EPS)))


def _lufs(samples: np.ndarray, sample_rate: int) -> float:
    return float(pyloudnorm.Meter(sample_rate).integrated_loudness(samples))


def _one_pass(
    samples: np.ndarray, sample_rate: int, needed_db: float, remaining_budget_db: float,
    ceiling_dbtp: float,
) -> tuple[np.ndarray, float, float, bool]:
    """Gain within budget, then limit. Returns (out, gain, budget_spent, guarded)."""
    sustained = _sustained_level_db(samples)
    predicted_gr = max(0.0, (sustained + needed_db) - ceiling_dbtp)
    if predicted_gr <= remaining_budget_db:
        gain, guarded = needed_db, False
    else:
        gain = (ceiling_dbtp - sustained) + remaining_budget_db
        guarded = True
    if gain <= 0.0 and needed_db > 0.0:
        return samples, 0.0, 0.0, True
    gained = samples * (10 ** (gain / 20))
    spent = max(0.0, (sustained + gain) - ceiling_dbtp)
    return gained, gain, spent, guarded


def process(
    samples: np.ndarray,
    sample_rate: int,
    *,
    target_lufs: float,
    ceiling_dbtp: float,
    gr_budget_db: float,
    lookahead_ms: float = 5.0,
    release_ms: float = 80.0,
) -> tuple[np.ndarray, dict]:
    current = samples
    input_lufs = _lufs(current, sample_rate)
    remaining = gr_budget_db
    iterations: list[dict] = []
    limiter_meta: dict = {}
    guard_engaged = False
    for _ in range(MAX_ITERATIONS):
        needed = target_lufs - _lufs(current, sample_rate)
        if abs(needed) <= CONVERGED_LU and iterations:
            break
        current, gain, spent, guarded = _one_pass(
            current, sample_rate, needed, remaining, ceiling_dbtp
        )
        remaining -= spent
        guard_engaged = guard_engaged or guarded
        current, limiter_meta = limiter_mod.process(
            current, sample_rate,
            ceiling_dbtp=ceiling_dbtp, lookahead_ms=lookahead_ms, release_ms=release_ms,
        )
        iterations.append({
            "needed_db": round(needed, 2), "applied_gain_db": round(gain, 2),
            "budget_spent_db": round(spent, 2), "guarded": guarded,
        })
        if guarded or remaining <= 0.05:
            break
    achieved = _lufs(current, sample_rate)
    meta = {
        "stage": "loudness",
        "input_lufs": round(input_lufs, 2),
        "target_lufs": target_lufs,
        "achieved_lufs": round(achieved, 2),
        "ceiling_dbtp": ceiling_dbtp,
        "gr_budget_db": gr_budget_db,
        "budget_remaining_db": round(max(remaining, 0.0), 2),
        "transient_guard_engaged": bool(guard_engaged and achieved < target_lufs - 0.5),
        "iterations": iterations,
        "limiter": limiter_meta,
    }
    return current, meta
