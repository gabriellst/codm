//! Runtime half of auto-update (SP1, `.specs/2026-08-06-sp1-release-autoupdate-design.md`).
//!
//! The download/install stays fully automatic and silent, Rust-side — a dev build never
//! self-updates (`cfg!(debug_assertions)` gate) — `cargo run` replacing itself with a release
//! bundle would be the end of every debugging session. The ONE thing that stopped being automatic:
//! the RESTART. `run_check` used to call `handle.restart()` the instant the install finished, which
//! could drop the operator mid-conversation with no warning. Now it stops at "installed" and hands
//! the decision to the console via [`UpdateState`] + [`UpdateReady`] — the same ask+listen shape
//! `commands/boot.rs` documents (an `app.emit` fired before the page mounted is simply lost, so the
//! page also ASKS). `commands/update.rs` is the thin command surface over both.
//!
//! ### Periodic, not just boot-time (2026-08-07 incident)
//! A founder kept the app open across a release and never saw the "restart to update" pill — the
//! ONLY check ran once, 10s after boot, and the thread then exited for good. A console that was
//! already open when the release shipped (or opened before it did) would simply never look again,
//! forcing the exact restart-to-check-for-a-restart loop this whole feature exists to avoid.
//! [`spawn_periodic_check`] now loops on [`CHECK_INTERVAL`] after that same 10s settle delay, and
//! stops for good only once an update has installed and is waiting on a restart — checking again
//! after that would just download the same bits a second time.
//!
//! ### Channel resolution (spec decision 2)
//! `CODM_UPDATE_CHANNEL` env wins (CI/tests), else a `update-channel` file in the data dir
//! (`echo beta > .../update-channel` is how a founder machine opts in), else `stable`. The stable
//! endpoint ships inside `tauri.conf.json` (generated from `config/updater.ts`); beta overrides
//! the endpoint list at runtime, below.
//!
//! ### Logging (2026-08-07 incident, part two)
//! Every branch below goes through `log::*`, not `eprintln!` — `lib.rs` wires `tauri-plugin-log`
//! into `$data_dir/logs/shell.log` for a packaged build, where nothing is attached to stderr. Before
//! this, the ONLY updater lines that ever reached disk were `tauri_plugin_updater`'s own internal
//! ones; nothing here said whether a check even ran, which channel it resolved, or why it gave up —
//! so "the pill never showed up" had no trace to read.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
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

/// Delay before the FIRST check — kept separate from [`CHECK_INTERVAL`] because the reason is
/// different. This one is about not racing the boot: the sidecars are still applying migrations and
/// the readiness gate is still deciding which window to show, and downloading an update (or worse,
/// the operator restarting into one) while that is happening would tear down a boot they are
/// watching. Ten seconds loses nothing — the console is already up by then either way.
const SETTLE_DELAY: Duration = Duration::from_secs(10);

/// Cadence of the periodic re-check once the settle delay has passed. An hour: this ships to a
/// handful of founder/operator machines, not a fleet where rollout visibility is time-critical, and
/// the stable/beta endpoints are static R2 objects an hourly poll does not meaningfully load. The
/// number that matters is "an app left open across a release sees the pill without a restart" — an
/// hour keeps that true without turning every open console into a standing poller of its own.
const CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// Whether [`spawn_periodic_check`]'s loop should keep going. Extracted to a pure function so the
/// STOP condition — the second half of this correction, sitting right next to the "never checked
/// again" bug — is provable in `cargo test` without spawning a thread or a real updater: once an
/// update is installed and sitting on disk waiting for a restart, checking again would only download
/// the same bits a second time.
fn should_stop_checking(update_state: &UpdateState) -> bool {
    update_state.pending().is_some()
}

/// Background loop: wait for the boot to settle, then check → download → install → tell the
/// console, and keep doing that every [`CHECK_INTERVAL`] for as long as the process runs — a console
/// left open across a release must see the "restart to update" pill on its own, not only right after
/// boot. Stops for good once [`should_stop_checking`] says an install is pending a restart; a fresh
/// process (the one the operator restarts into) starts this loop over from a clean [`UpdateState`].
/// Failures are logged and swallowed either way — an unreachable update endpoint must never cost the
/// app, and must never break the loop either.
pub fn spawn_periodic_check(handle: AppHandle, data_dir: PathBuf, update_state: Arc<UpdateState>) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(SETTLE_DELAY);
        loop {
            tauri::async_runtime::block_on(async {
                if let Err(e) = run_check(&handle, &data_dir, &update_state).await {
                    log::warn!("[updater] check failed (non-fatal): {e}");
                }
            });
            if should_stop_checking(&update_state) {
                log::info!(
                    "[updater] update installed and pending restart — stopping periodic checks"
                );
                return;
            }
            std::thread::sleep(CHECK_INTERVAL);
        }
    });
}

/// One complete check. Every branch logs, per the module doc's "Logging" section above — the trail
/// that answers "why didn't the pill show up" without needing to reproduce it: which channel was
/// resolved, what was found (and against what running version), when the download started and
/// finished, and — via the `?` propagating to [`spawn_periodic_check`]'s `log::warn!` — why it failed
/// when it did.
async fn run_check(
    handle: &AppHandle,
    data_dir: &Path,
    update_state: &UpdateState,
) -> tauri_plugin_updater::Result<()> {
    let channel = resolve_channel(std::env::var("CODM_UPDATE_CHANNEL").ok(), data_dir);
    log::info!("[updater] checking for updates on channel '{channel}'");
    let mut builder = handle.updater_builder();
    if channel == "beta" {
        let url = BETA_ENDPOINT.parse().expect("beta endpoint is a valid URL");
        builder = builder.endpoints(vec![url])?;
    }
    let updater = builder.build()?;
    let Some(update) = updater.check().await? else {
        log::info!("[updater] no update available on channel '{channel}'");
        return Ok(());
    };
    log::info!(
        "[updater] {} available on channel '{channel}' (running {}) — starting download",
        update.version,
        update.current_version
    );
    update
        .download_and_install(|_received, _total| {}, || {})
        .await?;
    log::info!(
        "[updater] download finished — {} installed, waiting for the operator to restart",
        update.version
    );
    // Installed bits sit on disk until the operator acts — no `handle.restart()` here. PULL
    // (the state, for a console that mounts late) and PUSH (the event, for one already open)
    // both carry the same version so either path renders the same pill.
    update_state.set_ready(update.version.clone());
    if let Err(e) = (UpdateReady {
        version: update.version.clone(),
    })
    .emit(handle)
    {
        log::error!("[updater] failed to emit update-ready event (non-fatal): {e}");
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

    /// The loop's STOP condition — the 2026-08-07 fix's other half. Before an install lands, the
    /// periodic loop must keep going; the instant one does, it must stop, or the next tick would
    /// download the same bits `run_check` just installed a second time.
    #[test]
    fn should_stop_checking_is_false_until_an_update_is_pending() {
        let state = UpdateState::default();
        assert!(!should_stop_checking(&state));
        state.set_ready("1.4.0".into());
        assert!(should_stop_checking(&state));
    }
}
