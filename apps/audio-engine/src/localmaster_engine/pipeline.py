"""Fixed-order mastering chain runner. Deterministic and non-mutating.

Order (spec section C): DC removal → high-pass → corrective EQ → [reference
match, if a ReferenceProfile is supplied] → compressor → saturation →
stereo/mono-bass → loudness normalization (transient guard) → limiter.
Dither happens at export time (16-bit only).
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from localmaster_engine.chain import (
    compressor,
    dc_offset,
    eq,
    highpass,
    loudness,
    reference,
    saturation,
    stereo,
)
from localmaster_engine.chain.reference import ReferenceProfile
from localmaster_engine.presets import Preset

ProgressCallback = Callable[[str, float], None]


@dataclass(frozen=True)
class MasterResult:
    samples: np.ndarray
    sample_rate: int
    stage_meta: list[dict]
    warnings: list[str]


def _stages(
    preset: Preset,
    reference_profile: ReferenceProfile | None = None,
    match_strength: float = 0.35,
) -> list[tuple[str, Callable[[np.ndarray, int], tuple[np.ndarray, dict]]]]:
    steps: list[tuple[str, Callable]] = []
    if preset.remove_dc:
        steps.append(("dc_offset", dc_offset.process))
    steps.append(("highpass", lambda s, sr: highpass.process(s, sr, cutoff_hz=preset.highpass_hz)))
    steps.append(("eq", lambda s, sr: eq.process(s, sr, bands=preset.eq_bands)))
    if reference_profile is not None:
        steps.append(
            (
                "reference_match",
                lambda s, sr: reference.apply_matching(s, sr, reference_profile, match_strength),
            )
        )
    steps.append(
        ("compressor", lambda s, sr: compressor.process(
            s, sr,
            threshold_db=preset.comp_threshold_db, ratio=preset.comp_ratio,
            attack_ms=preset.comp_attack_ms, release_ms=preset.comp_release_ms,
            knee_db=preset.comp_knee_db,
        ))
    )
    steps.append(
        ("saturation", lambda s, sr: saturation.process(
            s, sr, drive=preset.saturation_drive, mix=preset.saturation_mix
        ))
    )
    steps.append(
        ("stereo", lambda s, sr: stereo.process(
            s, sr, width=preset.stereo_width, mono_bass_hz=preset.mono_bass_hz
        ))
    )
    steps.append(
        ("loudness", lambda s, sr: loudness.process(
            s, sr,
            target_lufs=preset.target_lufs, ceiling_dbtp=preset.ceiling_dbtp,
            gr_budget_db=preset.gr_budget_db,
            lookahead_ms=preset.limiter_lookahead_ms,
            release_ms=preset.limiter_release_ms,
        ))
    )
    return steps


def _collect_warnings(stage_meta: list[dict], preset: Preset) -> list[str]:
    warnings = []
    for meta in stage_meta:
        if meta.get("transient_guard_engaged"):
            warnings.append(
                f"Transient guard engaged: reached {meta['achieved_lufs']} LUFS instead of "
                f"target {meta['target_lufs']} (sustained limiting capped at "
                f"{meta['gr_budget_db']} dB). Raise the loudness priority to push harder."
            )
        if meta.get("stage") == "compressor" and meta.get("max_gain_reduction_db", 0) > 8:
            warnings.append(
                f"Heavy compression ({meta['max_gain_reduction_db']} dB max GR) — check the source."
            )
    return warnings


def master(
    samples: np.ndarray,
    sample_rate: int,
    preset: Preset,
    progress: ProgressCallback | None = None,
    reference_profile: ReferenceProfile | None = None,
    match_strength: float = 0.35,
) -> MasterResult:
    stages = _stages(preset, reference_profile, match_strength)
    current = samples
    stage_meta: list[dict] = []
    for i, (name, fn) in enumerate(stages):
        if progress:
            progress(name, i / len(stages))
        current, meta = fn(current, sample_rate)
        stage_meta.append(meta)
    if progress:
        progress("done", 1.0)
    return MasterResult(
        samples=current,
        sample_rate=sample_rate,
        stage_meta=stage_meta,
        warnings=_collect_warnings(stage_meta, preset),
    )
