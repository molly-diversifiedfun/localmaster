from __future__ import annotations

import json

import numpy as np

from localmaster_engine.analysis import spectral_balance, true_peak_dbtp
from localmaster_engine.audio_io import load_audio
from localmaster_engine.chain.reference import ReferenceProfile, analyze_reference, apply_matching
from localmaster_engine.pipeline import master
from localmaster_engine.presets import get_preset

SR = 44100


def _mono_signal(kind: str, seconds: float, seed: int) -> np.ndarray:
    """Deterministic white or pink (1/f) mono noise, unscaled to ~0.3 peak."""
    n = int(seconds * SR)
    rng = np.random.default_rng(seed)
    white = rng.standard_normal(n)
    if kind == "white":
        sig = white
    else:
        spectrum = np.fft.rfft(white)
        freqs = np.fft.rfftfreq(n, 1 / SR)
        shaping = np.ones_like(freqs)
        shaping[1:] = 1.0 / np.sqrt(freqs[1:])
        sig = np.fft.irfft(spectrum * shaping, n=n)
    return sig / np.max(np.abs(sig)) * 0.3


def _stereo(mono: np.ndarray) -> np.ndarray:
    return np.column_stack([mono, mono])


def _spectral_distance(samples: np.ndarray, ref_balance: dict[str, float]) -> float:
    balance = spectral_balance(samples, SR)
    return sum(abs(balance[band] - ref_balance[band]) for band in ref_balance)


def test_strength_zero_is_bit_identical_passthrough():
    target = _stereo(_mono_signal("white", 5.0, 1))
    profile = analyze_reference(_stereo(_mono_signal("pink", 5.0, 2)), SR)
    out, meta = apply_matching(target, SR, profile, strength=0.0)
    np.testing.assert_array_equal(out, target)
    assert meta["applied"] is False


def test_full_strength_converges_spectral_balance_toward_reference():
    target = _stereo(_mono_signal("white", 20.0, 3))
    reference = _stereo(_mono_signal("pink", 20.0, 4))
    profile = analyze_reference(reference, SR)
    ref_balance = spectral_balance(reference, SR)

    before_dist = _spectral_distance(target, ref_balance)
    out, meta = apply_matching(target, SR, profile, strength=1.0)
    after_dist = _spectral_distance(out, ref_balance)

    assert meta["applied"] is True
    assert after_dist <= 0.5 * before_dist, f"{after_dist=} did not shrink >=50% from {before_dist=}"


def test_intermediate_strength_is_monotonic():
    target = _stereo(_mono_signal("white", 20.0, 5))
    reference = _stereo(_mono_signal("pink", 20.0, 6))
    profile = analyze_reference(reference, SR)
    ref_balance = spectral_balance(reference, SR)

    dist_0 = _spectral_distance(target, ref_balance)
    out_half, _ = apply_matching(target, SR, profile, strength=0.5)
    dist_half = _spectral_distance(out_half, ref_balance)
    out_full, _ = apply_matching(target, SR, profile, strength=1.0)
    dist_full = _spectral_distance(out_full, ref_balance)

    assert dist_full <= dist_half <= dist_0


def test_determinism_same_inputs_and_strength_twice():
    target = _stereo(_mono_signal("white", 10.0, 7))
    reference = _stereo(_mono_signal("pink", 10.0, 8))
    profile = analyze_reference(reference, SR)
    out_a, _ = apply_matching(target, SR, profile, strength=0.6)
    out_b, _ = apply_matching(target, SR, profile, strength=0.6)
    np.testing.assert_array_equal(out_a, out_b)


def test_apply_matching_does_not_mutate_input():
    target = _stereo(_mono_signal("white", 10.0, 9))
    reference = _stereo(_mono_signal("pink", 10.0, 10))
    profile = analyze_reference(reference, SR)
    before = target.copy()
    apply_matching(target, SR, profile, strength=0.8)
    np.testing.assert_array_equal(target, before)


def test_analyze_reference_does_not_mutate_input():
    reference = _stereo(_mono_signal("pink", 10.0, 11))
    before = reference.copy()
    analyze_reference(reference, SR)
    np.testing.assert_array_equal(reference, before)


def test_output_length_matches_input_length_for_non_round_durations():
    target = _stereo(_mono_signal("white", 7.3, 12))
    reference = _stereo(_mono_signal("pink", 10.0, 13))
    profile = analyze_reference(reference, SR)
    out, _ = apply_matching(target, SR, profile, strength=1.0)
    assert out.shape == target.shape


def test_apply_matching_handles_mono_input():
    target = _mono_signal("white", 5.0, 14)[:, None]
    reference = _stereo(_mono_signal("pink", 5.0, 15))
    profile = analyze_reference(reference, SR)
    out, meta = apply_matching(target, SR, profile, strength=1.0)
    assert out.shape == target.shape
    assert meta["applied"] is True


def test_reference_profile_json_roundtrip():
    reference = _stereo(_mono_signal("pink", 10.0, 16))
    profile = analyze_reference(reference, SR)
    restored = ReferenceProfile.from_dict(json.loads(json.dumps(profile.to_dict())))
    assert restored == profile


def test_full_chain_ceiling_respected_with_reference_matching(fixtures_dir):
    """Reuses the existing preset-ceiling test pattern (see test_pipeline.py),
    with a reference profile inserted between eq and compressor."""
    loaded = load_audio(str(fixtures_dir / "songlike_30s.wav"))
    ref_loaded = load_audio(str(fixtures_dir / "pink_-20LUFS.wav"))
    profile = analyze_reference(ref_loaded.samples, ref_loaded.sample_rate)
    preset = get_preset("clean_dj")

    result = master(
        loaded.samples, loaded.sample_rate, preset,
        reference_profile=profile, match_strength=0.8,
    )

    tp = true_peak_dbtp(result.samples, result.sample_rate)
    assert tp <= preset.ceiling_dbtp + 0.05
    ref_meta = next(m for m in result.stage_meta if m["stage"] == "reference_match")
    assert ref_meta["applied"] is True
    assert ref_meta["strength"] == 0.8


def test_master_without_reference_profile_skips_the_stage(fixtures_dir):
    loaded = load_audio(str(fixtures_dir / "sine_1khz_-20dBFS.wav"))
    result = master(loaded.samples, loaded.sample_rate, get_preset("gentle"))
    assert "reference_match" not in [m["stage"] for m in result.stage_meta]
