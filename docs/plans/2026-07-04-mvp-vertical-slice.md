# LocalMaster MVP Implementation Plan

> **For agentic workers:** Execute task-by-task with tests green before each commit.
> Format deviation from writing-plans skill (per user's working agreement): concise plan —
> exact files, interfaces, commands, acceptance criteria; full code lives in the repo, not here.

**Goal:** Local-first mastering app: import Suno WAV → analyze → Clean DJ Master → volume-matched A/B → 24-bit WAV export + JSON/TXT report. Deterministic DSP, no network, permissive licenses only.

**Architecture:** Tauri 2 desktop shell (React+TS+Vite) spawns a PyInstaller-frozen (onedir) Python FastAPI sidecar bound to `127.0.0.1`. All DSP in numpy/scipy/pyloudnorm. Gate decisions locked 2026-07-04 (see `docs/decisions/001-stack-and-licenses.md`).

**Tech stack:** Python 3.12, numpy 2.5, scipy 1.18, soundfile 0.14, pyloudnorm 0.2, FastAPI, uvicorn · Tauri 2.11 + tauri-plugin-shell · React 19, Vite, TypeScript, wavesurfer.js 7.

## Global constraints (from spec — apply to every task)
- 100% local processing. No uploads/telemetry/analytics. API binds `127.0.0.1` only.
- Non-destructive: input file never modified (byte-hash asserted in tests).
- Deterministic + bit-reproducible for identical input+params (seeded TPDF dither; librosa excluded from guarantee and from MVP).
- Permissive deps only. NO pedalboard (GPLv3). ffmpeg = external path-detected optional binary, never bundled. librosa deferred (soxr is LGPL).
- Never claim "AI mastering" — deterministic, analysis-driven DSP.
- Targets are editable defaults. Transient guard: normalization gain capped so limiter GR ≤ per-preset budget; report when target not reached.
- Synthetic test audio only (generator script); never commit copyrighted audio to the repo.
- Conventional Commits; files < 800 lines; functions ≤ ~40 lines; immutable patterns (return new arrays, never mutate input buffers).

## File map

```
apps/audio-engine/
  pyproject.toml                      # uv-managed; deps pinned
  src/localmaster_engine/
    audio_io.py        # load/validate WAV(+FLAC); decode float32; probe metadata
    analysis.py        # LUFS(I/S), true peak (4x oversampled), sample peak, LRA,
                       # 5-band spectral balance, clipping/DC/sub-bass/harshness/imbalance
    presets.py         # 7 frozen dataclass presets (editable-default values)
    chain/dc_offset.py # mean-subtract DC removal
    chain/highpass.py  # Butterworth SOS HPF (default 30 Hz)
    chain/eq.py        # RBJ biquad peaking/shelf; corrective EQ from analysis+preset
    chain/compressor.py# broadband FF compressor (thr/ratio/attack/release/knee/makeup)
    chain/saturation.py# tanh soft-clip, drive+mix
    chain/stereo.py    # M/S width + mono-bass below crossover (LR4)
    chain/normalize.py # gain toward target LUFS w/ transient-guard GR budget cap
    chain/limiter.py   # lookahead limiter, 4x oversampled peak detection, TP ceiling
    chain/dither.py    # seeded TPDF dither for 16-bit
    pipeline.py        # fixed-order chain runner; per-stage metadata (gains, GR)
    export.py          # naming scheme, PCM_24/PCM_16/FLOAT write, sidecars
    reports.py         # JSON + human TXT report builders
    batch.py           # shared-target loudness consistency across N tracks
    server/app.py      # FastAPI: health, shutdown, analyze, master, export, jobs
    server/jobs.py     # asyncio in-process job store w/ progress
  tools/gen_synthetic.py  # pink noise @ LUFS, sines, -90dB ramp, varied-loudness set
  tests/                  # acceptance tests 1-8 + unit tests per module
apps/desktop/
  src-tauri/           # shell from spike: externalBin sidecar, spawn+health+shutdown
  src/                 # React screens: Home/Import, Analysis, Workspace, Batch,
                       # Export, Settings, About/Notices
packages/shared/api-contract.md + types.ts   # frozen HTTP contract engine<->UI
docs/AUDIO_ENGINE.md · docs/DJ_EXPORT_GUIDE.md · NOTICE.md · THIRD_PARTY_NOTICES.md
```

## API contract (frozen for UI work)
- `GET /health` → `{status:"ok", version}`
- `POST /shutdown` → `{status:"shutting_down"}`
- `POST /analyze {path}` → `202 {job_id}`; result = AnalysisReport (see types.ts)
- `POST /master {path, preset_id, overrides?}` → `202 {job_id}`; result = MasterResult
  (preview_wav_path, output_stats, stage_metadata, warnings, ab_gain_db)
- `POST /export {job_id, out_dir, bit_depth}` → `202 {job_id}`; result = ExportResult
  (out_path, json_report_path, txt_report_path, checklist)
- `GET /jobs/{id}` → `{status: queued|running|done|error, progress: 0-1, result?, error?}`
- All paths absolute local paths. Errors: `{error: {code, message}}` with 4xx/5xx.

## Tasks (vertical slice first: 1→8, then breadth 9→12)

1. **Scaffold + synthetic generator.** `tools/gen_synthetic.py` writes to `examples/generated/`:
   pink noise −20 LUFS, 100 Hz sine, 1 kHz sine, −90 dBFS linear ramp, 5-track varied-loudness
   set (−28…−12 LUFS), 30 s stereo "songlike" synth (kick+noise bursts, transient-rich).
   Test: files exist, correct sr/channels, measured LUFS within ±0.5 of intent. Commit.
2. **audio_io + analysis.** Load/validate; full AnalysisReport. Tests: LUFS of generated
   pink noise ≈ −20 ±0.3; true peak ≥ sample peak; DC/clipping detectors fire on crafted inputs. Commit.
3. **Chain modules + pipeline.** Each module pure `(audio: np.ndarray, sr, params) -> (audio, meta)`.
   Unit tests per module (impulse/sine assertions: HPF −3dB point, comp GR on step, limiter ceiling,
   dither PDF triangular, mono-bass correlation below crossover). Pipeline test: deterministic
   (test 4, bit-identical) on synthetic input. Commit per module group.
4. **Presets + normalize/limiter interplay (Gate 3).** Clean DJ Master targets −9 LUFS/−1.0 dBTP,
   GR budget 4 dB default; transparent report when guard binds.
   Acceptance tests 1 & 2 pass (±1.0 LU; ceiling never exceeded on full synthetic set). Commit.
5. **Export + reports.** Naming `{orig}__LocalMaster__{preset}__{LUFS}LUFS__{sr}Hz__{bits}.wav`,
   sidecars, DJ readiness checklist. Acceptance tests 3 (byte-hash), 7 (format integrity),
   8 (dither) pass. Commit.
6. **No-network guard.** pytest fixture monkeypatching `socket.socket.connect` to raise on any
   non-127.0.0.1 address during analyze/render/export; plus `tools/assert_no_network.py` script
   (runs pipeline under a socket-deny audit hook). Acceptance test 5. Commit.
7. **FastAPI server.** Endpoints per contract; uvicorn `127.0.0.1` only; asyncio job store,
   progress callbacks from pipeline. Tests via httpx ASGI client (no real socket). Commit.
8. **Desktop vertical slice.** Tauri shell (from spike) + React: Import → Analysis → Workspace
   (Clean DJ Master) → volume-matched A/B (Web Audio gain = −|ΔLUFS|, applied to louder side)
   → Export screen. `npm run tauri dev` works end-to-end on a real Suno WAV (acceptance test 9,
   manual + Playwright happy path). Commit.
9. **Breadth: all 7 presets** as editable defaults + overrides UI (right panel controls). Tests: ceiling test across presets. Commit.
10. **Batch/album.** `batch.py` shared-target pick (median target clamped by preset ceiling budget),
    consistent naming, album JSON/TXT. Acceptance test 6 (±1.0 LU across 5 tracks). UI screen. Commit.
11. **Settings/About + ffmpeg detect.** Path detection (`shutil.which` + user override), MP3 decode
    only when present; Settings screen (export dir, bit depth, sr policy, threads, "No telemetry"
    statement); About/Notices renders THIRD_PARTY_NOTICES. Commit.
12. **Packaging + docs.** PyInstaller onedir build script; Tauri resources bundling; `tauri build`
    produces .app; README (install/dev/build/how-to-master-a-Suno-WAV/troubleshooting),
    AUDIO_ENGINE.md, DJ_EXPORT_GUIDE.md, NOTICE.md, THIRD_PARTY_NOTICES.md (from verified table),
    post-MVP roadmap. Commit.

## Commands
- Engine: `cd apps/audio-engine && uv sync && uv run pytest -q`
- Generate fixtures: `uv run python tools/gen_synthetic.py`
- Desktop dev: `cd apps/desktop && npm i && npm run tauri dev`
- One-command dev (root): `make dev` (starts engine uvicorn + vite/tauri)

## Deferred (interfaces only, post-MVP)
Reference matching (screen 4, match-strength slider) · dynamic low-mid · multiband comp ·
tempo/key (librosa optional extra, "approximate" label, never blocks pipeline) · FLAC export polish ·
Windows/Linux packaging · signing/notarization (structured for later distribution).
