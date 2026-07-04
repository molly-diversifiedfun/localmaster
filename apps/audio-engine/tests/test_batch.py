from __future__ import annotations

import pytest
import soundfile as sf

from localmaster_engine.analysis import analyze
from localmaster_engine.batch import master_album
from localmaster_engine.presets import get_preset


def test_batch_consistency_within_1_lu(fixtures_dir, tmp_path):
    """Acceptance test 6: 5 tracks of differing loudness → shared target →
    all outputs within ±1.0 LU of each other."""
    paths = [
        str(fixtures_dir / f"album_track{i}_{lufs}LUFS.wav")
        for i, lufs in ((1, -28), (2, -24), (3, -20), (4, -16), (5, -12))
    ]
    result = master_album(paths, get_preset("clean_dj"), str(tmp_path))
    assert len(result.exports) == 5
    loudness = []
    for export in result.exports:
        audio, sr = sf.read(export.out_path)
        loudness.append(analyze(audio if audio.ndim == 2 else audio[:, None], sr).integrated_lufs)
    spread = max(loudness) - min(loudness)
    assert spread <= 1.0, f"album spread {spread:.2f} LU: {loudness}"


def test_batch_partial_failure_names_completed_exports(fixtures_dir, tmp_path, monkeypatch):
    """A LibsndfileError mid-batch must surface as a clean ExportError naming
    the already-exported files (regression: type(exc) re-raise broke on
    non-message constructors)."""

    from localmaster_engine import batch as batch_mod
    from localmaster_engine.export import ExportError

    good = str(fixtures_dir / "album_track4_-16LUFS.wav")
    bad = str(fixtures_dir / "album_track5_-12LUFS.wav")
    real_load = batch_mod.load_audio
    calls = {"pass2": 0}

    def flaky_load(path):
        if path == bad:
            calls["pass2"] += 1
            if calls["pass2"] >= 2:  # pass 1 succeeds, pass 2 decode blows up
                raise sf.LibsndfileError(1, prefix="decode failed: ")
        return real_load(path)

    monkeypatch.setattr(batch_mod, "load_audio", flaky_load)
    with pytest.raises(ExportError) as excinfo:
        batch_mod.master_album([good, bad], get_preset("gentle"), str(tmp_path))
    message = str(excinfo.value)
    assert "Already exported before the failure" in message
    assert "album_track4" in message
    assert "('" not in message  # not a mangled args-tuple repr


def test_host_of_bare_ipv6():
    from localmaster_engine.server.app import ALLOWED_HOSTS, _host_of

    assert _host_of("::1") in ALLOWED_HOSTS
    assert _host_of("[::1]") in ALLOWED_HOSTS
    assert _host_of("[::1]:48750") in ALLOWED_HOSTS
    assert _host_of("evil.com:80") not in ALLOWED_HOSTS
