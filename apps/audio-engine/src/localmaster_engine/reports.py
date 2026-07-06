"""Report builders: machine JSON + human-readable TXT sidecars."""
from __future__ import annotations

from localmaster_engine.analysis import AnalysisReport
from localmaster_engine.presets import Preset


def _slim(analysis: AnalysisReport) -> dict:
    data = analysis.to_dict()
    data.pop("waveform_overview", None)
    data.pop("short_term_lufs", None)
    return data


def _checklist_key(profile: str) -> str:
    return "release_readiness_checklist" if profile == "release" else "dj_readiness_checklist"


def build_report(
    *,
    original_path: str,
    out_path: str,
    input_analysis: AnalysisReport,
    output_analysis: AnalysisReport,
    preset: Preset,
    bit_depth: int,
    stage_meta: list[dict],
    warnings: list[str],
    checklist: dict[str, bool],
    processing_seconds: float,
    profile: str = "dj",
) -> dict:
    report = {
        "tool": "LocalMaster (deterministic analysis-driven DSP — not AI mastering)",
        "original_file": original_path,
        "output_file": out_path,
        "preset": preset.to_dict(),
        "export_bit_depth": bit_depth,
        "input": _slim(input_analysis),
        "output": _slim(output_analysis),
        "stages": stage_meta,
        "warnings": warnings,
        "profile": profile,
        "processing_seconds": round(processing_seconds, 2),
    }
    report[_checklist_key(profile)] = checklist
    return report


def _fmt_check(ok: bool) -> str:
    return "PASS" if ok else "FAIL"


def render_txt(report: dict) -> str:
    inp, out, preset = report["input"], report["output"], report["preset"]
    profile = report.get("profile", "dj")
    checklist_key = _checklist_key(profile)
    checklist_label = "Release readiness checklist:" if profile == "release" else "DJ readiness checklist:"
    lines = [
        "LocalMaster Report",
        "=" * 60,
        f"Source:  {report['original_file']}",
        f"Output:  {report['output_file']}",
        f"Preset:  {preset['name']}  (deterministic DSP — not AI mastering)",
        "",
        f"{'':24}{'Input':>12}{'Output':>12}",
        f"{'Integrated LUFS':24}{inp['integrated_lufs']:>12}{out['integrated_lufs']:>12}",
        f"{'True peak dBTP':24}{inp['true_peak_dbtp']:>12}{out['true_peak_dbtp']:>12}",
        f"{'Loudness range LU':24}{inp['loudness_range_lu']:>12}{out['loudness_range_lu']:>12}",
        f"{'Sample rate':24}{inp['sample_rate']:>12}{out['sample_rate']:>12}",
        "",
        f"Target: {preset['target_lufs']} LUFS at {preset['ceiling_dbtp']} dBTP ceiling "
        f"(transient guard budget {preset['gr_budget_db']} dB)",
        f"Export bit depth: {report['export_bit_depth']}-bit",
        "",
        checklist_label,
    ]
    for key, ok in report[checklist_key].items():
        lines.append(f"  [{_fmt_check(ok):4}] {key.replace('_', ' ')}")
    if report["warnings"]:
        lines.append("")
        lines.append("Warnings:")
        lines.extend(f"  ! {w}" for w in report["warnings"])
    lines.append("")
    lines.append(f"Processing time: {report['processing_seconds']}s. 100% local — no network used.")
    return "\n".join(lines) + "\n"
