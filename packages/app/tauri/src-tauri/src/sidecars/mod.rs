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

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::api::Api;

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

/// Reveal the main window. Idempotent — `show()` on an already-visible window is a no-op, and the
/// readiness path can reach this from either the success or the give-up branch.
fn reveal_main_window(app: &tauri::AppHandle) {
    match app.get_webview_window("main") {
        Some(window) => {
            let _ = window.show();
            let _ = window.set_focus();
        }
        None => log::warn!("main window not found — nothing to reveal"),
    }
}

/// READINESS GATE. The window starts hidden (`"visible": false` in tauri.conf.json) and is revealed
/// only once every sidecar has answered its health probe.
///
/// Before this the shell painted the console the moment the webview existed, while the daemon was
/// still applying migrations — so the first thing the operator saw was a UI firing queries at a port
/// nobody was listening on yet: failed reads, a dead SSE stream, and a dashboard that filled in
/// several seconds later, if at all. Waiting is both more honest and cheaper than the reconnect
/// machinery the alternative would need.
///
/// `ready` counts the sidecars that have PASSED; `total` is how many must. Whoever arrives last
/// opens the window.
fn note_ready(app: &tauri::AppHandle, ready: &Arc<AtomicUsize>, total: usize) {
    if ready.fetch_add(1, Ordering::SeqCst) + 1 >= total {
        reveal_main_window(app);
    }
}

/// Spawn one sidecar and poll its health URL until ready (or timeout). Emits
/// `sidecar:ready` / `sidecar:error` to the webview so the console can render
/// boot progress honestly instead of spinning forever.
pub fn boot_sidecar(app: &tauri::AppHandle, sidecar: Sidecar, ready: Arc<AtomicUsize>, total: usize) {
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
            let _ = app.emit("sidecar:error", format!("{}: spawn setup failed: {e}", sidecar.name));
            // Count it, or the gate below never reaches `total` and the window stays hidden forever.
            note_ready(app, &ready, total);
            return;
        }
    };

    let (mut rx, _child) = match command.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            let _ = app.emit("sidecar:error", format!("{}: spawn failed: {e}", sidecar.name));
            // Same reason as above: every exit from this function must advance the readiness count.
            note_ready(app, &ready, total);
            return;
        }
    };

    // Forward sidecar stderr into the shell log so crashes are diagnosable.
    let log_handle = app.clone();
    let log_name = sidecar.name;
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stderr(line) = event {
                log::warn!("[{}] {}", log_name, String::from_utf8_lossy(&line));
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
                note_ready(&health_handle, &ready, total);
                return;
            }
            if Instant::now() >= deadline {
                let _ = health_handle.emit(
                    "sidecar:error",
                    format!("{}: no healthy response from :{} within 60s", sidecar.name, sidecar.port),
                );
                // REVEAL ANYWAY. A sidecar that never comes up must not leave the operator staring at
                // a dock icon with no window and no way to learn why — a visibly broken console beats
                // an invisible one, and the `sidecar:error` event above is what the UI renders. This
                // is why the gate counts through `note_ready` rather than waiting on every probe: the
                // give-up path has to be able to open the window too.
                log::warn!("[{}] never became healthy — revealing the window regardless", sidecar.name);
                note_ready(&health_handle, &ready, total);
                return;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    });
}
