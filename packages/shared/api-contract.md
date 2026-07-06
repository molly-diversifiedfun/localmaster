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

### `POST /reference-analyze` body `{"path": string}`
→ `202 {"job_id": string}`.
Job result: `ReferenceProfile` (see below). Pure function of the file — safe
for the client to cache keyed on the reference path.

### `POST /master` body:
```json
{"path": string, "preset_id": string, "overrides": {<any Preset field>}?,
 "reference_path": string?, "match_strength": number = 0.35}
```
`reference_path`, if given, is loaded and analyzed server-side in the job
worker (an invalid reference file produces a normal job `error`, not a
synchronous 4xx — same treatment as `path`). `match_strength` (0..1,
conservative default 0.35 — the reference-matching stage shapes spectrum and
stereo width toward the reference at this strength; program loudness always
stays owned by the loudness stage). An out-of-range `match_strength` is
rejected synchronously (`422 invalid_match_strength`).
→ `202 {"job_id": string}`.
Job result:
```json
{
  "preview_path": string,          // rendered 32f WAV in the preview cache dir
  "input_analysis": AnalysisReport,
  "output_analysis": AnalysisReport,
  "stage_meta": object[],          // per-stage params incl. loudness iterations
                                    // and, if reference_path was given, a
                                    // "reference_match" stage entry:
                                    // {"stage": "reference_match", "strength": number,
                                    //  "applied": bool, "n_pieces_loudest": int,
                                    //  "reference_piece_gated_lufs": number,
                                    //  "reference_mid_side_ratio_db": number,
                                    //  "mid_band_deltas_db": {<band label e.g. "63hz">: number, ...},
                                    //  "side_band_deltas_db": {<band label>: number, ...}}
                                    // mid/side_band_deltas_db are label->dB records keyed
                                    // by band (NOT arrays) — 10 bands, engine's own order.
  "warnings": string[],
  "ab_gain_db": number             // ADD to master playback gain (≤0) for
}                                  // volume-matched A/B vs the original
```

### `POST /export` body:
```json
{"path": string, "preset_id": string, "overrides": object?,
 "reference_path": string?, "match_strength": number = 0.35,
 "out_dir": string, "bit_depth": 16|24|32?,
 "trim_silence": bool = false, "fade_in_ms": number = 0, "fade_out_ms": number = 0,
 "profile": "dj"|"release" = "dj", "metadata": TrackMetadata?}
```
Re-renders deterministically (bit-identical to the preview) and writes
`{orig}__LocalMaster__{preset}__{LUFS}LUFS__{sr}Hz__{bits}bit.wav` + sidecars
into `out_dir`. `profile` is synchronously validated (`422 invalid_profile`
if not `"dj"|"release"`), mirroring `preset_id`/`match_strength`.

`profile: "release"` selects the release checklist (adds
`accepted_streaming_specs`, see below) instead of the DJ checklist. When
`metadata` (TrackMetadata, below) is ALSO given — independent of `profile` —
the engine writes `out_dir/metadata.json` and, if `metadata.artworkPath` is
set, copies that file into `out_dir` and rewrites `artworkPath` in the
written sidecar to the bundle-relative filename. Missing artwork raises a
normal `ExportError` (`422`). `out_dir` is the **release bundle dir** (ADR
003) once it holds the master WAV + `metadata.json` + artwork + reports —
that's the directory a distribute plugin is invoked against.

→ `202 {"job_id": string}`.
Job result:
```json
{"out_path": string, "json_report_path": string, "txt_report_path": string,
 "checklist": {"no_clipping": bool, "peak_within_ceiling": bool,
   "loudness_within_tolerance": bool, "valid_stereo": bool,
   "export_succeeded": bool, "output_is_wav": bool,
   "accepted_streaming_specs": bool?},  // present only when profile="release"
 "output_analysis": AnalysisReport,
 "metadata_path": string|null}         // null unless `metadata` was given
```

## TrackMetadata shape (ADR 003 — frozen; mirrors `metadata.json` in the bundle)
```json
{"title": string, "artist": string, "isrc": string?,
 "primaryGenre": string, "secondaryGenre": string?,
 "explicit": bool, "artworkPath": string,   // absolute on input; bundle-relative once written
 "recordLabel": string?, "releaseDate": string?}   // releaseDate is YYYY-MM-DD
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

## ReferenceProfile shape
```json
{"sample_rate": int, "freqs_hz": number[], "mid_spectrum": number[],
 "side_spectrum": number[],           // averaged loudest-pieces STFT magnitude
                                       // (mid/side decomposition), same length as freqs_hz
 "piece_gated_lufs": number,          // BS.1770 loudness over the loudest pieces only
 "mid_side_ratio_db": number,         // side RMS relative to mid RMS (width reference)
 "true_peak_dbtp": number,
 "n_pieces_total": int, "n_pieces_loudest": int, "piece_seconds": number}
```

## Preset fields (all overridable)
`id, name, description, target_lufs, ceiling_dbtp, gr_budget_db, highpass_hz,
eq_bands: [{freq_hz, gain_db, q, kind}], comp_threshold_db, comp_ratio,
comp_attack_ms, comp_release_ms, comp_knee_db, saturation_drive, saturation_mix,
stereo_width, mono_bass_hz, limiter_lookahead_ms, limiter_release_ms,
bit_depth, remove_dc`
