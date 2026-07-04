from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import soundfile as sf

from localmaster_engine.analysis import analyze
from localmaster_engine.audio_io import load_audio
from localmaster_engine.export import build_filename, export_master
from localmaster_engine.pipeline import master
from localmaster_engine.presets import get_preset


def _run_full(fixtures_dir, tmp_path, name="songlike_30s.wav", preset_id="clean_dj", bits=None):
    src = fixtures_dir / name
    loaded = load_audio(str(src))
    input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
    preset = get_preset(preset_id)
    result = master(loaded.samples, loaded.sample_rate, preset)
    return export_master(
        result, input_analysis, preset, str(src), str(tmp_path), bit_depth=bits
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
