//! Supervision command. The PULL half of spec Decision 9.
//!
//! The console also LISTENS (`SupervisionChanged`, the typed tauri-specta event), but a push is only
//! heard by whoever was already mounted — the exact way `boot_failures` was born. A console that
//! mounts while the gateway is already down must be able to ASK, or the banner never appears for the
//! one operator who most needs it: the one who just reopened the window.

use std::sync::Arc;

use crate::sidecars::{SupervisionMonitor, SupervisionState};

#[tauri::command]
#[specta::specta]
pub fn supervision_state(
    monitor: tauri::State<'_, Arc<SupervisionMonitor>>,
) -> SupervisionState {
    monitor.state()
}
