from __future__ import annotations

import numpy as np
import pytest
import soundfile as sf

from localmaster_engine import analysis
from localmaster_engine.audio_io import AudioLoadError, load_audio

SR = 44100


def _stereo(mono: np.ndarray) -> np.ndarray:
    return np.column_stack([mono, mono])


def test_pink_noise_measures_minus_20_lufs(fixtures_dir):
    loaded = load_audio(str(fixtures_dir / "pink_-20LUFS.wav"))
    report = analysis.analyze(loaded.samples, loaded.sample_rate)
    assert abs(report.integrated_lufs - (-20.0)) < 0.5


def test_true_peak_at_least_sample_peak(fixtures_dir):
    loaded = load_audio(str(fixtures_dir / "songlike_30s.wav"))
    report = analysis.analyze(loaded.samples, loaded.sample_rate)
    assert report.true_peak_dbtp >= report.sample_peak_dbfs - 0.01


def test_dc_offset_detected():
    audio = _stereo(0.1 * np.sin(2 * np.pi * 440 * np.arange(SR * 5) / SR) + 0.05)
    report = analysis.analyze(audio, SR)
    assert report.has_dc_offset


def test_clean_sine_has_no_flags():
    audio = _stereo(0.5 * np.sin(2 * np.pi * 440 * np.arange(SR * 5) / SR))
    report = analysis.analyze(audio, SR)
    assert not report.has_dc_offset
    assert not report.has_clipping
    assert not report.has_stereo_imbalance


def test_clipping_detected_on_hard_clipped_sine():
    mono = np.clip(2.0 * np.sin(2 * np.pi * 100 * np.arange(SR * 3) / SR), -1.0, 1.0)
    report = analysis.analyze(_stereo(mono), SR)
    assert report.has_clipping
    assert report.clipped_regions > 100


def test_stereo_imbalance_detected():
    mono = 0.5 * np.sin(2 * np.pi * 440 * np.arange(SR * 3) / SR)
    audio = np.column_stack([mono, 0.25 * mono])
    report = analysis.analyze(audio, SR)
    assert report.has_stereo_imbalance
    assert report.stereo_imbalance_db > 1.5


def test_spectral_balance_sums_to_one(fixtures_dir):
    loaded = load_audio(str(fixtures_dir / "pink_-20LUFS.wav"))
    report = analysis.analyze(loaded.samples, loaded.sample_rate)
    assert abs(sum(report.spectral_balance.values()) - 1.0) < 0.05


def test_load_rejects_missing_and_unsupported(tmp_path):
    with pytest.raises(AudioLoadError, match="not found"):
        load_audio(str(tmp_path / "nope.wav"))
    bad = tmp_path / "song.xyz"
    bad.write_bytes(b"junk")
    with pytest.raises(AudioLoadError, match="Unsupported format"):
        load_audio(str(bad))


def test_load_mono_becomes_2d(tmp_path):
    mono = 0.3 * np.sin(2 * np.pi * 440 * np.arange(SR) / SR)
    path = tmp_path / "mono.wav"
    sf.write(path, mono.astype(np.float32), SR, subtype="PCM_16")
    loaded = load_audio(str(path))
    assert loaded.samples.shape == (SR, 1)
    assert loaded.bit_depth == 16
