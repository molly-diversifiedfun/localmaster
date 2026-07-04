from __future__ import annotations

import numpy as np
import pyloudnorm
import soundfile as sf


def test_pink_noise_is_at_minus_20_lufs(fixtures_dir):
    audio, sr = sf.read(fixtures_dir / "pink_-20LUFS.wav")
    assert sr == 44100
    measured = pyloudnorm.Meter(sr).integrated_loudness(audio)
    assert abs(measured - (-20.0)) < 0.5


def test_album_tracks_span_loudness_range(fixtures_dir):
    expected = {1: -28.0, 2: -24.0, 3: -20.0, 4: -16.0, 5: -12.0}
    for i, lufs in expected.items():
        audio, sr = sf.read(fixtures_dir / f"album_track{i}_{int(lufs)}LUFS.wav")
        measured = pyloudnorm.Meter(sr).integrated_loudness(audio)
        assert abs(measured - lufs) < 0.5, f"track{i}: {measured:.2f} vs {lufs}"


def test_songlike_is_stereo_and_transient_rich(fixtures_dir):
    audio, sr = sf.read(fixtures_dir / "songlike_30s.wav")
    assert audio.ndim == 2 and audio.shape[1] == 2
    peak = np.max(np.abs(audio))
    rms = np.sqrt(np.mean(audio**2))
    crest_db = 20 * np.log10(peak / rms)
    assert crest_db > 10.0  # transient-rich by construction


def test_ramp_is_very_low_level(fixtures_dir):
    audio, _ = sf.read(fixtures_dir / "ramp_-90dBFS.wav")
    assert 0 < np.max(np.abs(audio)) < 10 ** (-80 / 20)
