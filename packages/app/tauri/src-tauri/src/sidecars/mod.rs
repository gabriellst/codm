//! Sidecar supervision — spawns the two bundled sidecars (TS daemon + Go gateway,
//! `bundle.externalBin`) and polls each service's readiness through the TYPED SDK
//! (`api::Api` → the generated `health()` operation), never a hand-assembled request.
//!
//! The sidecar SET and each process's boot ENV are hand-written in `sidecars()`
//! below — env values are runtime paths (`data_dir`, `resource_dir/migrations`) and
//! shell-decision literals the supervisor owns, not a cross-boundary contract. The
//! LEAN cross-boundary list the JS side needs (binary role → port env key → build
//! recipe) lives in `packages/app/tauri/config/sidecars.ts`, which
//! `config/build-sidecars.ts` and `config/generate.ts` read; keep the two in step
//! (same two roles, same ports). The readiness PATH is in NEITHER list any more: it
//! lives in the OpenAPI contract and arrives through the generated method (spec E2).

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
// The typed-event trait — `SupervisionChanged::emit` is its method, not an inherent one.
use tauri_specta::Event as _;

use crate::api::Api;

mod gate;
pub use gate::*;

mod supervision;
pub use supervision::*;

/// Sidecar bootstrap descriptor: binary name (as in `bundle.externalBin`), the port
/// it listens on, which SDK sub-client probes it, the working directory it must be
/// spawned in, and the env the process boots with.
pub struct Sidecar {
    name: &'static str,
    port: u16,
    service: SidecarService,
    /// Working directory for the child process. Load-bearing, not cosmetic: a
    /// `bun build --compile` binary resolves the one `require` bun could not bundle
    /// (the libsql native addon, reached dynamically through `@neon-rs/load`) from
    /// the process CWD, never from the executable's directory — so the daemon must
    /// start inside its staged runtime dir or it dies with
    /// `Cannot find package … from '/$bunfs/root/out'`. `None` = inherit.
    cwd: Option<std::path::PathBuf>,
    env: Vec<(String, String)>,
}

impl Sidecar {
    /// Which service this binary answers as — what the supervisor watches it by.
    pub fn service(&self) -> SidecarService {
        self.service
    }

    /// The bundled binary name — what the shell log and the boot-error splash call it.
    pub fn name(&self) -> &'static str {
        self.name
    }
}

/// The port a sidecar listens on: read from its env var (matching `config/sidecars.ts`'s
/// `portEnvKey`), falling back to the dev/bundle default when unset.
fn port_from_env(key: &str, default: u16) -> u16 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// The two supervised sidecars + the exact env each boots with. Hand-written, on
/// purpose: the descriptors mirror `config/sidecars.ts` and the boot env is inlined
/// here because it is a runtime concern, not a cross-boundary contract.
///
/// `data_dir`     — app-data subdir (`app_data_dir()/data`), the sidecars' data root.
/// `resource_dir` — bundle resource dir, holding the two dirs a compiled sidecar reads
///                  from disk (`config/build-sidecars.ts` stages them under `binaries/`,
///                  `bundle.resources` copies them here):
///                  `migrations`     — the Drizzle migrations the daemon applies on boot;
///                  `daemon-runtime` — the libsql native-prebuild closure, which is the
///                                     daemon's spawn CWD (see `Sidecar::cwd`).
pub fn sidecars(data_dir: &str, resource_dir: &std::path::Path) -> Vec<Sidecar> {
    let api_port = port_from_env("API_PORT", 3030);
    let channel_port = port_from_env("CHANNEL_PORT", 3032);
    let migrations_dir = resource_dir
        .join("migrations")
        .to_string_lossy()
        .into_owned();
    vec![
        Sidecar {
            name: "codm-daemon",
            port: api_port,
            service: SidecarService::Daemon,
            // Not optional: the compiled daemon resolves the libsql native addon from
            // its CWD. Without this it cannot start. See `Sidecar::cwd`.
            cwd: Some(resource_dir.join("daemon-runtime")),
            env: vec![
                ("API_PORT".into(), api_port.to_string()),
                ("CODM_DATA_DIR".into(), data_dir.into()),
                ("CODM_MIGRATIONS_DIR".into(), migrations_dir),
                ("API_GO_URL".into(), "http://localhost:3032".into()),
                ("NODE_ENV".into(), "production".into()),
            ],
        },
        Sidecar {
            name: "codm-gateway",
            port: channel_port,
            service: SidecarService::Gateway,
            // A static Go binary — nothing to resolve from disk, so it inherits the shell's CWD.
            cwd: None,
            env: vec![
                ("CHANNEL_PORT".into(), channel_port.to_string()),
                ("CODM_DATA_DIR".into(), data_dir.into()),
                (
                    "CHANNEL_ALLOWED_ORIGINS".into(),
                    "tauri://localhost,http://localhost:5173".into(),
                ),
            ],
        },
    ]
}

/// READINESS BY CONTRACT. One typed call through the generated client (`codm-client-rust`) — the
/// same door the rest of the shell uses (`api::Api`, the house rule pinned by
/// `tests/no_raw_http.rs`).
///
/// The generated method matches `200 => Ok(..)` and sends everything else to `Err`. Boot only ever
/// asked "is it 200?", so this used to return a `bool`; supervision needs the answer the bool threw
/// away — WHY it was not 200. `Error::status()` is that answer: `Some(code)` means a server answered
/// (the 503 both health endpoints emit while an internal gate is down — process ALIVE), `None` means
/// there was no HTTP response at all (connection refused — process DEAD). Boot still only asks for
/// `Healthy`; nothing about the readiness semantics moved.
async fn probe(api: &Api, service: SidecarService) -> ProbeOutcome {
    let status = match service {
        SidecarService::Daemon => api.client.typescript.health().await.err().map(|e| e.status()),
        SidecarService::Gateway => api.client.go.health().await.err().map(|e| e.status()),
    };
    match status {
        None => ProbeOutcome::Healthy,
        Some(Some(code)) => ProbeOutcome::Unhealthy(code.as_u16()),
        Some(None) => ProbeOutcome::Unreachable,
    }
}

/// One supervision cycle for one sidecar, with a budget (see `PROBE_TIMEOUT`).
async fn probe_within_budget(api: &Api, service: SidecarService) -> ProbeOutcome {
    match tokio::time::timeout(PROBE_TIMEOUT, probe(api, service)).await {
        Ok(outcome) => outcome,
        Err(_) => ProbeOutcome::Unreachable,
    }
}

/// Reveal the window the gate chose AND hide the other one. Idempotent — `show()` on an
/// already-visible window and `hide()` on an already-hidden one are both no-ops, which is what lets
/// the boot (both windows start `"visible": false`) and a RUNTIME death (the console is up and must
/// go away) share one implementation instead of growing a second splash path.
///
/// The main window appears ONLY through `Reveal::Main`. `Reveal::BootError` opens `boot-error` —
/// declared in `tauri.conf.json` with `visible: false`, exactly like the main one — and the main
/// window is hidden: a dashboard firing queries at dead ports is worse than a screen that says what
/// broke.
fn apply(app: &tauri::AppHandle, reveal: Reveal) {
    let (show, hide) = match &reveal {
        Reveal::Main => ("main", "boot-error"),
        Reveal::BootError(failures) => {
            // The splash reads the failures back through `boot_failures` (PULL — an emit fired
            // before that page loads would be lost); this line is the same fact in the shell log,
            // for whoever is tailing a terminal instead of looking at the window.
            let names: Vec<&str> = failures.iter().map(|f| f.name.as_str()).collect();
            log::error!("boot failed for {} sidecar(s): {}", failures.len(), names.join(", "));
            ("boot-error", "main")
        }
    };
    if let Some(window) = app.get_webview_window(hide) {
        let _ = window.hide();
    }
    match app.get_webview_window(show) {
        Some(window) => {
            let _ = window.show();
            let _ = window.set_focus();
        }
        None => log::error!("window '{show}' does not exist — check tauri.conf.json (generated)"),
    }
    // SUPERVISION BEGINS WHERE THE GATE ENDS. The console is up, the gate has spoken its one
    // sentence, and from here the fleet needs a watcher — this is the single choke point where that
    // handover can be expressed, so it cannot be forgotten by a future caller of `apply`.
    if matches!(reveal, Reveal::Main) {
        supervise(app);
    }
}

/// Watch the fleet for as long as the shell lives: probe every `PROBE_INTERVAL`, feed the pure
/// machine, react only when the machine says the aggregate MOVED.
///
/// Sequential over the fleet on purpose — two sidecars, each bounded by `PROBE_TIMEOUT`, is a worst
/// case well inside the cadence, and a serial loop keeps "what did we last hear from each one"
/// trivially ordered.
fn supervise(app: &tauri::AppHandle) {
    let monitor = app.state::<Arc<SupervisionMonitor>>().inner().clone();
    // Until this line the ReadinessGate alone decides which window opens; after it, supervision does.
    monitor.arm();
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let fleet = monitor.services();
        log::info!(
            "supervision armed for {} sidecar(s) — probing every {}s",
            fleet.len(),
            PROBE_INTERVAL.as_secs()
        );
        loop {
            tokio::time::sleep(PROBE_INTERVAL).await;
            let api = handle.state::<Api>();
            for (service, name) in &fleet {
                let outcome = probe_within_budget(&api, *service).await;
                if let Some(state) = monitor.note_probe(*service, outcome) {
                    log::warn!("[{name}] supervision transition after probe: {outcome:?}");
                    react(&handle, state);
                }
            }
        }
    });
}

/// What a transition DOES. Everyone gets told (the console, through the typed event); the daemon
/// additionally takes the window away, because nothing in the console works without it.
fn react(app: &tauri::AppHandle, state: SupervisionState) {
    log::warn!("supervision state changed: {state:?}");
    // PUSH half of spec Decision 9. The PULL half (`supervision_state`) exists because this emit is
    // lost on anyone who was not mounted yet — the `boot_failures` lesson.
    if let Err(e) = (SupervisionChanged { state }).emit(app) {
        log::error!("failed to emit supervision change: {e}");
    }
}

/// Spawn one sidecar and poll its health operation until ready (or timeout). Emits
/// `sidecar:ready` / `sidecar:error` to the webview so the console can render
/// boot progress honestly instead of spinning forever.
///
/// EVERY exit path reports to the `gate` — success through `note_ready`, the three failure paths
/// through `note_failed` — and whoever arrives last gets the `Reveal` that decides which window the
/// operator actually sees.
///
/// The `monitor` is the SECOND reader of this process: the same `rx` that carries stderr carries the
/// child's `Terminated`, which is the fastest and most definitive death signal there is — no probe
/// cadence can beat it (spec Decision 2a).
pub fn boot_sidecar(
    app: &tauri::AppHandle,
    sidecar: Sidecar,
    gate: Arc<ReadinessGate>,
    monitor: Arc<SupervisionMonitor>,
) {
    let command = match app.shell().sidecar(sidecar.name) {
        Ok(cmd) => {
            let cmd = cmd.envs(sidecar.env.clone());
            // See `Sidecar::cwd` — the compiled daemon resolves its native addon from the CWD.
            match sidecar.cwd.as_ref() {
                Some(dir) => cmd.current_dir(dir.clone()),
                None => cmd,
            }
        }
        Err(e) => {
            let reason = format!("spawn setup failed: {e}");
            let _ = app.emit("sidecar:error", format!("{}: {reason}", sidecar.name));
            // Report it, or the gate never reaches `total` and NO window is ever revealed.
            if let Some(reveal) = gate.note_failed(sidecar.name, &reason) {
                apply(app, reveal);
            }
            return;
        }
    };

    let (mut rx, _child) = match command.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            let reason = format!("spawn failed: {e}");
            let _ = app.emit("sidecar:error", format!("{}: {reason}", sidecar.name));
            // Same reason as above: every exit from this function must report to the gate.
            if let Some(reveal) = gate.note_failed(sidecar.name, &reason) {
                apply(app, reveal);
            }
            return;
        }
    };

    // ONE reader, TWO jobs. Stderr goes to the shell log AND to the gate's ring buffer (the log is
    // for the developer tailing a terminal, the ring is what the boot-error splash shows the
    // operator). `Terminated` is the death signal itself — the child is gone the instant this
    // arrives, so supervision hears it without waiting a single probe cycle.
    let log_handle = app.clone();
    let log_name = sidecar.name;
    let log_service = sidecar.service;
    let log_gate = gate.clone();
    let log_monitor = monitor.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stderr(line) => {
                    let line = String::from_utf8_lossy(&line);
                    log::warn!("[{}] {}", log_name, line);
                    log_gate.record_stderr(log_name, line.trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    log::error!(
                        "[{}] process exited (code {:?}, signal {:?})",
                        log_name,
                        payload.code,
                        payload.signal
                    );
                    if let Some(state) = log_monitor.note_exit(log_service) {
                        react(&log_handle, state);
                    }
                }
                _ => {}
            }
        }
    });

    // Bootstrap health-check: 60s budget, 500ms cadence — both unchanged. What changed is HOW the
    // question is asked: the typed probe is async, `tauri::async_runtime` does not re-export
    // `sleep`, and its `block_on` is `Runtime::block_on` (panics when called from inside the
    // runtime) — so this is a real async loop over the tokio the tauri dependency already carries.
    let health_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let api = health_handle.state::<Api>();
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            // Boot asks the narrow question — READY or not. The richer outcome supervision needs
            // (alive-and-reproved vs nothing-there) is meaningless while nothing has come up yet.
            if probe(&api, sidecar.service).await == ProbeOutcome::Healthy {
                let _ = health_handle.emit("sidecar:ready", sidecar.name);
                log::info!("[{}] ready on :{}", sidecar.name, sidecar.port);
                if let Some(reveal) = gate.note_ready(sidecar.name) {
                    apply(&health_handle, reveal);
                }
                return;
            }
            if Instant::now() >= deadline {
                let reason = format!("no healthy response from :{} within 60s", sidecar.port);
                let _ = health_handle.emit("sidecar:error", format!("{}: {reason}", sidecar.name));
                // NO LONGER REVEALED ANYWAY. This branch used to call the same `note_ready` as the
                // success path, so a dead sidecar still opened the console — the operator got a
                // dashboard querying ports nobody was listening on, with the reason buried in an
                // event the UI may never have rendered. The give-up now reports a FAILURE, and the
                // gate sends the last arrival to the boot-error splash instead.
                log::warn!("[{}] never became healthy — routing boot to the error splash", sidecar.name);
                if let Some(reveal) = gate.note_failed(sidecar.name, &reason) {
                    apply(&health_handle, reveal);
                }
                return;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    });
}
