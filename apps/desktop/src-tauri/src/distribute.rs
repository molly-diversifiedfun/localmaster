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
//!   `plugins.example.json` for the documented shape.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::Serialize;

const PLUGINS_CONFIG_RELATIVE_PATH: &str = ".localmaster/plugins.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributeOutcome {
    pub plugin_invoked: bool,
    pub plugin_id: Option<String>,
}

/// Reads `~/.localmaster/plugins.json` (`{"<id>": "<command>"}`). Returns
/// `Ok(None)` when the file doesn't exist (the normal "no plugin
/// configured" case — NOT an error). A BTreeMap gives deterministic
/// (sorted-by-id) selection when more than one plugin is configured.
fn read_plugin_config(home_dir: &PathBuf) -> Result<Option<BTreeMap<String, String>>, String> {
    let path = home_dir.join(PLUGINS_CONFIG_RELATIVE_PATH);
    if !path.exists() {
        return Ok(None);
    }
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

    let status = std::process::Command::new(&command)
        .arg(&bundle_dir)
        .status()
        .map_err(|e| format!("Failed to launch plugin '{plugin_id}' ({command}): {e}"))?;

    if !status.success() {
        return Err(format!(
            "Plugin '{plugin_id}' exited with an error{}",
            status
                .code()
                .map(|c| format!(" (code {c})"))
                .unwrap_or_default()
        ));
    }

    Ok(DistributeOutcome { plugin_invoked: true, plugin_id: Some(plugin_id) })
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
}
