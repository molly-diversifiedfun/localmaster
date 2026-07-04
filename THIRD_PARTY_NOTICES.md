# Third-party notices

LocalMaster is MIT-licensed. It depends only on permissive open-source
components, verified against primary sources on 2026-07-04 (PyPI license
expressions/classifiers, npm registry metadata, crates.io metadata, and
upstream repository license files).

## Engine (Python, bundled in the sidecar)

| Component | Version | License | Notes |
|---|---|---|---|
| numpy | ≥2.2 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 | PyPI license expression |
| scipy | ≥1.15 | BSD-3-Clause | |
| soundfile | ≥0.13 | BSD-3-Clause | wheel bundles libsndfile (below) |
| **libsndfile** | 1.2.x (via soundfile wheel) | **LGPL-2.1** | dynamically linked; shipped as a separate, user-replaceable dylib in the onedir bundle (LGPL §6). The wheel's libsndfile build includes mpg123/LAME (LGPL) for MP3 decode — same treatment. |
| pyloudnorm | ≥0.1.1 | MIT | BS.1770 loudness |
| fastapi | ≥0.115 | MIT | |
| uvicorn | ≥0.34 | BSD-3-Clause | |
| pydantic | 2.x | MIT | |
| PyInstaller | ≥6.21 (build-time only) | GPL-2.0-or-later **with bootloader exception** | build tool; the exception explicitly permits embedding the compiled bootloader in applications under any license. Not a runtime dependency. |

## Desktop (Tauri / web)

| Component | Version | License |
|---|---|---|
| tauri, tauri-build, tauri-plugin-shell (+ plugins) | 2.x | Apache-2.0 OR MIT |
| @tauri-apps/api, @tauri-apps/cli | 2.x | Apache-2.0 OR MIT |
| react, react-dom | 19.x | MIT |
| vite | 8.x | MIT |
| typescript | 6.x | Apache-2.0 |
| tailwindcss | 4.x | MIT |

## Storage

| Component | License |
|---|---|
| SQLite (if/when used) | Public domain (sqlite.org/copyright) |

## Explicitly excluded

- **pedalboard** — GPLv3, statically links JUCE and the VST3 SDK (both GPLv3).
  Linking it would force LocalMaster to GPLv3. All DSP is implemented directly
  on numpy/scipy instead.
- **ffmpeg** — never bundled or linked. Many distributed builds contain GPL
  components. LocalMaster only *detects* a user-installed ffmpeg binary on
  PATH (or a user-configured path) and shells out for optional MP3 encode.
- **librosa** — itself ISC, but depends on soxr (LGPL-2.1-or-later) and
  numba/llvmlite. Deferred along with tempo/key estimation; if added post-MVP
  it will be an optional extra with the same dynamic-link discipline.
