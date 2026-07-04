# LocalMaster engine HTTP contract (v1 — frozen for MVP)

Base URL: `http://127.0.0.1:48750` (loopback ONLY, never network-exposed).
All request/response bodies JSON. All file paths are absolute local paths.
Errors: HTTP 4xx/5xx with `{"error": {"code": string, "message": string}}`.

## Endpoints

### `GET /health`
→ `200 {"status":"ok","version":"0.1.0","engine":"localmaster"}`

### `POST /shutdown`
→ `200 {"status":"shutting_down"}` then the process exits.

### `GET /presets`
→ `200 {"presets": Preset[]}` — the 7 presets with ALL parameter fields
(editable defaults; UI may override any field per render via `overrides`).

### `POST /analyze` body `{"path": string}`
→ `202 {"job_id": string}`.
Job result: `AnalysisReport` (see below).

### `POST /master` body:
```json
{"path": string, "preset_id": string, "overrides": {<any Preset field>}?}
```
→ `202 {"job_id": string}`.
Job result:
```json
{
  "preview_path": string,          // rendered 32f WAV in the preview cache dir
  "input_analysis": AnalysisReport,
  "output_analysis": AnalysisReport,
  "stage_meta": object[],          // per-stage params incl. loudness iterations
  "warnings": string[],
  "ab_gain_db": number             // ADD to master playback gain (≤0) for
}                                  // volume-matched A/B vs the original
```

### `POST /export` body:
```json
{"path": string, "preset_id": string, "overrides": object?,
 "out_dir": string, "bit_depth": 16|24|32?,
 "trim_silence": bool = false, "fade_in_ms": number = 0, "fade_out_ms": number = 0}
```
Re-renders deterministically (bit-identical to the preview) and writes
`{orig}__LocalMaster__{preset}__{LUFS}LUFS__{sr}Hz__{bits}bit.wav` + sidecars.
→ `202 {"job_id": string}`.
Job result:
```json
{"out_path": string, "json_report_path": string, "txt_report_path": string,
 "checklist": {"no_clipping": bool, "peak_within_ceiling": bool,
   "loudness_within_tolerance": bool, "valid_stereo": bool,
   "export_succeeded": bool, "output_is_wav": bool},
 "output_analysis": AnalysisReport}
```

### `POST /batch` body:
```json
{"paths": string[], "preset_id": string, "overrides": object?,
 "out_dir": string, "bit_depth": 16|24|32?}
```
Two-pass album mastering: pass 1 measures each track's achievable loudness at
the preset target, pass 2 re-renders ALL tracks to the quietest achieved value
(`shared_target_lufs`) so the album is loudness-consistent even when the
transient guard capped one dynamic track.
→ `202 {"job_id": string}`. Job result:
```json
{"shared_target_lufs": number, "warnings": string[],
 "exports": [<ExportJobResult>, ...]}   // one per input path, same order
```

### `GET /jobs/{job_id}`
→ `200 {"status":"queued"|"running"|"done"|"error",
        "progress": number,            // 0..1
        "stage": string|null,          // current chain stage name
        "result": object|null, "error": {"code","message"}|null}`
`404` for unknown job ids.

## AnalysisReport shape
```json
{"sample_rate": int, "n_channels": int, "duration_seconds": number,
 "bit_depth": int|null, "integrated_lufs": number, "short_term_lufs": number[],
 "loudness_range_lu": number, "true_peak_dbtp": number, "sample_peak_dbfs": number,
 "spectral_balance": {"low","low_mid","mid","high_mid","high": number},
 "dc_offset": number[], "has_dc_offset": bool, "clipped_regions": int,
 "has_clipping": bool, "has_excessive_sub_bass": bool, "has_harshness": bool,
 "stereo_imbalance_db": number, "has_stereo_imbalance": bool,
 "leading_silence_seconds": number, "trailing_silence_seconds": number,
 "waveform_overview": [ [min,max], ... ]}   // 1000 bins for UI rendering
```

## Preset fields (all overridable)
`id, name, description, target_lufs, ceiling_dbtp, gr_budget_db, highpass_hz,
eq_bands: [{freq_hz, gain_db, q, kind}], comp_threshold_db, comp_ratio,
comp_attack_ms, comp_release_ms, comp_knee_db, saturation_drive, saturation_mix,
stereo_width, mono_bass_hz, limiter_lookahead_ms, limiter_release_ms,
bit_depth, remove_dc`
