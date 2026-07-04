/**
 * Placeholder text for the About/Notices screen. The verified, complete
 * THIRD_PARTY_NOTICES.md (task 12, packaging) will replace this constant —
 * do not treat this list as legally final.
 */
export const THIRD_PARTY_NOTICES_PLACEHOLDER = `LocalMaster bundles the following open-source components (permissive
licenses only — MIT, BSD, Apache-2.0, or ISC). This is a placeholder list
pending the verified table generated during packaging.

Desktop shell: Tauri, React, React Router, Tailwind CSS.
Audio engine: Python, NumPy, SciPy, soundfile, pyloudnorm, FastAPI, uvicorn.

No GPL, LGPL, or other copyleft-licensed component is bundled with this
application. ffmpeg, when detected on the host system, is invoked as an
external optional binary and is never bundled or redistributed.

Full license texts will ship in THIRD_PARTY_NOTICES.md alongside the
packaged application.`;
