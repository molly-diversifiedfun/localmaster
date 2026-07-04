#!/bin/bash
# Build the frozen engine sidecar (PyInstaller onedir) for bundling with Tauri.
#
# onedir (not onefile) is deliberate:
#  - fast startup (no per-launch temp extraction)
#  - the LGPL libsndfile dylib stays a separate, user-replaceable file (LGPL §6)
#
# Output: apps/audio-engine/dist/localmaster-engine/
set -euo pipefail
cd "$(dirname "$0")/.."

uv sync -q
uv run pyinstaller \
  --noconfirm --onedir --name localmaster-engine \
  --log-level WARN \
  --collect-binaries soundfile \
  tools/engine_entry.py

echo
echo "Built: dist/localmaster-engine/"
echo "Smoke test:"
LOCALMASTER_PORT=48799 ./dist/localmaster-engine/localmaster-engine &
PID=$!
for i in $(seq 1 100); do
  curl -sf http://127.0.0.1:48799/health >/dev/null 2>&1 && break
  sleep 0.2
done
curl -s http://127.0.0.1:48799/health; echo
curl -s -X POST http://127.0.0.1:48799/shutdown >/dev/null
wait $PID 2>/dev/null || true
echo "Sidecar smoke test OK."
