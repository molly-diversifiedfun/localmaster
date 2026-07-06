//! "Distribute…" plugin hook (ADR 003 —
//! docs/decisions/003-distribution-plugin-interface.md). LocalMaster ships
//! MIT-public and knows nothing about any specific distributor; it only
//! knows how to run a user-configured LOCAL command against a release
//! bundle directory.
//!
//! Security notes (why this needs no new Tauri capability entry):
//! - `run_distribute_plugin` is an app-level command registered directly via
//!   `tauri::generate_handler!` in lib.rs, not a plugin command — Tauri's
//!   default-allow-your-own-commands behavior covers it, matching every
//!   other command in this crate (none currently declare capability
//!   permissions; see capabilities/default.json, which only lists the
//!   third-party dialog/shell PLUGIN permissions this app actually uses).
//! - The command never runs a shell string: the configured plugin path and
//!   the bundle dir are passed as separate argv entries to
//!   `std::process::Command`, so a plugin id/command string containing
//!   shell metacharacters cannot escalate into shell injection.
//! - The config file (`~/.localmaster/plugins.json`) is local-user-owned,
//!   gitignored, and never shipped by this repo — see
//!   `plugins.example.json` for the documented shape. `check_config_permissions`
//!   additionally refuses to read it if it's group- or world-writable, since
//!   something other than the owning user could otherwise plant a command
//!   there for this app to execute.

use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;

const PLUGINS_CONFIG_RELATIVE_PATH: &str = ".localmaster/plugins.json";

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DistributeOutcome {
    pub plugin_invoked: bool,
    pub plugin_id: Option<String>,
}

/// Refuses to trust a plugins.json that anyone other than its owner could
/// have written to. Unix-only: Windows' ACL-based permission model doesn't
/// map onto POSIX mode bits, so this defense-in-depth check is a no-op
/// there for now (the file still has to live under the user's own home
/// directory either way).
#[cfg(unix)]
fn check_config_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Could not stat {}: {e}", path.display()))?;
    let mode = metadata.permissions().mode();
    // Group- (0o020) or world- (0o002) writable: someone other than the
    // owning user could plant/alter a command here.
    if mode & 0o022 != 0 {
        return Err(format!(
            "{} is group- or world-writable (mode {mode:o}) -- refusing to \
             read it, since another user could plant a command here. Run \
             `chmod 600 {}` to fix.",
            path.display(),
            path.display()
        ));
    }
    Ok(())
}

#[cfg(not(unix))]
fn check_config_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// Reads `~/.localmaster/plugins.json` (`{"<id>": "<command>"}`). Returns
/// `Ok(None)` when the file doesn't exist (the normal "no plugin
/// configured" case — NOT an error). A BTreeMap gives deterministic
/// (sorted-by-id) selection when more than one plugin is configured.
fn read_plugin_config(home_dir: &Path) -> Result<Option<BTreeMap<String, String>>, String> {
    let path = home_dir.join(PLUGINS_CONFIG_RELATIVE_PATH);
    if !path.exists() {
        return Ok(None);
    }
    check_config_permissions(&path)?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Could not read {}: {e}", path.display()))?;
    let plugins: BTreeMap<String, String> = serde_json::from_str(&raw)
        .map_err(|e| format!("{} is invalid JSON: {e}", path.display()))?;
    // Defensive: a leading underscore marks a comment/metadata key (e.g. a
    // user pasting a "_comment" field from documentation) rather than a
    // real plugin id — never treat it as a command to execute.
    let plugins = plugins
        .into_iter()
        .filter(|(id, _)| !id.starts_with('_'))
        .collect();
    Ok(Some(plugins))
}

/// The plugin contract's argv (ADR 003 v1: `<command> <absolute-bundle-dir>`)
/// — a pure, unit-testable seam kept separate from actually spawning the
/// process (which needs a real OS process to exercise otherwise).
fn plugin_argv(bundle_dir: &str) -> Vec<String> {
    vec![bundle_dir.to_string()]
}

/// Interprets a finished plugin process's exit status — also kept separate
/// from spawning so it's testable without running a real subprocess (see
/// the unix `ExitStatusExt::from_raw` tests below).
fn interpret_exit(plugin_id: &str, status: std::process::ExitStatus) -> Result<DistributeOutcome, String> {
    if status.success() {
        return Ok(DistributeOutcome {
            plugin_invoked: true,
            plugin_id: Some(plugin_id.to_string()),
        });
    }
    Err(format!(
        "Plugin '{plugin_id}' exited with an error{}",
        status
            .code()
            .map(|c| format!(" (code {c})"))
            .unwrap_or_default()
    ))
}

#[tauri::command]
pub fn run_distribute_plugin(
    app: tauri::AppHandle,
    bundle_dir: String,
) -> Result<DistributeOutcome, String> {
    use tauri::Manager;

    let home_dir = app
        .path()
        .home_dir()
        .map_err(|e| format!("Could not resolve the home directory: {e}"))?;

    let plugins = read_plugin_config(&home_dir)?;
    let Some((plugin_id, command)) = plugins.and_then(|m| m.into_iter().next()) else {
        return Ok(DistributeOutcome { plugin_invoked: false, plugin_id: None });
    };

    // `command` is looked up via this GUI process's PATH, which — unlike an
    // interactive shell's PATH — is typically the OS's minimal default
    // (e.g. a macOS app launched from Finder/Dock does not inherit
    // ~/.zshrc's PATH). Document plugins.json entries as absolute paths
    // (see plugins.example.json) to avoid a "command not found" surprise.
    let status = std::process::Command::new(&command)
        .args(plugin_argv(&bundle_dir))
        .status()
        .map_err(|e| format!("Failed to launch plugin '{plugin_id}' ({command}): {e}"))?;

    interpret_exit(&plugin_id, status)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_config_file_is_not_an_error() {
        let home = std::env::temp_dir().join(format!(
            "localmaster-test-missing-{}",
            std::process::id()
        ));
        let result = read_plugin_config(&home).expect("missing file must be Ok(None)");
        assert!(result.is_none());
    }

    #[test]
    fn invalid_json_is_a_clear_error() {
        let home = std::env::temp_dir().join(format!(
            "localmaster-test-invalid-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(home.join(".localmaster")).unwrap();
        std::fs::write(home.join(".localmaster").join("plugins.json"), "not json").unwrap();
        let err = read_plugin_config(&home).expect_err("invalid JSON must be Err");
        assert!(err.contains("invalid JSON"));
        std::fs::remove_dir_all(&home).ok();
    }

    #[test]
    fn valid_config_parses_into_a_sorted_map() {
        let home = std::env::temp_dir().join(format!(
            "localmaster-test-valid-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(home.join(".localmaster")).unwrap();
        std::fs::write(
            home.join(".localmaster").join("plugins.json"),
            r#"{"distrokid-uploader": "/usr/local/bin/distrokid-uploader"}"#,
        )
        .unwrap();
        let plugins = read_plugin_config(&home).unwrap().unwrap();
        assert_eq!(
            plugins.get("distrokid-uploader").map(String::as_str),
            Some("/usr/local/bin/distrokid-uploader")
        );
        std::fs::remove_dir_all(&home).ok();
    }

    // Reviewer finding #5: refuse a plugins.json that isn't owner-only
    // writable (Unix mode bits; a no-op check on non-Unix targets, see
    // check_config_permissions above).
    #[cfg(unix)]
    #[test]
    fn world_writable_config_is_refused() {
        use std::os::unix::fs::PermissionsExt;

        let home = std::env::temp_dir().join(format!(
            "localmaster-test-worldwritable-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(home.join(".localmaster")).unwrap();
        let path = home.join(".localmaster").join("plugins.json");
        std::fs::write(
            &path,
            r#"{"distrokid-uploader": "/usr/local/bin/distrokid-uploader"}"#,
        )
        .unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o666)).unwrap();

        let err = read_plugin_config(&home).expect_err("world-writable config must be refused");
        assert!(err.contains("writable"));

        std::fs::remove_dir_all(&home).ok();
    }

    #[cfg(unix)]
    #[test]
    fn group_writable_config_is_also_refused() {
        use std::os::unix::fs::PermissionsExt;

        let home = std::env::temp_dir().join(format!(
            "localmaster-test-groupwritable-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(home.join(".localmaster")).unwrap();
        let path = home.join(".localmaster").join("plugins.json");
        std::fs::write(
            &path,
            r#"{"distrokid-uploader": "/usr/local/bin/distrokid-uploader"}"#,
        )
        .unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o660)).unwrap();

        let err = read_plugin_config(&home).expect_err("group-writable config must be refused");
        assert!(err.contains("writable"));

        std::fs::remove_dir_all(&home).ok();
    }

    #[cfg(unix)]
    #[test]
    fn owner_only_writable_config_is_accepted() {
        use std::os::unix::fs::PermissionsExt;

        let home = std::env::temp_dir().join(format!(
            "localmaster-test-ownerwritable-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(home.join(".localmaster")).unwrap();
        let path = home.join(".localmaster").join("plugins.json");
        std::fs::write(
            &path,
            r#"{"distrokid-uploader": "/usr/local/bin/distrokid-uploader"}"#,
        )
        .unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();

        let plugins = read_plugin_config(&home).expect("owner-only-writable config must be Ok");
        assert!(plugins.is_some());

        std::fs::remove_dir_all(&home).ok();
    }

    // LOW-priority seam (reviewer): argv construction + non-zero-exit
    // surfacing are the least-verified path since Rust isn't compiled in
    // CI. These pure functions can be exercised without spawning a real
    // process.
    #[test]
    fn plugin_argv_passes_the_bundle_dir_as_a_single_arg() {
        assert_eq!(
            plugin_argv("/out/Molly S - Night Drive"),
            vec!["/out/Molly S - Night Drive".to_string()]
        );
    }

    #[cfg(unix)]
    #[test]
    fn interpret_exit_success_reports_plugin_invoked() {
        use std::os::unix::process::ExitStatusExt;

        let status = std::process::ExitStatus::from_raw(0);
        let outcome =
            interpret_exit("distrokid-uploader", status).expect("success must be Ok");
        assert!(outcome.plugin_invoked);
        assert_eq!(outcome.plugin_id.as_deref(), Some("distrokid-uploader"));
    }

    #[cfg(unix)]
    #[test]
    fn interpret_exit_failure_surfaces_the_plugin_id_and_exit_code() {
        use std::os::unix::process::ExitStatusExt;

        let status = std::process::ExitStatus::from_raw(1 << 8); // exit code 1
        let err = interpret_exit("distrokid-uploader", status)
            .expect_err("non-zero exit must be Err");
        assert!(err.contains("distrokid-uploader"));
        assert!(err.contains("code 1"));
    }
}
