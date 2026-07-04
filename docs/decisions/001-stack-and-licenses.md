# ADR 001 — Stack, packaging, and license posture

Date: 2026-07-04 · Status: accepted (gates confirmed by Molly)

## Context
Three pre-build gates: (1) can a Tauri shell reliably run a bundled Python engine,
(2) GPL contamination risk (pedalboard/JUCE/ffmpeg), (3) the −9 LUFS @ −1.0 dBTP
target contradicts "preserve transients."

## Decisions

### 1. Tauri 2 + PyInstaller-frozen Python sidecar (onedir)
Proven by spike on macOS arm64: PyInstaller 6.21 froze FastAPI+uvicorn (Python 3.12)
into a self-contained binary; a windowless Tauri 2.11 app spawned it via
`tauri-plugin-shell` `externalBin`, health-checked `127.0.0.1`, shut it down cleanly
(exit 0, no orphans). Production uses **onedir** (faster startup than onefile's
temp-extraction; keeps LGPL dylibs as separate replaceable files). Rejected:
Electron (10x shell weight, same sidecar problem), Rust-native DSP (re-implements
numpy/scipy/pyloudnorm for no user-visible gain).

### 2. Permissive-only dependency set — LocalMaster is MIT
All licenses verified against primary sources (PyPI license expressions/classifiers,
npm registry, crates.io, repo license files) on 2026-07-04; table in
`THIRD_PARTY_NOTICES.md`. Key rulings:
- **pedalboard excluded** (GPLv3, statically links JUCE + VST3 SDK).
- **ffmpeg never bundled or linked** — external user-installed binary, path-detected,
  optional MP3 decode only (many builds contain GPL components).
- **libsndfile (LGPL-2.1)** ships inside soundfile wheels as a dynamic library; kept
  as a separate file in the onedir bundle → LGPL §6 replaceability satisfied.
- **PyInstaller (GPLv2+ w/ bootloader exception)** is build-time only; the exception
  explicitly permits embedding the compiled bootloader in apps of any license.
- **librosa deferred out of MVP**: itself ISC, but depends on soxr (LGPL-2.1+) and
  numba/llvmlite; tempo/key is a deferred, best-effort feature anyway.

### 3. Loudness vs transients: transient-guard GR budget
Normalization gain toward target LUFS is capped so predicted limiter gain reduction
stays within a per-preset budget (Clean DJ Master: 4 dB; Loud Club: 8 dB). When the
guard binds, the master lands quieter than target and the report/UI state it plainly
("Reached −10.3 LUFS, target −9.0: transient guard capped limiting at 4 dB").
A single Loudness↔Transients control maps to the budget. Targets are editable
defaults, never guarantees. Docs carry the DJ-reality caveat: DJ software gain-stages
anyway; ultra-hot masters mainly cost headroom.

## Consequences
- App distributable under MIT; distribution later needs signing/notarization work
  (structured for, not built in MVP) and the notices file kept in lockstep with deps.
- Clean DJ Master sometimes delivers −10/−11 LUFS on very dynamic material — by design.
- MP3 import may work without ffmpeg (soundfile's libsndfile 1.2.x has mpg123/LAME,
  also LGPL, same dylib treatment) — confirm in code and label.
