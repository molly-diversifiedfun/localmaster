/**
 * TypeScript mirror of the LocalMaster engine HTTP contract.
 * Source of truth: packages/shared/api-contract.md (frozen for MVP).
 * Keep in lockstep with apps/audio-engine/src/localmaster_engine/{analysis,presets}.py.
 */

export interface SpectralBalance {
  low: number;
  low_mid: number;
  mid: number;
  high_mid: number;
  high: number;
}

export type WaveformBin = [min: number, max: number];

export interface AnalysisReport {
  sample_rate: number;
  n_channels: number;
  duration_seconds: number;
  bit_depth: number | null;
  integrated_lufs: number;
  short_term_lufs: number[];
  loudness_range_lu: number;
  true_peak_dbtp: number;
  sample_peak_dbfs: number;
  spectral_balance: SpectralBalance;
  dc_offset: number[];
  has_dc_offset: boolean;
  clipped_regions: number;
  has_clipping: boolean;
  has_excessive_sub_bass: boolean;
  has_harshness: boolean;
  stereo_imbalance_db: number;
  has_stereo_imbalance: boolean;
  waveform_overview: WaveformBin[];
}

export type EqBandKind = "peaking" | "low_shelf" | "high_shelf";

export interface EqBand {
  freq_hz: number;
  gain_db: number;
  q: number;
  kind: EqBandKind;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  target_lufs: number;
  ceiling_dbtp: number;
  gr_budget_db: number;
  highpass_hz: number;
  eq_bands: EqBand[];
  comp_threshold_db: number;
  comp_ratio: number;
  comp_attack_ms: number;
  comp_release_ms: number;
  comp_knee_db: number;
  saturation_drive: number;
  saturation_mix: number;
  stereo_width: number;
  mono_bass_hz: number;
  limiter_lookahead_ms: number;
  limiter_release_ms: number;
  bit_depth: 16 | 24 | 32;
  remove_dc: boolean;
}

/** Any Preset field may be overridden per-render; values are partial + untyped-at-the-edge. */
export type PresetOverrides = Partial<
  Omit<Preset, "id" | "name" | "description">
>;

export interface PresetsResponse {
  presets: Preset[];
}

export type BitDepth = 16 | 24 | 32;

export interface MasterRequest {
  path: string;
  preset_id: string;
  overrides?: PresetOverrides;
}

export interface StageMeta {
  stage: string;
  [key: string]: unknown;
}

export interface MasterJobResult {
  preview_path: string;
  input_analysis: AnalysisReport;
  output_analysis: AnalysisReport;
  stage_meta: StageMeta[];
  warnings: string[];
  /** Add to master playback gain (always <= 0) for volume-matched A/B vs the original. */
  ab_gain_db: number;
}

export interface ExportRequest {
  path: string;
  preset_id: string;
  overrides?: PresetOverrides;
  out_dir: string;
  bit_depth?: BitDepth;
}

export interface ExportChecklist {
  no_clipping: boolean;
  peak_within_ceiling: boolean;
  loudness_within_tolerance: boolean;
  valid_stereo: boolean;
  export_succeeded: boolean;
  output_is_wav: boolean;
}

export interface ExportJobResult {
  out_path: string;
  json_report_path: string;
  txt_report_path: string;
  checklist: ExportChecklist;
  output_analysis: AnalysisReport;
}

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobError {
  code: string;
  message: string;
}

export interface JobStateResponse<TResult = unknown> {
  status: JobStatus;
  progress: number;
  stage: string | null;
  result: TResult | null;
  error: JobError | null;
}

export interface AnalyzeJobAccepted {
  job_id: string;
}

export interface HealthResponse {
  status: "ok";
  version: string;
  engine: "localmaster";
}

export interface ShutdownResponse {
  status: "shutting_down";
}

export interface ApiErrorBody {
  error: JobError;
}
