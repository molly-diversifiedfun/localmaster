from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from localmaster_engine.analysis import analyze
from localmaster_engine.audio_io import load_audio
from localmaster_engine.export import build_filename, export_master
from localmaster_engine.pipeline import master
from localmaster_engine.presets import get_preset


def _run_full(
    fixtures_dir,
    tmp_path,
    name="songlike_30s.wav",
    preset_id="clean_dj",
    bits=None,
    profile="dj",
    metadata=None,
):
    src = fixtures_dir / name
    loaded = load_audio(str(src))
    input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
    preset = get_preset(preset_id)
    result = master(loaded.samples, loaded.sample_rate, preset)
    return export_master(
        result, input_analysis, preset, str(src), str(tmp_path), bit_depth=bits,
        profile=profile, metadata=metadata,
    )


def test_nondestructive_input_hash_unchanged(fixtures_dir, tmp_path):
    """Acceptance test 3: input byte-hash identical before/after a full run."""
    src = fixtures_dir / "songlike_30s.wav"
    before = hashlib.sha256(src.read_bytes()).hexdigest()
    _run_full(fixtures_dir, tmp_path)
    after = hashlib.sha256(src.read_bytes()).hexdigest()
    assert before == after


def test_format_integrity_24bit(fixtures_dir, tmp_path):
    """Acceptance test 7: 24-bit export re-reads with right depth/sr/channels."""
    export = _run_full(fixtures_dir, tmp_path)
    info = sf.info(export.out_path)
    assert info.subtype == "PCM_24"
    assert info.samplerate == 44100
    assert info.channels == 2
    assert export.checklist["export_succeeded"] and export.checklist["output_is_wav"]


def test_format_integrity_32float(fixtures_dir, tmp_path):
    export = _run_full(fixtures_dir, tmp_path, bits=32)
    assert sf.info(export.out_path).subtype == "FLOAT"


def test_dither_present_on_16bit_low_level(fixtures_dir, tmp_path):
    """Acceptance test 8: -90 dBFS ramp exported at 16-bit shows TPDF dither
    activity, not truncation-to-zero. Export layer only — mastering gain would
    lift the ramp out of the sub-LSB region and defeat the test's purpose."""
    from localmaster_engine.pipeline import MasterResult

    src = fixtures_dir / "ramp_-90dBFS.wav"
    loaded = load_audio(str(src))
    input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
    preset = get_preset("gentle")
    raw = MasterResult(loaded.samples, loaded.sample_rate, [], [])
    export = export_master(raw, input_analysis, preset, str(src), str(tmp_path), bit_depth=16)
    ints, _ = sf.read(export.out_path, dtype="int16")
    early = ints[: ints.shape[0] // 10]  # amplitude < 0.5 LSB: truncation → all zeros
    assert np.any(early != 0), "sub-LSB signal was truncated to silence (no dither)"
    assert np.mean(np.abs(early.astype(int)) <= 2) > 0.99  # dither is tiny, not garbage


def test_report_sidecars_written_and_honest(fixtures_dir, tmp_path):
    export = _run_full(fixtures_dir, tmp_path)
    report = json.loads(Path(export.json_report_path).read_text())
    assert "not AI mastering" in report["tool"]
    assert report["input"]["integrated_lufs"] != report["output"]["integrated_lufs"]
    assert set(report["dj_readiness_checklist"]) == {
        "no_clipping", "peak_within_ceiling", "loudness_within_tolerance",
        "valid_stereo", "export_succeeded", "output_is_wav",
    }
    txt = Path(export.txt_report_path).read_text()
    assert "DJ readiness checklist" in txt and "no network" in txt


def test_filename_scheme():
    name = build_filename("mysong", "clean_dj", -9.13, 44100, 24)
    assert name == "mysong__LocalMaster__clean_dj__-9.1LUFS__44100Hz__24bit.wav"


def test_export_never_overwrites(fixtures_dir, tmp_path):
    """Re-exporting the same track must create a __2 sibling, not clobber."""
    first = _run_full(fixtures_dir, tmp_path, name="sine_1khz_-20dBFS.wav", preset_id="gentle")
    second = _run_full(fixtures_dir, tmp_path, name="sine_1khz_-20dBFS.wav", preset_id="gentle")
    assert first.out_path != second.out_path
    assert Path(first.out_path).exists() and Path(second.out_path).exists()
    assert "__2.wav" in second.out_path
    assert Path(first.json_report_path) != Path(second.json_report_path)


def test_dj_profile_checklist_has_no_streaming_specs_key(fixtures_dir, tmp_path):
    """profile defaults to 'dj' — the release-only key must not leak in."""
    export = _run_full(fixtures_dir, tmp_path)
    assert "accepted_streaming_specs" not in export.checklist
    report = json.loads(Path(export.json_report_path).read_text())
    assert "dj_readiness_checklist" in report
    assert "release_readiness_checklist" not in report


def test_release_checklist_accepted_streaming_specs_pass(fixtures_dir, tmp_path):
    """44.1kHz/24-bit is an accepted streaming spec — checklist entry passes."""
    export = _run_full(
        fixtures_dir, tmp_path, preset_id="streaming_balanced", bits=24, profile="release",
    )
    assert export.checklist["accepted_streaming_specs"] is True
    report = json.loads(Path(export.json_report_path).read_text())
    assert "release_readiness_checklist" in report
    assert report["release_readiness_checklist"]["accepted_streaming_specs"] is True
    txt = Path(export.txt_report_path).read_text()
    assert "Release readiness checklist" in txt


def test_release_checklist_accepted_streaming_specs_fail_on_bad_bit_depth(fixtures_dir, tmp_path):
    """32-bit float isn't an accepted streaming delivery bit depth — fails."""
    export = _run_full(
        fixtures_dir, tmp_path, preset_id="streaming_balanced", bits=32, profile="release",
    )
    assert export.checklist["accepted_streaming_specs"] is False


def test_release_metadata_sidecar_written_and_artwork_copied(fixtures_dir, tmp_path):
    src = fixtures_dir / "songlike_30s.wav"
    loaded = load_audio(str(src))
    input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
    preset = get_preset("streaming_balanced")
    result = master(loaded.samples, loaded.sample_rate, preset)
    artwork = tmp_path / "artwork_src" / "cover.png"
    artwork.parent.mkdir()
    artwork.write_bytes(b"not-real-png-bytes-but-thats-fine-for-a-copy-test")
    out_dir = tmp_path / "bundle"
    metadata = {
        "title": "Night Drive",
        "artist": "Molly S",
        "primaryGenre": "House",
        "explicit": False,
        "artworkPath": str(artwork),
    }
    export = export_master(
        result, input_analysis, preset, str(src), str(out_dir),
        profile="release", metadata=metadata,
    )
    assert export.metadata_path is not None
    written = json.loads(Path(export.metadata_path).read_text())
    assert written["title"] == "Night Drive"
    assert written["artist"] == "Molly S"
    # Absolute input path is rewritten to a bundle-relative filename.
    assert written["artworkPath"] == "cover.png"
    copied = Path(export.metadata_path).parent / "cover.png"
    assert copied.exists()
    assert copied.read_bytes() == artwork.read_bytes()


def test_release_metadata_missing_artwork_file_raises_export_error(fixtures_dir, tmp_path):
    from localmaster_engine.export import ExportError

    src = fixtures_dir / "sine_1khz_-20dBFS.wav"
    loaded = load_audio(str(src))
    input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
    preset = get_preset("gentle")
    result = master(loaded.samples, loaded.sample_rate, preset)
    metadata = {
        "title": "X", "artist": "Y", "primaryGenre": "Pop", "explicit": False,
        "artworkPath": str(tmp_path / "does_not_exist.png"),
    }
    with pytest.raises(ExportError):
        export_master(
            result, input_analysis, preset, str(src), str(tmp_path / "out"),
            metadata=metadata,
        )


def test_unique_path_claim_is_atomic_under_threads(fixtures_dir, tmp_path):
    """Concurrent exports to the same name must never collide (O_EXCL claim)."""
    import concurrent.futures

    from localmaster_engine.export import _claim_unique_path

    target = tmp_path / "same_name.wav"
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        claimed = list(pool.map(lambda _: _claim_unique_path(target), range(8)))
    assert len({str(p) for p in claimed}) == 8  # all distinct
    assert all(p.exists() for p in claimed)  # every name actually reserved
