"""Album/batch mastering: loudness consistency across tracks.

Two-pass: render every track at the preset target, find the quietest achieved
loudness (a transient guard may have capped a dynamic track), then re-render
all tracks to that shared achievable target so the album is consistent.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from localmaster_engine.analysis import analyze
from localmaster_engine.audio_io import load_audio
from localmaster_engine.export import ExportResult, export_master
from localmaster_engine.pipeline import master
from localmaster_engine.presets import Preset


@dataclass(frozen=True)
class BatchResult:
    shared_target_lufs: float
    exports: list[ExportResult]
    warnings: list[str]


def _achieved_lufs(path: str, preset: Preset) -> float:
    loaded = load_audio(path)
    result = master(loaded.samples, loaded.sample_rate, preset)
    meta = next(m for m in result.stage_meta if m["stage"] == "loudness")
    return float(meta["achieved_lufs"])


def master_album(
    paths: list[str],
    preset: Preset,
    out_dir: str,
    bit_depth: int | None = None,
    progress=None,
) -> BatchResult:
    if not paths:
        raise ValueError("Batch requires at least one track")
    total_steps = 2 * len(paths)

    def report(step: int, label: str) -> None:
        if progress:
            progress(label, step / total_steps)

    achieved = {}
    for i, path in enumerate(paths):
        report(i, f"pass1:{Path(path).name}")
        achieved[path] = _achieved_lufs(path, preset)
    shared_target = min(achieved.values())
    album_preset = preset.with_overrides({"target_lufs": round(shared_target, 2)})
    exports, warnings = [], []
    for i, path in enumerate(paths):
        report(len(paths) + i, f"pass2:{Path(path).name}")
        try:
            loaded = load_audio(path)
            input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
            result = master(loaded.samples, loaded.sample_rate, album_preset)
            exports.append(
                export_master(result, input_analysis, album_preset, path, out_dir, bit_depth=bit_depth)
            )
            warnings.extend(f"{path}: {w}" for w in result.warnings)
        except Exception as exc:
            # Don't strand already-exported tracks as undocumented files on
            # disk: name them in the error so the caller knows what landed.
            done = ", ".join(Path(e.out_path).name for e in exports) or "none"
            raise type(exc)(
                f"{Path(path).name} failed ({exc}). Already exported before the failure: {done}."
            ) from exc
    report(total_steps, "done")
    return BatchResult(
        shared_target_lufs=round(shared_target, 2), exports=exports, warnings=warnings
    )
