//! Runtime half of auto-update (SP1, `.specs/2026-08-06-sp1-release-autoupdate-design.md`).
//!
//! The WHOLE flow lives here, Rust-side, at boot — no JS surface (spec decision 1): the roadmap's
//! Story 2 wants a silent update, so there is no webview permission to grant and no console UI.
//! A dev build never self-updates (`cfg!(debug_assertions)` gate) — `cargo run` replacing itself
//! with a release bundle would be the end of every debugging session.
//!
//! ### Channel resolution (spec decision 2)
//! `CODM_UPDATE_CHANNEL` env wins (CI/tests), else a `update-channel` file in the data dir
//! (`echo beta > .../update-channel` is how a founder machine opts in), else `stable`. The stable
//! endpoint ships inside `tauri.conf.json` (generated from `config/updater.ts`); beta overrides
//! the endpoint list at runtime, below.

use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// MIRROR of `config/updater.ts` `betaEndpoint` — Rust cannot import the TS config, so this names
/// that file as its source of truth, and `config/generate.test.ts` (DSK-07) gates the two copies
/// against drift. Same seam rule as `walker.go` mirroring `template.config.ts`.
const BETA_ENDPOINT: &str = "https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/beta/latest.json";

/// Which update channel this machine follows. Pure over its inputs — unit-tested below.
pub fn resolve_channel(env_channel: Option<String>, data_dir: &Path) -> String {
    if let Some(v) = env_channel {
        let t = v.trim().to_lowercase();
        if !t.is_empty() {
            return t;
        }
    }
    if let Ok(s) = std::fs::read_to_string(data_dir.join("update-channel")) {
        let t = s.trim().to_lowercase();
        if !t.is_empty() {
            return t;
        }
    }
    "stable".into()
}

/// Boot-time check: wait for the boot to settle, then check → download → install → restart.
/// Failures are logged and swallowed — an unreachable update endpoint must never cost the app.
pub fn spawn_startup_check(handle: AppHandle, data_dir: PathBuf) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        // Let the sidecars finish booting; an update ten seconds later loses nothing, and racing
        // the readiness gate with a restart would tear down a boot the operator is watching.
        std::thread::sleep(std::time::Duration::from_secs(10));
        tauri::async_runtime::block_on(async {
            if let Err(e) = run_check(&handle, &data_dir).await {
                eprintln!("[updater] check failed (non-fatal): {e}");
            }
        });
    });
}

async fn run_check(handle: &AppHandle, data_dir: &Path) -> tauri_plugin_updater::Result<()> {
    let channel = resolve_channel(std::env::var("CODM_UPDATE_CHANNEL").ok(), data_dir);
    let mut builder = handle.updater_builder();
    if channel == "beta" {
        let url = BETA_ENDPOINT.parse().expect("beta endpoint is a valid URL");
        builder = builder.endpoints(vec![url])?;
    }
    let updater = builder.build()?;
    if let Some(update) = updater.check().await? {
        eprintln!(
            "[updater] {} available on channel '{channel}' (running {}) — downloading",
            update.version,
            update.current_version
        );
        update.download_and_install(|_received, _total| {}, || {}).await?;
        eprintln!("[updater] installed — restarting");
        handle.restart();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("codm-updater-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn env_wins_over_file_and_default() {
        let dir = scratch();
        std::fs::write(dir.join("update-channel"), "beta\n").unwrap();
        assert_eq!(resolve_channel(Some("stable".into()), &dir), "stable");
    }

    #[test]
    fn file_wins_over_default_and_is_trimmed() {
        let dir = scratch();
        std::fs::write(dir.join("update-channel"), "  Beta \n").unwrap();
        assert_eq!(resolve_channel(None, &dir), "beta");
    }

    #[test]
    fn default_is_stable_when_nothing_opted_in() {
        let dir = scratch();
        assert_eq!(resolve_channel(None, &dir), "stable");
        // An EMPTY env var must not shadow the file/default chain.
        assert_eq!(resolve_channel(Some("  ".into()), &dir), "stable");
    }
}
