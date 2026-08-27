//! Boot-splash commands. PULL **and** push: the page asks once when it loads (`boot_failures`) and
//! also listens for `sidecars::BootFailed`, because the boot-error window is DECLARED with the app —
//! its page is already running when the process starts, up to 60 seconds before the first failure
//! exists. Asking alone left the splash permanently empty (incident 2026-08-27); pushing alone would
//! be lost on a page that had not finished loading. Both, and neither is redundant.

use crate::sidecars::{reap_previous_run, FleetNames, ReadinessGate, SidecarFailure};

#[tauri::command]
#[specta::specta]
pub fn boot_failures(gate: tauri::State<'_, std::sync::Arc<ReadinessGate>>) -> Vec<SidecarFailure> {
    gate.failures()
}

/// Retry = boot again. `restart()` and nothing else: the sidecar descriptors are derived in `setup`
/// (data dir, resource dir), and retaining them just to re-spawn would be inventing state to
/// reimplement — worse — what the process already does for free.
#[tauri::command]
#[specta::specta]
pub fn retry_boot(app: tauri::AppHandle) {
    app.restart()
}

/// THE ACTIONABLE HALF of a `Remedy::ReleaseDataDirLock` failure: take down the leftover process
/// that is still holding the data dir, then boot again.
///
/// Incident (Windows, 2026-08-27): the daemon hung on one boot and stayed ALIVE holding
/// `<dataDir>/daemon.lock`, so every later opening of the app died instantly with `DATA_DIR_LOCKED`
/// naming the offending pid. Everything needed to fix it was on the machine; nothing on screen let
/// the operator do it, and they waited hours.
///
/// WHAT IT KILLS, and why not the pid the message names. The pid in that message is whatever holds
/// the lockfile — it could be a daemon somebody started by hand from a checkout, and killing a
/// process because it inconveniences us is not ours to do (`sidecars::reaper`'s matching rule, at
/// length). So this reuses the startup sweep unchanged: a process dies iff its executable path is
/// byte-for-byte one this shell spawns, and the names come from the boot's own `FleetNames`. In the
/// incident the holder WAS our binary at our path, which is the case this button exists for.
///
/// Returns the pids it removed. EMPTY is a real answer, not a failure: nothing of ours was left
/// over, so the lock belongs to a process the shell must not touch — the splash says so instead of
/// restarting into the identical screen. A non-empty sweep restarts (this call never returns), and
/// the fresh boot finds the data dir free.
#[tauri::command]
#[specta::specta]
pub fn release_data_dir_lock(app: tauri::AppHandle, fleet: tauri::State<'_, FleetNames>) -> Vec<u32> {
    let reaped = reap_previous_run(fleet.names());
    if reaped.is_empty() {
        log::warn!(
            "[boot] release_data_dir_lock: no leftover CoDM sidecar process to remove — whoever holds the data dir is not one of ours"
        );
        return Vec::new();
    }
    let pids: Vec<u32> = reaped.iter().map(|r| r.pid).collect();
    log::warn!("[boot] release_data_dir_lock: removed {pids:?} — restarting");
    app.restart()
}
