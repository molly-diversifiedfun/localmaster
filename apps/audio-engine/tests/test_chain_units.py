from __future__ import annotations

import numpy as np
from scipy import signal

from localmaster_engine.chain import (
    compressor,
    dc_offset,
    dither,
    eq,
    highpass,
    limiter,
    saturation,
    stereo,
)
from localmaster_engine.chain.eq import EqBand

SR = 44100


def _stereo_sig(mono: np.ndarray) -> np.ndarray:
    return np.column_stack([mono, mono])


def _sine(freq: float, seconds: float = 3.0, amp: float = 0.5) -> np.ndarray:
    return amp * np.sin(2 * np.pi * freq * np.arange(int(seconds * SR)) / SR)


def test_dc_offset_removed_and_input_untouched():
    audio = _stereo_sig(_sine(440) + 0.05)
    before = audio.copy()
    out, meta = dc_offset.process(audio, SR)
    assert abs(np.mean(out)) < 1e-9
    np.testing.assert_array_equal(audio, before)  # no mutation


def test_highpass_kills_subsonics_keeps_mids():
    sub = _stereo_sig(_sine(10.0))
    mid = _stereo_sig(_sine(1000.0))
    sub_out, _ = highpass.process(sub, SR, cutoff_hz=30.0)
    mid_out, _ = highpass.process(mid, SR, cutoff_hz=30.0)
    assert np.sqrt(np.mean(sub_out**2)) < 0.15 * np.sqrt(np.mean(sub**2))
    assert np.sqrt(np.mean(mid_out**2)) > 0.95 * np.sqrt(np.mean(mid**2))


def test_eq_peaking_boosts_center_frequency():
    audio = _stereo_sig(_sine(1000.0, amp=0.1))
    out, _ = eq.process(audio, SR, bands=(EqBand(1000.0, 6.0, 1.0, "peaking"),))
    gain_db = 20 * np.log10(np.sqrt(np.mean(out**2)) / np.sqrt(np.mean(audio**2)))
    assert 5.0 < gain_db < 7.0


def test_eq_high_shelf_boosts_highs_not_lows():
    high, low = _stereo_sig(_sine(10000.0, amp=0.1)), _stereo_sig(_sine(100.0, amp=0.1))
    band = (EqBand(4000.0, 4.0, 0.707, "high_shelf"),)
    high_out, _ = eq.process(high, SR, bands=band)
    low_out, _ = eq.process(low, SR, bands=band)
    high_gain = 20 * np.log10(np.sqrt(np.mean(high_out**2)) / np.sqrt(np.mean(high**2)))
    low_gain = 20 * np.log10(np.sqrt(np.mean(low_out**2)) / np.sqrt(np.mean(low**2)))
    assert high_gain > 3.0 and abs(low_gain) < 1.0


def test_compressor_reduces_loud_not_quiet():
    quiet = _stereo_sig(_sine(440, amp=0.03))
    loud = _stereo_sig(_sine(440, amp=0.8))
    quiet_out, quiet_meta = compressor.process(quiet, SR, threshold_db=-18, ratio=4.0)
    loud_out, loud_meta = compressor.process(loud, SR, threshold_db=-18, ratio=4.0)
    assert quiet_meta["max_gain_reduction_db"] < 0.5
    assert loud_meta["max_gain_reduction_db"] > 6.0
    assert np.max(np.abs(loud_out)) < np.max(np.abs(loud))


def test_saturation_bounded_and_gentle():
    audio = _stereo_sig(_sine(440, amp=0.9))
    out, _ = saturation.process(audio, SR, drive=2.0, mix=0.3)
    assert np.max(np.abs(out)) <= 1.0
    assert np.corrcoef(out[:, 0], audio[:, 0])[0, 1] > 0.99


def test_stereo_mono_bass_below_crossover():
    lows = np.column_stack([_sine(50.0), -_sine(50.0)])  # fully out-of-phase bass
    out, _ = stereo.process(lows, SR, width=1.0, mono_bass_hz=120.0)
    assert np.sqrt(np.mean(out**2)) < 0.1 * np.sqrt(np.mean(np.abs(lows) ** 2))


def test_stereo_width_zero_collapses_highs_to_mono():
    rng = np.random.default_rng(7)
    audio = rng.standard_normal((SR * 2, 2)) * 0.1
    out, _ = stereo.process(audio, SR, width=0.0, mono_bass_hz=100.0)
    assert np.max(np.abs(out[:, 0] - out[:, 1])) < 1e-6


def test_limiter_enforces_ceiling_on_hot_signal():
    audio = _stereo_sig(_sine(440, amp=1.4))
    out, meta = limiter.process(audio, SR, ceiling_dbtp=-1.0)
    up = signal.resample_poly(out, 4, 1, axis=0)
    true_peak_db = 20 * np.log10(np.max(np.abs(up)))
    assert true_peak_db <= -1.0 + 1e-6
    assert meta["max_gain_reduction_db"] > 2.0


def test_limiter_transparent_below_ceiling():
    audio = _stereo_sig(_sine(440, amp=0.1))
    out, meta = limiter.process(audio, SR, ceiling_dbtp=-1.0)
    assert meta["max_gain_reduction_db"] < 0.2
    np.testing.assert_allclose(out, audio, atol=1e-3)


def test_tpdf_dither_deterministic_and_triangular():
    rng = np.random.default_rng(3)
    audio = rng.uniform(-0.5, 0.5, (SR, 2))
    a, _ = dither.tpdf_dither_to_int16(audio, seed=42)
    b, _ = dither.tpdf_dither_to_int16(audio, seed=42)
    c, _ = dither.tpdf_dither_to_int16(audio, seed=43)
    np.testing.assert_array_equal(a, b)
    assert np.any(a != c)
    # TPDF noise kurtosis ~2.4 (triangular), well below Gaussian 3.0
    noise = (np.random.default_rng(1).random(200000) - np.random.default_rng(2).random(200000))
    kurt = np.mean(noise**4) / np.mean(noise**2) ** 2
    assert 2.2 < kurt < 2.6
