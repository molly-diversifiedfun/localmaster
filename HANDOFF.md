# LocalMaster — handoff (2026-07-05, end of build day)

Resume: `make dev` (dev) or `open apps/desktop/src-tauri/target/release/bundle/macos/LocalMaster.app` (packaged). Tests: `make test` (74 engine + 72 desktop). Rebuild app: `make app`.

State: MVP + single-flow UI + **packaged .app** + **reference matching (engine+API only, no UI yet)** — all committed through 431b9ba, all reviewed (no CRITICAL/HIGH open). Clean-room audit passed: reviewer diffed our reference.py against Matchering's GPL source — genuinely independent.

LOCK-IN album mastered → `~/Desktop/Locked In/Masters/` + compare.html (A/B). Molly has NOT yet reported listening verdict on Clean DJ preset — that gates preset tuning.

Next (agreed order):
1. **Reference-matching UI** — "Match a reference…" picker + strength slider in the Adjust drawer; wire reference_path/match_strength through lib/api (contract already updated).
2. **Release-ready export** — streaming variant (−14 LUFS) + DistroKid-spec checklist + metadata sidecar (DistroKid has NO public API — see docs/research note in session; export-profile approach chosen).
3. Style presets (DnB/phonk) + heuristic preset recommend (Ozone rules in research doc §2).
4. Multiband (papers in research doc §3).

Open review notes (non-blocking): engine.rs — crashed sidecar child unreaped until quit (add try_wait poll); reference.py FIR Hann half-sample asymmetry (sub-audible).

Key docs: docs/research/2026-07-04-automatic-mastering-landscape.md (clean-room spec §1 — refmatch builders must NEVER read Matchering source) · docs/decisions/001 + 002 · .design/localmaster-desktop.md (UI law) · packages/shared/api-contract.md (frozen v1).
