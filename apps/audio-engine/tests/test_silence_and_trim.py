from __future__ import annotations

import numpy as np

from localmaster_engine.analysis import silence_bounds_seconds
from localmaster_engine.export import apply_trim_and_fades

SR = 44100


def _padded_tone(lead_s: float, tone_s: float, trail_s: float) -> np.ndarray:
    tone = 0.5 * np.sin(2 * np.pi * 440 * np.arange(int(tone_s * SR)) / SR)
    mono = np.concatenate([np.zeros(int(lead_s * SR)), tone, np.zeros(int(trail_s * SR))])
    return np.column_stack([mono, mono])


def test_silence_detection():
    audio = _padded_tone(1.5, 3.0, 0.8)
    lead, trail = silence_bounds_seconds(audio, SR)
    assert abs(lead - 1.5) < 0.05
    assert abs(trail - 0.8) < 0.05


def test_trim_removes_silence_only_when_enabled():
    audio = _padded_tone(1.0, 2.0, 1.0)
    untouched = apply_trim_and_fades(audio, SR)
    trimmed = apply_trim_and_fades(audio, SR, trim_silence=True)
    assert untouched.shape[0] == audio.shape[0]  # OFF by default
    assert abs(trimmed.shape[0] / SR - 2.0) < 0.1


def test_fades_ramp_edges_without_mutating_input():
    audio = _padded_tone(0.0, 2.0, 0.0)
    before = audio.copy()
    faded = apply_trim_and_fades(audio, SR, fade_in_ms=100, fade_out_ms=100)
    np.testing.assert_array_equal(audio, before)
    assert abs(faded[0, 0]) < 1e-9 and abs(faded[-1, 0]) < 1e-9
    mid = faded.shape[0] // 2
    np.testing.assert_allclose(faded[mid], audio[mid])
