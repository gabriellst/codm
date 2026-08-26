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
//!
//! ### Focus-triggered check (2026-08-07 incident, part three)
//! Measured in the founder's own log: a check ran at 19:52 and found nothing; the release went out
//! at 20:04 — twelve minutes later — and the next scheduled look was not until 20:52, up to an hour
//! of blindness with no way to force a fresh answer. Whoever comes BACK to the app (`lib.rs` wires
//! `WindowEvent::Focused(true)` on the `main` window to [`spawn_focus_check`]) is exactly the person
//! who wants to know "is there something new" — so a focus regain now asks too, debounced by
//! [`should_check_on_focus`] so alt-tabbing does not turn into a request storm, and funneled through
//! the same [`attempt_check`] reentrancy guard the periodic loop uses so the two triggers never race.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
// The typed-event trait — `UpdateReady::emit` is its method, not an inherent one. Same import the
// sidecar supervisor uses for `SupervisionChanged::emit`.
use tauri_specta::Event as _;

/// Runtime state: is a downloaded update sitting on disk, waiting for the operator to restart into
/// it? The PULL half of the ask+listen pattern — [`crate::commands::pending_update`] reads this
/// verbatim, covering a console window that mounts AFTER `run_check` already finished (the same
/// reason `boot_failures` exists next to the boot-error splash's events). Also carries the two bits
/// [`attempt_check`] needs to arbitrate between the periodic loop and the focus-triggered check: when
/// the last attempt ran (debounce) and whether one is in flight right now (reentrancy).
#[derive(Default)]
pub struct UpdateState {
    pending: Mutex<Option<String>>,
    /// Instant of the last check ATTEMPT, successful or not — set once per attempt inside
    /// [`attempt_check`], read by [`should_check_on_focus`]. Shared between the periodic loop and the
    /// focus handler via the same `Arc<UpdateState>` both already receive, so whichever ran most
    /// recently — a scheduled tick or a focus regain — resets the other's debounce window too.
    last_check: Mutex<Option<Instant>>,
    /// Reentrancy guard: `true` while a check is in flight. The periodic loop and the focus handler
    /// both go through [`attempt_check`], the only place this is touched — never set directly by
    /// either caller.
    in_progress: AtomicBool,
}

impl UpdateState {
    fn set_ready(&self, version: String) {
        *self.pending.lock().expect("update state mutex") = Some(version);
    }

    /// The version waiting for a restart, or `None` when nothing has been installed this run.
    pub fn pending(&self) -> Option<String> {
        self.pending.lock().expect("update state mutex").clone()
    }

    fn record_check(&self) {
        *self.last_check.lock().expect("update state mutex") = Some(Instant::now());
    }

    fn last_check(&self) -> Option<Instant> {
        *self.last_check.lock().expect("update state mutex")
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

/// Minimum time between checks triggered by the `main` window regaining focus. Debounced separately
/// from [`CHECK_INTERVAL`] because the trigger is a human action (alt-tab, click back into the app),
/// not a clock — switching between apps fires `WindowEvent::Focused(true)` on every return trip, and
/// without a floor that becomes a check per switch. Five minutes: short enough that coming back to
/// the app after stepping away gets a genuinely fresh answer within the same work session (nowhere
/// near the up-to-an-hour blindness the 2026-08-07 incident measured), long enough that no realistic
/// window-switching cadence — flipping between the console and a terminal/browser every few seconds
/// while working — turns into a request storm against the update endpoint.
const FOCUS_DEBOUNCE: Duration = Duration::from_secs(5 * 60);

/// Whether a focus-regain should trigger a fresh check. Pure over its inputs — same discipline as
/// [`should_stop_checking`] — so the debounce and the "never checked yet" / "update already pending"
/// edges are provable in `cargo test` without a real window, thread, or clock.
///
/// `last_check: None` means no check has run yet this process (e.g. focus lands before the periodic
/// loop's own [`SETTLE_DELAY`] first tick) — that counts as "due", not as "just checked". A pending
/// update always wins over the debounce: [`should_stop_checking`] already means nothing left to look
/// for, and re-checking would only re-download the same bits `run_check` already installed.
fn should_check_on_focus(last_check: Option<Instant>, now: Instant, update_pending: bool) -> bool {
    if update_pending {
        return false;
    }
    match last_check {
        None => true,
        Some(last) => now.saturating_duration_since(last) >= FOCUS_DEBOUNCE,
    }
}

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
/// app, and must never break the loop either. Goes through [`attempt_check`], same as
/// [`spawn_focus_check`], so a tick landing while a focus-triggered check is already running is a
/// skipped no-op rather than a second concurrent download.
pub fn spawn_periodic_check(handle: AppHandle, data_dir: PathBuf, update_state: Arc<UpdateState>) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(SETTLE_DELAY);
        loop {
            tauri::async_runtime::block_on(attempt_check(&handle, &data_dir, &update_state));
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

/// Fired from `lib.rs` on `WindowEvent::Focused(true)` for the `main` window. Debug builds never
/// check (same gate as [`spawn_periodic_check`]); otherwise the decision is [`should_check_on_focus`]
/// — a debounced, pure read of [`UpdateState`] — and only a `true` spawns a thread at all, so a
/// debounced-out focus event costs nothing beyond that read. The spawned thread still goes through
/// [`attempt_check`]'s reentrancy guard: if the periodic loop is mid-check when focus lands (or two
/// focus events raced past the debounce check itself), the second one is a logged no-op, not a second
/// download stacked on the first.
pub fn spawn_focus_check(handle: AppHandle, data_dir: PathBuf, update_state: Arc<UpdateState>) {
    if cfg!(debug_assertions) {
        return;
    }
    let due = should_check_on_focus(
        update_state.last_check(),
        Instant::now(),
        update_state.pending().is_some(),
    );
    if !due {
        return;
    }
    std::thread::spawn(move || {
        tauri::async_runtime::block_on(attempt_check(&handle, &data_dir, &update_state));
    });
}

/// Single entry point [`spawn_periodic_check`] and [`spawn_focus_check`] both go through — never call
/// [`run_check`] directly from either. `AtomicBool::compare_exchange` is enough (no `Mutex<()>`
/// critical section needed): both callers attempt at most once per tick/event and neither blocks
/// waiting on the other — losing the race just means "someone else is already checking, skip this
/// one", not a corrupted count or a queued retry. Records [`UpdateState::record_check`]
/// unconditionally once the guard is won, before the network call — the debounce in
/// [`should_check_on_focus`] cares about "we just tried", not about what that try found, and an
/// endpoint hanging for seconds must not leave the debounce window looking stale to a focus event
/// that lands mid-request.
async fn attempt_check(handle: &AppHandle, data_dir: &Path, update_state: &UpdateState) {
    if update_state
        .in_progress
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        log::info!("[updater] a check is already running — skipping (periodic/focus overlap)");
        return;
    }
    update_state.record_check();
    if let Err(e) = run_check(handle, data_dir, update_state).await {
        log::warn!("[updater] check failed (non-fatal): {e}");
    }
    update_state.in_progress.store(false, Ordering::Release);
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

    /// `name` is a per-test discriminator, not decoration: `cargo test` runs these in parallel
    /// threads WITHIN the same process, so keying only on `std::process::id()` (the original shape)
    /// let `env_wins_over_file_and_default`, `file_wins_over_default_and_is_trimmed`, and
    /// `default_is_stable_when_nothing_opted_in` — three tests that all write `update-channel` with
    /// different content into what was the SAME directory — race each other into a flaky red. Each
    /// caller passes its own test name so every test gets an isolated directory regardless of
    /// scheduling.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("codm-updater-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn env_wins_over_file_and_default() {
        let dir = scratch("env_wins_over_file_and_default");
        std::fs::write(dir.join("update-channel"), "beta\n").unwrap();
        assert_eq!(resolve_channel(Some("stable".into()), &dir), "stable");
    }

    #[test]
    fn file_wins_over_default_and_is_trimmed() {
        let dir = scratch("file_wins_over_default_and_is_trimmed");
        std::fs::write(dir.join("update-channel"), "  Beta \n").unwrap();
        assert_eq!(resolve_channel(None, &dir), "beta");
    }

    #[test]
    fn default_is_stable_when_nothing_opted_in() {
        let dir = scratch("default_is_stable_when_nothing_opted_in");
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

    /// [`UpdateState::last_check`] is what [`should_check_on_focus`] reads for the debounce —
    /// `None` before [`attempt_check`] has ever run, per-process just like `pending`.
    #[test]
    fn last_check_is_none_before_any_attempt() {
        let state = UpdateState::default();
        assert_eq!(state.last_check(), None);
    }

    /// The write [`attempt_check`] performs before calling [`run_check`] — proven directly, same
    /// discipline as `set_ready_makes_pending_return_the_installed_version` above.
    #[test]
    fn record_check_makes_last_check_return_a_recent_instant() {
        let state = UpdateState::default();
        let before = Instant::now();
        state.record_check();
        let after = Instant::now();
        let recorded = state.last_check().expect("just recorded");
        assert!(recorded >= before && recorded <= after);
    }

    /// FOCO — dentro da janela de debounce: um foco que chega logo depois de outra checagem não deve
    /// disparar uma nova.
    #[test]
    fn focus_check_is_not_due_within_the_debounce_window() {
        let now = Instant::now();
        let last_check = now - Duration::from_secs(60); // 1 minute ago, well under FOCUS_DEBOUNCE
        assert!(!should_check_on_focus(Some(last_check), now, false));
    }

    /// FOCO — fora da janela de debounce: um foco que chega depois de FOCUS_DEBOUNCE deve disparar.
    #[test]
    fn focus_check_is_due_once_the_debounce_window_has_elapsed() {
        let now = Instant::now();
        let last_check = now - FOCUS_DEBOUNCE - Duration::from_secs(1);
        assert!(should_check_on_focus(Some(last_check), now, false));
    }

    /// FOCO — nunca checou neste processo ainda: conta como "devido", não como "acabou de checar".
    /// Cobre o foco que chega antes do primeiro tick do laço periódico (que espera SETTLE_DELAY).
    #[test]
    fn focus_check_is_due_when_nothing_has_been_checked_yet() {
        assert!(should_check_on_focus(None, Instant::now(), false));
    }

    /// FOCO — com update pendente: nunca dispara, mesmo que a última checagem tenha sido há muito
    /// tempo (ou nunca tenha existido) — não há nada a procurar além de restart.
    #[test]
    fn focus_check_is_never_due_when_an_update_is_already_pending() {
        let now = Instant::now();
        let long_ago = now - FOCUS_DEBOUNCE * 10;
        assert!(!should_check_on_focus(Some(long_ago), now, true));
        assert!(!should_check_on_focus(None, now, true));
    }
}
