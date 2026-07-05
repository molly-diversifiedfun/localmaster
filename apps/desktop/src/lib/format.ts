/** Pure formatting/naming helpers shared across screens. */
import type { AnalysisReport } from "@shared/types";

export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx <= 0 ? path : path.slice(0, idx);
}

export function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx <= 0 ? filename : filename.slice(0, idx);
}

export function formatLufs(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `${value.toFixed(1)} LUFS`;
}

export function formatDbtp(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `${value.toFixed(1)} dBTP`;
}

export function formatDb(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} dB`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatBitDepth(bitDepth: number): string {
  return `${bitDepth}-bit`;
}

export function formatBitRate(
  bitDepth: number | null,
  sampleRate: number,
): string {
  const bits = bitDepth ?? 32;
  return `${bits}bit/${Math.round(sampleRate / 1000)}k`;
}

/**
 * The matrix-stamp triplet for a measurement — LUFS, true peak, bit/sample
 * rate — joined with " · " by the MatrixStamp component. Kept as pure data
 * here so the signature element stays a dumb renderer.
 */
export function matrixStampValues(analysis: AnalysisReport): string[] {
  return [
    formatLufs(analysis.integrated_lufs),
    formatDbtp(analysis.true_peak_dbtp),
    formatBitRate(analysis.bit_depth, analysis.sample_rate),
  ];
}

/**
 * Mirrors the engine's export naming scheme (signed LUFS to one decimal —
 * see build_filename in export.py) for display purposes only. The engine is
 * the source of truth: it uses the ACHIEVED loudness, which can differ from
 * the target passed here, and it de-duplicates on collision.
 */
export function previewExportFilename(
  originalFilename: string,
  presetId: string,
  targetLufs: number,
  sampleRate: number,
  bitDepth: number,
): string {
  const base = stripExtension(basename(originalFilename));
  return `${base}__LocalMaster__${presetId}__${targetLufs.toFixed(1)}LUFS__${sampleRate}Hz__${bitDepth}bit.wav`;
}
