# ADR 003 — Distribution as a generic local plugin (public seam, private implementations)

Date: 2026-07-05 · Status: accepted

## Context
The product goal is a single flow: **master → distribute** (the seam LANDR
monetises — see `docs/research/2026-07-05-distribution-landscape.md`). But the
distributor side is a minefield to ship publicly:

- `localmaster` is a **public** MIT repo. DistroKid (and every artist-facing
  aggregator) prohibits programmatic upload in its ToS. Publishing upload
  automation would put ToS-violating code — and legal exposure — under the
  author's name, publicly indexed.
- A shipped app **cannot** upload to *another user's* DistroKid account anyway
  (per-account, ToS). Real product-grade distribution would require an
  aggregator API (LabelGrid/limbo) = becoming distributor-of-record = a business
  decision, explicitly deferred in the distribution-landscape research.

So the app must integrate distribution without *containing* any specific
distributor's automation.

## Decision
LocalMaster's export produces a **release bundle**, and "Distribute" is a
**generic plugin hook** — the public app knows nothing about DistroKid.

1. **Release bundle** — a directory the streaming/release export writes:
   - `master.wav` — the release master (−14 LUFS / −1.0 dBTP streaming variant)
   - `metadata.json` — `TrackMetadata` (title, artist, ISRC?, primary/secondary
     genre, explicit flag, artwork path, label, release date) covering the
     fields distributors ask for
   - the artwork file (pointed to by `metadata.json`)
   - the existing `.report.json` / `.report.txt`
2. **Plugin hook** — "Distribute…" reads a **user-local, gitignored** config
   (`~/.localmaster/plugins.json`) mapping a plugin id → an executable command.
   It runs `<command> <bundle-dir>`. If no plugin is registered, it falls back to
   opening the distributor's upload page in the browser (`shell:allow-open`).
   The public app ships only the hook + the fallback URL — **no distributor code,
   no record of which plugins are installed** (config is gitignored).
3. **Plugins live in private repos.** The DistroKid uploader
   (`~/github/distrokid-uploader`, never pushed) implements the contract with a
   `distribute <bundle-dir>` CLI. It stays entirely out of this repo.

### Plugin contract (v1)
- A plugin is any executable invoked as `<command> <absolute-bundle-dir>`.
- It reads `<bundle-dir>/metadata.json` (schema = `TrackMetadata` in
  `packages/shared/types.ts`) and the referenced audio + artwork.
- Exit 0 = handed off successfully; non-zero = surfaced to the user.
- Plugins MUST NOT be assumed to complete an irreversible publish
  unattended — the DistroKid plugin, e.g., halts before the final submit.

## Consequences
- `localmaster` stays MIT and publishable with zero ToS exposure; the whole
  master→distribute loop still works on the author's machine via the private
  plugin.
- The bundle format + `TrackMetadata` type are a **frozen contract** (mirror in
  `packages/shared/api-contract.md`) — plugins depend on it.
- Adding a new destination = a new private plugin + one config line, no change to
  the public app.
- If LocalMaster ever becomes a multi-user product, "distribute" for other users
  is a *different* problem (aggregator API / distributor-of-record) — this plugin
  seam is explicitly a **single-operator, local** mechanism, not that.

## Implementation notes (2026-07-05)

- `run_distribute_plugin(bundle_dir)` is a Rust command
  (`apps/desktop/src-tauri/src/distribute.rs`) registered directly via
  `tauri::generate_handler!` in `lib.rs` — an app-level command, not a
  plugin command. It required **no new capability entry** in
  `capabilities/default.json`: Tauri's ACL only gates plugin-namespaced
  permissions (`dialog:*`, `shell:*`, `core:*`); commands an app registers
  itself on its own `invoke_handler` are callable by default, exactly like
  every other command already in this crate (none currently declare
  capability permissions).
- No shell string is ever built: the configured command and the bundle dir
  are passed as separate `std::process::Command` argv entries, so a
  plugin id/command containing shell metacharacters cannot escalate into
  shell injection.
- `~/.localmaster/plugins.json` keys starting with `_` are treated as
  comments/metadata and skipped — defends a user who pastes a documented
  `"_comment"` field into their real config from having it executed as a
  command.
- `plugins.example.json` (repo root of `apps/desktop/`) is a template to
  copy to `~/.localmaster/plugins.json`; it is never read from inside the
  repo.
