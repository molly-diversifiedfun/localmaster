from __future__ import annotations

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
