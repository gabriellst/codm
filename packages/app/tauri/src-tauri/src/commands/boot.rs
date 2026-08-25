//! Boot-splash commands. PULL, not push: the boot-error window is declared with the app, and an
//! `app.emit` fired before that page finished loading would simply be lost — so the page ASKS what
//! failed once it is up.

use crate::sidecars::{ReadinessGate, SidecarFailure};

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
