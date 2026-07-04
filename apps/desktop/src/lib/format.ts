/** Pure formatting/naming helpers shared across screens. */

export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
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
