//! CodeDM desktop shell — Tauri v2 host.
//!
//! Responsibilities (and nothing else — the product lives in the react console):
//! 1. Serve the react SPA (frontendDist / devUrl in tauri.conf.json).
//! 2. Supervise the two sidecars (TS daemon + Go gateway, `bundle.externalBin`)
//!    with a bootstrap HTTP health-check per service — see `sidecars`.
//! 3. Expose the keychain-backed `secret_*` commands the native contract's tauri
//!    platform services invoke — see `commands`.
//!
//! Transport is the INTERIM local-HTTP one (console → daemon :3030 → gateway :3032),
//! documented as reversible in BUILD-LOG — the shell only needs the two readiness
//! URLs to change if the transport pivots (SQLite-WAL / IPC is go-domain territory).
//!
//! This file is THIN: no command or sidecar bodies inline. It wires the
//! `tauri::Builder` — `commands::specta_builder()` for the invoke handler,
//! `sidecars::sidecars()` / `boot_sidecar()` in setup.

use std::sync::atomic::AtomicUsize;
use std::sync::Arc;

use tauri::Manager;

mod api;
mod commands;
mod sidecars;

pub fn run() {
    let builder = commands::specta_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(builder.invoke_handler())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir resolvable")
                .join("data");

            // Bundle resource dir — staged sidecar assets (e.g. the Drizzle migrations copied by
            // build-sidecars) live here; sidecars() resolves resource_dir/<subpath> for their boot env.
            let resource_dir = app.path().resource_dir().expect("resource dir resolvable");

            // Typed SDK aggregate (api::Api) — the shell's only door to the backends, and now the
            // readiness probe's door too, so it MUST be managed before the fleet spawns: each
            // supervisor task resolves `State<Api>` and would race an unmanaged state otherwise.
            // Building it early is free — `Api::from_env` only reads env and assembles a lazy HTTP
            // client, opening no connection; requests simply fail until the sidecars answer.
            api::manage(app.handle());

            // READINESS GATE — the main window is `"visible": false` in tauri.conf.json and is revealed
            // by whichever sidecar finishes last (`sidecars::note_ready`). Painting the console before
            // the daemon answered meant the operator's first sight of the app was a UI querying a port
            // still applying migrations. EVERY exit path in `boot_sidecar` counts, failures included, so
            // a sidecar that never comes up yields a visibly broken window rather than no window at all.
            let fleet = sidecars::sidecars(&data_dir.to_string_lossy(), &resource_dir);
            let total = fleet.len();
            let ready = Arc::new(AtomicUsize::new(0));
            for sidecar in fleet {
                sidecars::boot_sidecar(app.handle(), sidecar, ready.clone(), total);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
