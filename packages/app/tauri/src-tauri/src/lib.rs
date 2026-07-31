//! CODM desktop shell — Tauri v2 host.
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
        .setup(move |app| {
            // Registers the typed event map. `SupervisionChanged::emit` panics without it, so this
            // line is the difference between the console hearing transitions and hearing nothing.
            builder.mount_events(app);

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

            // READINESS GATE — both windows are `"visible": false` in tauri.conf.json, and whichever
            // sidecar finishes LAST decides which one opens (`sidecars::ReadinessGate`). Painting the
            // console before the daemon answered meant the operator's first sight of the app was a UI
            // querying a port still applying migrations. Every exit path in `boot_sidecar` reports to
            // the gate, and a single failure routes the boot to the error splash instead of the
            // console — the `boot_failures` command reads the failures back out of this same gate.
            let fleet = sidecars::sidecars(&data_dir.to_string_lossy(), &resource_dir);
            let gate = Arc::new(sidecars::ReadinessGate::new(fleet.len()));
            app.manage(gate.clone());

            // SUPERVISION picks up where the gate stops (`Reveal::Main` arms it — see
            // `sidecars::apply`). It watches the same fleet for the rest of the process's life:
            // the child's exit signal plus a typed health probe every 5s, with the reaction
            // decided by the pure `SupervisionMonitor`. Managed here because BOTH the boot tasks
            // (which own each child's event stream) and the `supervision_state` command read it.
            let monitor = Arc::new(sidecars::SupervisionMonitor::new(
                fleet.iter().map(|s| (s.service(), s.name().to_owned())).collect(),
            ));
            app.manage(monitor.clone());

            // CHILD REGISTRY — the handles, kept so the shell can take its processes with it when
            // it goes (see the `RunEvent::Exit` arm below). Dropping a `CommandChild` does not kill
            // anything, which is how a previous shell's daemon ended up adopted by launchd and still
            // holding `:3030` while a brand-new window talked to it.
            let children = Arc::new(sidecars::ChildRegistry::default());
            app.manage(children.clone());

            for sidecar in fleet {
                sidecars::boot_sidecar(
                    app.handle(),
                    sidecar,
                    gate.clone(),
                    monitor.clone(),
                    children.clone(),
                );
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // `Exit` and not `ExitRequested`: the latter is a REQUEST, and it can be prevented (a
            // window close that something vetoes). Killing the fleet there would leave a still-open
            // app with no backend. `Exit` is the last thing that happens before the process goes.
            //
            // This covers the ORDINARY shutdown; it cannot cover `SIGKILL` or a dev watcher that
            // hard-kills the app, which is why `port_conflict` guards the next boot (spec Decision 8b).
            if let tauri::RunEvent::Exit = event {
                app.state::<Arc<sidecars::ChildRegistry>>().kill_all();
            }
        });
}
