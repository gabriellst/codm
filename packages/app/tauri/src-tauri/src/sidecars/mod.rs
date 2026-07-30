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

use crate::api::Api;

mod gate;
pub use gate::*;

/// Which SDK sub-client answers for this process. A fact of the SHELL (which binary is which
/// service), not of the contract: the health PATH lives in the OpenAPI spec and arrives through the
/// generated method, so there is no longer a literal to keep in step with `config/sidecars.ts`
/// (spec E2). The `match` in `probe` is total — the compiler proves every service is probeable.
#[derive(Clone, Copy)]
pub enum SidecarService {
    Daemon,
    Gateway,
}

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
            name: "codedm-daemon",
            port: api_port,
            service: SidecarService::Daemon,
            // Not optional: the compiled daemon resolves the libsql native addon from
            // its CWD. Without this it cannot start. See `Sidecar::cwd`.
            cwd: Some(resource_dir.join("daemon-runtime")),
            env: vec![
                ("API_PORT".into(), api_port.to_string()),
                ("CODEDM_DATA_DIR".into(), data_dir.into()),
                ("CODEDM_MIGRATIONS_DIR".into(), migrations_dir),
                ("API_GO_URL".into(), "http://localhost:3032".into()),
                ("NODE_ENV".into(), "production".into()),
            ],
        },
        Sidecar {
            name: "codedm-gateway",
            port: channel_port,
            service: SidecarService::Gateway,
            // A static Go binary — nothing to resolve from disk, so it inherits the shell's CWD.
            cwd: None,
            env: vec![
                ("CHANNEL_PORT".into(), channel_port.to_string()),
                ("CODEDM_DATA_DIR".into(), data_dir.into()),
                (
                    "CHANNEL_ALLOWED_ORIGINS".into(),
                    "tauri://localhost,http://localhost:5173".into(),
                ),
            ],
        },
    ]
}

/// READINESS BY CONTRACT. One typed call through the generated client (`codedm-client-rust`) — the
/// same door the rest of the shell uses (`api::Api`, the house rule pinned by
/// `tests/no_raw_http.rs`).
///
/// `is_ok()` is the entire predicate, and it is sufficient by construction: the generated method
/// matches `200 => Ok(..)` and sends everything else to `Err` — including the 503 both health
/// endpoints answer with while a gate component is down. Readiness is the HTTP code; the payload is
/// for humans.
async fn probe(api: &Api, service: SidecarService) -> bool {
    match service {
        SidecarService::Daemon => api.client.typescript.health().await.is_ok(),
        SidecarService::Gateway => api.client.go.health().await.is_ok(),
    }
}

/// Reveal the window the gate chose. Idempotent — `show()` on an already-visible window is a no-op.
///
/// The main window appears ONLY through `Reveal::Main`. The give-up path opens `boot-error` —
/// declared in `tauri.conf.json` with `visible: false`, exactly like the main one — and the main
/// window STAYS hidden: a dashboard firing queries at dead ports is worse than a screen that says
/// what broke.
fn apply(app: &tauri::AppHandle, reveal: Reveal) {
    let label = match &reveal {
        Reveal::Main => "main",
        Reveal::BootError(failures) => {
            // The splash reads the failures back through `boot_failures` (PULL — an emit fired
            // before that page loads would be lost); this line is the same fact in the shell log,
            // for whoever is tailing a terminal instead of looking at the window.
            let names: Vec<&str> = failures.iter().map(|f| f.name.as_str()).collect();
            log::error!("boot failed for {} sidecar(s): {}", failures.len(), names.join(", "));
            "boot-error"
        }
    };
    match app.get_webview_window(label) {
        Some(window) => {
            let _ = window.show();
            let _ = window.set_focus();
        }
        None => log::error!("window '{label}' does not exist — check tauri.conf.json (generated)"),
    }
}

/// Spawn one sidecar and poll its health operation until ready (or timeout). Emits
/// `sidecar:ready` / `sidecar:error` to the webview so the console can render
/// boot progress honestly instead of spinning forever.
///
/// EVERY exit path reports to the `gate` — success through `note_ready`, the three failure paths
/// through `note_failed` — and whoever arrives last gets the `Reveal` that decides which window the
/// operator actually sees.
pub fn boot_sidecar(app: &tauri::AppHandle, sidecar: Sidecar, gate: Arc<ReadinessGate>) {
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

    // Forward sidecar stderr into the shell log AND into the gate's ring buffer — the log is for
    // the developer tailing a terminal, the ring is what the boot-error splash shows the operator.
    let log_handle = app.clone();
    let log_name = sidecar.name;
    let log_gate = gate.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stderr(line) = event {
                let line = String::from_utf8_lossy(&line);
                log::warn!("[{}] {}", log_name, line);
                log_gate.record_stderr(log_name, line.trim_end());
                let _ = log_handle; // handle kept alive for the sidecar's lifetime
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
            if probe(&api, sidecar.service).await {
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
