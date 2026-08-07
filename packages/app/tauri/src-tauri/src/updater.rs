//! Runtime half of auto-update (SP1, `.specs/2026-08-06-sp1-release-autoupdate-design.md`).
//!
//! The download/install stays fully automatic and silent, Rust-side, at boot — a dev build never
//! self-updates (`cfg!(debug_assertions)` gate) — `cargo run` replacing itself with a release
//! bundle would be the end of every debugging session. The ONE thing that stopped being automatic:
//! the RESTART. `run_check` used to call `handle.restart()` the instant the install finished, which
//! could drop the operator mid-conversation with no warning. Now it stops at "installed" and hands
//! the decision to the console via [`UpdateState`] + [`UpdateReady`] — the same ask+listen shape
//! `commands/boot.rs` documents (an `app.emit` fired before the page mounted is simply lost, so the
//! page also ASKS). `commands/update.rs` is the thin command surface over both.
//!
//! ### Channel resolution (spec decision 2)
//! `CODM_UPDATE_CHANNEL` env wins (CI/tests), else a `update-channel` file in the data dir
//! (`echo beta > .../update-channel` is how a founder machine opts in), else `stable`. The stable
//! endpoint ships inside `tauri.conf.json` (generated from `config/updater.ts`); beta overrides
//! the endpoint list at runtime, below.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
// The typed-event trait — `UpdateReady::emit` is its method, not an inherent one. Same import the
// sidecar supervisor uses for `SupervisionChanged::emit`.
use tauri_specta::Event as _;

/// Runtime state: is a downloaded update sitting on disk, waiting for the operator to restart into
/// it? The PULL half of the ask+listen pattern — [`crate::commands::pending_update`] reads this
/// verbatim, covering a console window that mounts AFTER `run_check` already finished (the same
/// reason `boot_failures` exists next to the boot-error splash's events).
#[derive(Default)]
pub struct UpdateState(Mutex<Option<String>>);

impl UpdateState {
    fn set_ready(&self, version: String) {
        *self.0.lock().expect("update state mutex") = Some(version);
    }

    /// The version waiting for a restart, or `None` when nothing has been installed this run.
    pub fn pending(&self) -> Option<String> {
        self.0.lock().expect("update state mutex").clone()
    }
}

/// PUSH half — mirrors `SupervisionChanged`'s shape and purpose: typed end-to-end by tauri-specta,
/// so the console gets `events.updateReady.listen(...)`, never a stringly `listen('update-ready')`.
/// Fires (at most) once per run, the moment a background check finishes installing.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, specta::Type, tauri_specta::Event)]
pub struct UpdateReady {
    pub version: String,
}

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

/// Boot-time check: wait for the boot to settle, then check → download → install → tell the
/// console. Failures are logged and swallowed — an unreachable update endpoint must never cost the
/// app.
pub fn spawn_startup_check(handle: AppHandle, data_dir: PathBuf, update_state: Arc<UpdateState>) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        // Let the sidecars finish booting; an update ten seconds later loses nothing, and racing
        // the readiness gate with a restart would tear down a boot the operator is watching.
        std::thread::sleep(std::time::Duration::from_secs(10));
        tauri::async_runtime::block_on(async {
            if let Err(e) = run_check(&handle, &data_dir, &update_state).await {
                eprintln!("[updater] check failed (non-fatal): {e}");
            }
        });
    });
}

async fn run_check(
    handle: &AppHandle,
    data_dir: &Path,
    update_state: &UpdateState,
) -> tauri_plugin_updater::Result<()> {
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
        eprintln!("[updater] installed — waiting for the operator to restart");
        // Installed bits sit on disk until the operator acts — no `handle.restart()` here. PULL
        // (the state, for a console that mounts late) and PUSH (the event, for one already open)
        // both carry the same version so either path renders the same pill.
        update_state.set_ready(update.version.clone());
        if let Err(e) = (UpdateReady {
            version: update.version.clone(),
        })
        .emit(handle)
        {
            eprintln!("[updater] failed to emit update-ready event (non-fatal): {e}");
        }
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

    /// [`UpdateState::pending`] is what `commands::pending_update` returns verbatim — a console
    /// that mounts before any check ran must see "nothing to restart into", not a stale default.
    #[test]
    fn pending_is_none_before_any_install() {
        let state = UpdateState::default();
        assert_eq!(state.pending(), None);
    }

    /// The write `run_check` performs after `download_and_install` succeeds — proven here without
    /// booting an updater or an app, same discipline as `SupervisionMonitor`'s pure tests.
    #[test]
    fn set_ready_makes_pending_return_the_installed_version() {
        let state = UpdateState::default();
        state.set_ready("1.4.0".into());
        assert_eq!(state.pending(), Some("1.4.0".into()));
    }
}
