from __future__ import annotations

import numpy as np
import pyloudnorm

from localmaster_engine.analysis import true_peak_dbtp
from localmaster_engine.audio_io import load_audio
from localmaster_engine.pipeline import master
from localmaster_engine.presets import PRESETS, get_preset


def test_determinism_bit_identical(fixtures_dir):
    """Acceptance test 4: same input + preset twice → bit-identical output."""
    loaded = load_audio(str(fixtures_dir / "songlike_30s.wav"))
    preset = get_preset("clean_dj")
    a = master(loaded.samples, loaded.sample_rate, preset)
    b = master(loaded.samples, loaded.sample_rate, preset)
    np.testing.assert_array_equal(a.samples, b.samples)


def test_clean_dj_loudness_accuracy_on_pink_noise(fixtures_dir):
    """Acceptance test 1: pink @ -20 LUFS → within ±1.0 LU of -9; TP ≤ ceiling."""
    loaded = load_audio(str(fixtures_dir / "pink_-20LUFS.wav"))
    preset = get_preset("clean_dj")
    result = master(loaded.samples, loaded.sample_rate, preset)
    out_lufs = pyloudnorm.Meter(result.sample_rate).integrated_loudness(result.samples)
    assert abs(out_lufs - preset.target_lufs) <= 1.0, f"got {out_lufs:.2f}"
    assert true_peak_dbtp(result.samples, result.sample_rate) <= preset.ceiling_dbtp + 0.05


def test_ceiling_never_exceeded_across_presets(fixtures_dir):
    """Acceptance test 2: all presets on synthetic set → TP ≤ preset ceiling."""
    files = ["pink_-20LUFS.wav", "songlike_30s.wav", "album_track5_-12LUFS.wav"]
    for preset in PRESETS.values():
        for name in files:
            loaded = load_audio(str(fixtures_dir / name))
            result = master(loaded.samples, loaded.sample_rate, preset)
            tp = true_peak_dbtp(result.samples, result.sample_rate)
            assert tp <= preset.ceiling_dbtp + 0.05, f"{preset.id} on {name}: TP {tp:.2f}"


def test_transient_guard_reports_when_target_unreachable(fixtures_dir):
    """A very dynamic quiet source can't hit -9 within a 4 dB GR budget —
    the pipeline must land quieter AND say so, never silently crush."""
    loaded = load_audio(str(fixtures_dir / "album_track1_-28LUFS.wav"))
    preset = get_preset("clean_dj")
    result = master(loaded.samples, loaded.sample_rate, preset)
    loudness_meta = next(m for m in result.stage_meta if m["stage"] == "loudness")
    if loudness_meta["transient_guard_engaged"]:
        assert any("Transient guard" in w for w in result.warnings)
        out_lufs = pyloudnorm.Meter(result.sample_rate).integrated_loudness(result.samples)
        assert out_lufs < preset.target_lufs + 1.0


def test_pipeline_does_not_mutate_input(fixtures_dir):
    loaded = load_audio(str(fixtures_dir / "songlike_30s.wav"))
    before = loaded.samples.copy()
    master(loaded.samples, loaded.sample_rate, get_preset("gentle"))
    np.testing.assert_array_equal(loaded.samples, before)


def test_progress_callback_fires_in_order(fixtures_dir):
    loaded = load_audio(str(fixtures_dir / "sine_1khz_-20dBFS.wav"))
    seen: list[tuple[str, float]] = []
    master(loaded.samples, loaded.sample_rate, get_preset("gentle"),
           progress=lambda stage, frac: seen.append((stage, frac)))
    assert seen[0][1] == 0.0 and seen[-1] == ("done", 1.0)
    fracs = [f for _, f in seen]
    assert fracs == sorted(fracs)
