# LocalMaster — one command to install, one to run. macOS-first.
ENGINE=apps/audio-engine
DESKTOP=apps/desktop

.PHONY: setup dev engine-dev desktop-dev test test-engine test-desktop fixtures sidecar no-network-proof

setup:            ## install all dependencies (uv + npm)
	cd $(ENGINE) && uv sync
	cd $(DESKTOP) && npm install

dev:              ## start engine + desktop app (dev mode)
	@trap 'kill 0' EXIT; \
	( cd $(ENGINE) && uv run uvicorn localmaster_engine.server.app:app --host 127.0.0.1 --port 48750 ) & \
	( cd $(DESKTOP) && npm run tauri dev )

engine-dev:       ## engine API only, 127.0.0.1:48750
	cd $(ENGINE) && uv run uvicorn localmaster_engine.server.app:app --host 127.0.0.1 --port 48750

desktop-dev:      ## desktop app only (expects engine running)
	cd $(DESKTOP) && npm run tauri dev

test: test-engine test-desktop

test-engine:      ## pytest incl. all acceptance tests
	cd $(ENGINE) && uv run pytest

test-desktop:     ## vitest
	cd $(DESKTOP) && npx vitest run

fixtures:         ## regenerate synthetic test audio
	cd $(ENGINE) && uv run python tools/gen_synthetic.py

sidecar:          ## freeze engine to dist/localmaster-engine (onedir)
	cd $(ENGINE) && ./tools/build_sidecar.sh

no-network-proof: ## prove zero outbound connections during a full run
	cd $(ENGINE) && uv run python tools/assert_no_network.py
