"""Export: WAV 24/16/32f (+FLAC), deterministic dither seeding, sidecar reports.

Strictly non-destructive: only ever writes NEW files into the output directory.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from localmaster_engine import reports
from localmaster_engine.analysis import AnalysisReport, analyze
from localmaster_engine.chain.dither import tpdf_dither_to_int16
from localmaster_engine.pipeline import MasterResult
from localmaster_engine.presets import Preset

VALID_BIT_DEPTHS = (16, 24, 32)


class ExportError(Exception):
    """User-facing export failure."""


@dataclass(frozen=True)
class ExportResult:
    out_path: str
    json_report_path: str
    txt_report_path: str
    output_analysis: AnalysisReport
    checklist: dict[str, bool]


def apply_trim_and_fades(
    samples: np.ndarray,
    sample_rate: int,
    *,
    trim_silence: bool = False,
    fade_in_ms: float = 0.0,
    fade_out_ms: float = 0.0,
) -> np.ndarray:
    """Optional DJ-prep edits, all OFF by default. Returns a new array."""
    from localmaster_engine.analysis import silence_bounds_seconds

    out = samples
    if trim_silence:
        lead, trail = silence_bounds_seconds(out, sample_rate)
        start = int(lead * sample_rate)
        stop = out.shape[0] - int(trail * sample_rate)
        out = out[start:stop] if stop > start else out
    out = out.copy()
    fade_in = min(int(fade_in_ms / 1000 * sample_rate), out.shape[0])
    fade_out = min(int(fade_out_ms / 1000 * sample_rate), out.shape[0])
    if fade_in > 0:
        out[:fade_in] *= np.linspace(0.0, 1.0, fade_in)[:, None]
    if fade_out > 0:
        out[-fade_out:] *= np.linspace(1.0, 0.0, fade_out)[:, None]
    return out


def build_filename(original_stem: str, preset_id: str, lufs: float, sample_rate: int, bits: int) -> str:
    return (
        f"{original_stem}__LocalMaster__{preset_id}__{lufs:.1f}LUFS__"
        f"{sample_rate}Hz__{bits}bit.wav"
    )


def _claim_unique_path(path: Path) -> Path:
    """Never overwrite: atomically claim the name (O_CREAT|O_EXCL — no
    check-then-act race between concurrent export jobs); on collision append
    __2, __3, … Sidecars derive from the returned path, so they stay
    collision-free too."""
    candidates = (
        path if n == 1 else path.with_name(f"{path.stem}__{n}{path.suffix}")
        for n in range(1, 1000)
    )
    for candidate in candidates:
        try:
            os.close(os.open(candidate, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
            return candidate
        except FileExistsError:
            continue
    raise ExportError(f"Could not find a free filename near {path.name}")


def _dither_seed(samples: np.ndarray, preset: Preset) -> int:
    digest = hashlib.sha256()
    digest.update(np.ascontiguousarray(samples).tobytes())
    digest.update(json.dumps(preset.to_dict(), sort_keys=True, default=str).encode())
    return int.from_bytes(digest.digest()[:8], "little")


def _write_wav(path: Path, samples: np.ndarray, sample_rate: int, bits: int, preset: Preset) -> None:
    if bits == 24:
        sf.write(path, samples, sample_rate, subtype="PCM_24")
    elif bits == 32:
        sf.write(path, samples.astype(np.float32), sample_rate, subtype="FLOAT")
    elif bits == 16:
        ints, _ = tpdf_dither_to_int16(samples, seed=_dither_seed(samples, preset))
        sf.write(path, ints, sample_rate, subtype="PCM_16")
    else:
        raise ExportError(f"Unsupported bit depth {bits}. Valid: {VALID_BIT_DEPTHS}")


def _checklist(
    output_analysis: AnalysisReport, preset: Preset, achieved_lufs: float, out_path: Path
) -> dict[str, bool]:
    return {
        "no_clipping": not output_analysis.has_clipping,
        "peak_within_ceiling": output_analysis.true_peak_dbtp <= preset.ceiling_dbtp + 0.05,
        "loudness_within_tolerance": abs(achieved_lufs - preset.target_lufs) <= 1.0,
        "valid_stereo": output_analysis.n_channels in (1, 2),
        "export_succeeded": out_path.exists() and out_path.stat().st_size > 0,
        "output_is_wav": out_path.suffix.lower() == ".wav",
    }


def export_master(
    result: MasterResult,
    input_analysis: AnalysisReport,
    preset: Preset,
    original_path: str,
    out_dir: str,
    bit_depth: int | None = None,
    stage_meta: list[dict] | None = None,
    processing_seconds: float | None = None,
    trim_silence: bool = False,
    fade_in_ms: float = 0.0,
    fade_out_ms: float = 0.0,
) -> ExportResult:
    started = time.monotonic()
    bits = bit_depth or preset.bit_depth
    if bits not in VALID_BIT_DEPTHS:
        raise ExportError(f"Unsupported bit depth {bits}. Valid: {VALID_BIT_DEPTHS}")
    out_root = Path(out_dir)
    try:
        out_root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ExportError(f"Cannot create output directory {out_root}: {exc}") from exc

    final_samples = apply_trim_and_fades(
        result.samples, result.sample_rate,
        trim_silence=trim_silence, fade_in_ms=fade_in_ms, fade_out_ms=fade_out_ms,
    )
    warnings = list(result.warnings)
    if trim_silence or fade_in_ms > 0 or fade_out_ms > 0:
        warnings.append(
            "Output stats (incl. LUFS in filename/checklist) are re-measured after "
            "trim/fades, so they can differ slightly from the render target."
        )
    result = MasterResult(final_samples, result.sample_rate, result.stage_meta, warnings)
    output_analysis = analyze(result.samples, result.sample_rate)
    achieved = output_analysis.integrated_lufs
    name = build_filename(Path(original_path).stem, preset.id, achieved, result.sample_rate, bits)
    out_path = _claim_unique_path(out_root / name)
    try:
        _write_wav(out_path, result.samples, result.sample_rate, bits, preset)
    except Exception as exc:
        # The name was claimed (O_EXCL) before writing — remove the empty
        # placeholder so a retry doesn't roll to __2 for no reason.
        out_path.unlink(missing_ok=True)
        if isinstance(exc, (OSError, sf.LibsndfileError)):
            raise ExportError(f"Failed writing {out_path.name}: {exc}") from exc
        raise

    checklist = _checklist(output_analysis, preset, achieved, out_path)
    report = reports.build_report(
        original_path=original_path,
        out_path=str(out_path),
        input_analysis=input_analysis,
        output_analysis=output_analysis,
        preset=preset,
        bit_depth=bits,
        stage_meta=stage_meta or result.stage_meta,
        warnings=result.warnings,
        checklist=checklist,
        processing_seconds=processing_seconds
        if processing_seconds is not None
        else time.monotonic() - started,
    )
    json_path = out_path.with_suffix(".report.json")
    txt_path = out_path.with_suffix(".report.txt")
    json_path.write_text(json.dumps(report, indent=2))
    txt_path.write_text(reports.render_txt(report))
    return ExportResult(
        out_path=str(out_path),
        json_report_path=str(json_path),
        txt_report_path=str(txt_path),
        output_analysis=output_analysis,
        checklist=checklist,
    )
