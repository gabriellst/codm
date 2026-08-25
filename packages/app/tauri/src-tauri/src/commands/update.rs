//! Auto-update commands — the PULL half (`pending_update`) plus the one action the operator can
//! take once a version is ready (`restart_for_update`). The PUSH half (`UpdateReady`) is emitted by
//! `updater::run_check` itself, not from here.
//!
//! Same reasoning as `commands/supervision.rs`: a push only reaches whoever was already mounted, so
//! a console window that opens AFTER the background check finished installing needs to be able to
//! ASK — this is that ask.

use std::sync::Arc;

use crate::updater::UpdateState;

#[tauri::command]
#[specta::specta]
pub fn pending_update(state: tauri::State<'_, Arc<UpdateState>>) -> Option<String> {
    state.pending()
}

/// The operator's one action once `pending_update` (or the `UpdateReady` event) says a version is
/// ready: relaunch into the bits `run_check` already installed. Same primitive as `retry_boot` —
/// `handle.restart()` — behind a different trigger.
#[tauri::command]
#[specta::specta]
pub fn restart_for_update(app: tauri::AppHandle) {
    app.restart()
}
