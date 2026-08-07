//! CODM desktop shell — Tauri v2 host.
//!
//! Responsibilities (and nothing else — the product lives in the react console):
//! 1. Serve the react SPA (frontendDist / devUrl in tauri.conf.json).
//! 2. Supervise the two sidecars (TS daemon + Go gateway, `bundle.externalBin`)
//!    with a bootstrap HTTP health-check per service — see `sidecars`.
//! 3. Expose the keychain-backed `secret_*` commands the native contract's tauri
//!    platform services invoke — see `commands`.
//! 4. Back the `log` facade with a real file target (`$data_dir/logs/shell.log`) — see the
//!    `tauri_plugin_log` wiring below. Until 2026-08-07 this shell had NONE: every `log::*`
//!    call anywhere in this crate, and every `console.error`/`warn` in the webview, vanished
//!    in a packaged build. A login failure ("Não foi possível concluir o login") had no trace
//!    of which step broke it — the sidecar logs (`sidecars::sidecar_log`) and `crash.rs` only
//!    cover the sidecars and Rust panics, never an ordinary caught error on either side of
//!    this boundary.
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
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

mod api;
mod commands;
mod crash;
mod sidecars;
mod updater;

/// Cap for `shell.log` before `tauri_plugin_log::RotationStrategy::KeepOne` rotates it — same
/// order of magnitude as the sidecar/crash rotation budgets (`sidecar_log::KEEP`, `crash::KEEP`),
/// bounded so a noisy run cannot grow the data dir without limit.
const SHELL_LOG_MAX_BYTES: u128 = 10 * 1024 * 1024;

pub fn run() {
    let builder = commands::specta_builder();
    // Captured before `.build()` — the log plugin's `Folder` target needs a literal path, and
    // `.plugin()` calls only compose the `Builder`, which `.build()` then consumes. That is
    // BEFORE any `App`/`AppHandle` exists, so `app.path().app_data_dir()` (what `setup()` below
    // used to call) is not reachable yet.
    let context = tauri::generate_context!();

    // SAME formula `PathResolver::app_data_dir` uses internally (`dirs::data_dir().join(identifier)`
    // — verified against tauri 2.11.5's vendored source), read off the SAME generated `context` the
    // Builder is about to consume — never a hand-copied identifier literal that could drift from
    // config/app.ts's IDENTIFIER. Computed ONCE here and reused by `setup()` below, rather than
    // recomputed a second time via `app.path()`, so there is exactly one place this path is derived.
    let data_dir = dirs::data_dir()
        .expect("app data dir resolvable")
        .join(&context.config().identifier)
        .join("data");
    let log_dir = data_dir.join("logs");

    tauri::Builder::default()
        // FIRST in the chain on purpose: plugins initialize in registration order during
        // `.build()`, and any `log::*` call from a LATER plugin's own init should still land in
        // the file rather than being dropped because the logger wasn't installed yet.
        //
        // Same directory the sidecars already write to (`sidecars::sidecar_log`) — `shell.log`
        // sits right next to `codm-daemon-<ts>.log` / `codm-gateway-<ts>.log`, one tree to search
        // instead of a third one at the OS-specific log dir (`TargetKind::LogDir`, deliberately
        // NOT used here). `KeepOne` + a size cap bounds growth without the per-boot file-per-run
        // scheme `sidecar_log.rs` needs (this is one continuously-open file per shell install).
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(Target::new(TargetKind::Folder {
                    path: log_dir,
                    file_name: Some("shell".into()),
                }))
                .max_file_size(SHELL_LOG_MAX_BYTES)
                .rotation_strategy(RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // codm:// (config/deeplink.ts DEEPLINK.scheme, rendered into tauri.conf.json
        // plugins.deep-link.desktop.schemes) — SP2's device-token flow (spec Decision 4) redirects
        // the system browser here once OAuth completes. The console listens for the resulting
        // event (`@tauri-apps/plugin-deep-link` onOpenUrl) — that is T6's job, not this shell's.
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            // Windows/Linux have no installer registering the scheme during `tauri dev` — this call
            // is what makes `codm://` resolve to the dev binary. macOS reads CFBundleURLTypes
            // (generated from the SAME tauri.conf.json schemes) and needs no runtime registration.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            // Registers the typed event map. `SupervisionChanged::emit` panics without it, so this
            // line is the difference between the console hearing transitions and hearing nothing.
            builder.mount_events(app);

            // `data_dir` is the OUTER binding computed above, before `.build()` — reused here
            // rather than a second `app.path().app_data_dir()` call, so the shell log's directory
            // and every other consumer below (crash capture, sidecars, the updater) agree on the
            // path by construction instead of by two formulas staying in sync by hand.
            //
            // Crash capture + auto-update — both rooted at the same data dir the sidecars use.
            // The panic hook goes in FIRST: an update-path panic without it would be exactly the
            // invisible field crash SP1's decision 6 exists to prevent.
            crash::install_panic_hook(data_dir.clone());

            // Managed BEFORE the background check spawns (though the check itself sleeps 10s, so
            // there is no real race) — `commands::pending_update` reads this same `Arc` via
            // `tauri::State`, the identical wiring `gate`/`monitor` use below.
            let update_state = Arc::new(updater::UpdateState::default());
            app.manage(update_state.clone());
            updater::spawn_periodic_check(app.handle().clone(), data_dir.clone(), update_state);

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
            let fleet = sidecars::sidecars(&data_dir.to_string_lossy(), &resource_dir, &app.package_info().version.to_string());
            let gate = Arc::new(sidecars::ReadinessGate::new(fleet.len()));
            app.manage(gate.clone());

            // SUPERVISION picks up where the gate stops (`Reveal::Main` arms it — see
            // `sidecars::apply`). It watches the same fleet for the rest of the process's life:
            // the child's exit signal plus a typed health probe every 5s, with the reaction
            // decided by the pure `SupervisionMonitor`. Managed here because BOTH the boot tasks
            // (which own each child's event stream) and the `supervision_state` command read it.
            let monitor = Arc::new(sidecars::SupervisionMonitor::new(
                fleet
                    .iter()
                    .map(|s| (s.service(), s.name().to_owned()))
                    .collect(),
            ));
            app.manage(monitor.clone());

            // CHILD REGISTRY — the handles, kept so the shell can take its processes with it when
            // it goes (see the `RunEvent::Exit` arm below). Dropping a `CommandChild` does not kill
            // anything, which is how a previous shell's daemon ended up adopted by launchd and still
            // holding `:3030` while a brand-new window talked to it.
            let children = Arc::new(sidecars::ChildRegistry::default());
            app.manage(children.clone());

            // EVERY EXIT, not just the graceful one. `RunEvent::Exit` (below) never fires for a
            // shell that was signalled from outside — and outside is where the founder's orphans
            // came from: `tauri dev` kills the shell on every recompile. Installed before the fleet
            // spawns so a signal arriving mid-boot still finds a registry to drain.
            sidecars::install_signal_handlers(app.handle(), children.clone());

            // STARTUP SWEEP, before the first spawn and therefore before `port_conflict` runs.
            // What no exit hook could clean (the shell was SIGKILLed, or crashed) is cleaned one
            // boot late, matched by the BINARY PATH we are about to exec — never by port, so a
            // sibling repo's process on :3030 is refused, not killed. See `sidecars::reaper`.
            let names: Vec<&str> = fleet.iter().map(|s| s.name()).collect();
            sidecars::reap_previous_run(&names);

            // PERSISTED STDERR (2026-08-07 incident) — same root as `crash::install_panic_hook`
            // above, so a diagnosis never has to hunt across two different data trees for "what
            // happened on this machine". See `sidecars::sidecar_log` for why this is a directory of
            // one file per sidecar per run rather than a single shared log.
            let log_dir = data_dir.join("logs");
            for sidecar in fleet {
                sidecars::boot_sidecar(
                    app.handle(),
                    sidecar,
                    gate.clone(),
                    monitor.clone(),
                    children.clone(),
                    &log_dir,
                );
            }
            Ok(())
        })
        // `context` — captured at the top of `run()`, not `generate_context!()` called fresh here
        // — is what let the log plugin's target read `context.config().identifier` before the App
        // existed. Passing the SAME value in means the identifier the shell logs against and the
        // identifier the running app reports are provably the same value, not two macro expansions
        // that happen to agree.
        .build(context)
        .expect("error while building tauri application")
        .run(|app, event| {
            // `Exit` and not `ExitRequested`: the latter is a REQUEST, and it can be prevented (a
            // window close that something vetoes). Killing the fleet there would leave a still-open
            // app with no backend. `Exit` is the last thing that happens before the process goes.
            //
            // This covers the ORDINARY shutdown — one of THREE layers, because it is the weakest:
            //   · signalled shutdown  → `sidecars::install_signal_handlers` (setup, above);
            //   · unobservable death  → each sidecar's own `CODM_PARENT_PID` watchdog;
            //   · whatever still slipped through → `sidecars::reap_previous_run` at the next boot,
            //     with `port_conflict` refusing anything foreign that is left (spec Decision 8b).
            if let tauri::RunEvent::Exit = event {
                app.state::<Arc<sidecars::ChildRegistry>>().kill_all();
            }
        });
}
