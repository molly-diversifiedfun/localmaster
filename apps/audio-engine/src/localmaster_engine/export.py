"""Export: WAV 24/16/32f (+FLAC), deterministic dither seeding, sidecar reports.

Strictly non-destructive: only ever writes NEW files into the output directory.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
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

# Release-profile checklist (ADR 003 / docs/plans/2026-07-05-release-export.md):
# specs accepted by the major streaming platforms for a delivered master.
ACCEPTED_STREAMING_SAMPLE_RATES = (44100, 48000)
ACCEPTED_STREAMING_BIT_DEPTHS = (16, 24)


class ExportError(Exception):
    """User-facing export failure."""


@dataclass(frozen=True)
class ExportResult:
    out_path: str
    json_report_path: str
    txt_report_path: str
    output_analysis: AnalysisReport
    checklist: dict[str, bool]
    metadata_path: str | None = None


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


_UNSAFE_BUNDLE_NAME_CHARS = re.compile(r'[\\/:*?"<>|]')


def _sanitize_bundle_name(name: str) -> str:
    """Filesystem-safe directory name — strips path separators and other
    cross-platform-unsafe characters, collapses whitespace."""
    cleaned = _UNSAFE_BUNDLE_NAME_CHARS.sub("_", name.strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or "release"


def _claim_unique_dir(path: Path) -> Path:
    """Directory analog of _claim_unique_path: never reuse an existing
    release bundle dir (which would let a 2nd track's metadata.json/artwork
    silently clobber the 1st's, since neither has any other collision
    protection). On collision, appends __2, __3, …"""
    candidates = (
        path if n == 1 else path.with_name(f"{path.name}__{n}")
        for n in range(1, 1000)
    )
    for candidate in candidates:
        try:
            candidate.mkdir(parents=True, exist_ok=False)
            return candidate
        except FileExistsError:
            continue
    raise ExportError(f"Could not find a free bundle directory near {path.name}")


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
    output_analysis: AnalysisReport,
    preset: Preset,
    achieved_lufs: float,
    out_path: Path,
    bits: int,
    profile: str = "dj",
) -> dict[str, bool]:
    checklist = {
        "no_clipping": not output_analysis.has_clipping,
        "peak_within_ceiling": output_analysis.true_peak_dbtp <= preset.ceiling_dbtp + 0.05,
        "loudness_within_tolerance": abs(achieved_lufs - preset.target_lufs) <= 1.0,
        "valid_stereo": output_analysis.n_channels in (1, 2),
        "export_succeeded": out_path.exists() and out_path.stat().st_size > 0,
        "output_is_wav": out_path.suffix.lower() == ".wav",
    }
    if profile == "release":
        checklist["accepted_streaming_specs"] = (
            output_analysis.sample_rate in ACCEPTED_STREAMING_SAMPLE_RATES
            and bits in ACCEPTED_STREAMING_BIT_DEPTHS
        )
    return checklist


def _write_metadata_sidecar(out_root: Path, metadata: dict, master_file: str) -> Path:
    """Writes `metadata.json` (TrackMetadata, packages/shared/types.ts — a
    frozen contract plugins depend on per ADR 003). `masterFile` is always
    set to the bundle-relative wav filename actually written (never taken
    from the caller-supplied dict) so a distribute plugin can locate the
    audio. If `artworkPath` is set, copies that file into the bundle dir and
    rewrites the field to the bundle-relative filename so the bundle is
    self-contained.

    The `dest.exists()` skip-copy guard below is effectively unreachable for
    a release-profile export (export_master claims a FRESH bundle
    subdirectory per call, so `dest` can never already be present) — it's
    kept as defense-in-depth for the non-subdirectoried dj-profile+metadata
    case, where out_root is the shared out_dir."""
    sidecar = dict(metadata)
    artwork_path = sidecar.get("artworkPath")
    if artwork_path:
        src = Path(artwork_path)
        if not src.exists():
            raise ExportError(f"Artwork file not found: {artwork_path}")
        dest = out_root / src.name
        if not dest.exists():
            shutil.copy2(src, dest)
        sidecar["artworkPath"] = dest.name
    sidecar["masterFile"] = master_file
    path = out_root / "metadata.json"
    path.write_text(json.dumps(sidecar, indent=2))
    return path


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
    profile: str = "dj",
    metadata: dict | None = None,
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

    # Release exports get a dedicated per-release subdirectory so a shared
    # out_dir (e.g. the desktop's persisted default export dir) can never
    # let a 2nd track's metadata.json/artwork collide with the 1st's —
    # neither has any other collision protection (unlike the master WAV,
    # which is claim-unique-named on its own). profile and metadata are
    # independent (api-contract.md), so this applies even without metadata,
    # falling back to the original file's stem for the bundle dir name.
    bundle_root = out_root
    if profile == "release":
        if metadata and metadata.get("artist") and metadata.get("title"):
            bundle_name = f"{metadata['artist']} - {metadata['title']}"
        else:
            bundle_name = Path(original_path).stem
        bundle_root = _claim_unique_dir(out_root / _sanitize_bundle_name(bundle_name))

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
    out_path = _claim_unique_path(bundle_root / name)
    try:
        _write_wav(out_path, result.samples, result.sample_rate, bits, preset)
    except Exception as exc:
        # The name was claimed (O_EXCL) before writing — remove the empty
        # placeholder so a retry doesn't roll to __2 for no reason.
        out_path.unlink(missing_ok=True)
        if isinstance(exc, (OSError, sf.LibsndfileError)):
            raise ExportError(f"Failed writing {out_path.name}: {exc}") from exc
        raise

    checklist = _checklist(output_analysis, preset, achieved, out_path, bits, profile=profile)
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
        profile=profile,
    )
    json_path = out_path.with_suffix(".report.json")
    txt_path = out_path.with_suffix(".report.txt")
    json_path.write_text(json.dumps(report, indent=2))
    txt_path.write_text(reports.render_txt(report))
    metadata_path = (
        str(_write_metadata_sidecar(bundle_root, metadata, out_path.name))
        if metadata is not None
        else None
    )
    return ExportResult(
        out_path=str(out_path),
        json_report_path=str(json_path),
        txt_report_path=str(txt_path),
        output_analysis=output_analysis,
        checklist=checklist,
        metadata_path=metadata_path,
    )
