//! Sidecar supervision — spawns the two bundled sidecars (TS daemon + Go gateway,
//! `bundle.externalBin`) and polls a bootstrap HTTP health-check per service.
//!
//! The sidecar SET and each process's boot ENV are hand-written in `sidecars()`
//! below — env values are runtime paths (`data_dir`, `resource_dir/migrations`) and
//! shell-decision literals the supervisor owns, not a cross-boundary contract. The
//! LEAN cross-boundary list the JS side needs (binary role → port env key → health
//! path → build recipe) lives in `packages/app/tauri/config/sidecars.ts`, which
//! `config/build-sidecars.ts` and `config/generate.ts` read; keep the two in step
//! (same two roles, same ports, same health paths).

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::Emitter;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Sidecar bootstrap descriptor: binary name (as in `bundle.externalBin`),
/// readiness URL parts, the working directory it must be spawned in, and the env
/// the process boots with.
pub struct Sidecar {
    name: &'static str,
    port: u16,
    health_path: &'static str,
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
            health_path: "/v1/session",
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
            health_path: "/api/openapi.json",
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

/// Minimal HTTP/1.1 readiness probe over std TcpStream (no HTTP client dependency):
/// true iff the service answers the GET with a 200 within the per-attempt timeout.
fn probe(port: u16, path: &str) -> bool {
    let attempt = || -> std::io::Result<bool> {
        let addr = format!("127.0.0.1:{port}");
        let mut stream = TcpStream::connect_timeout(
            &addr.parse().expect("static addr"),
            Duration::from_millis(1500),
        )?;
        stream.set_read_timeout(Some(Duration::from_millis(1500)))?;
        stream.set_write_timeout(Some(Duration::from_millis(1500)))?;
        let request = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
        stream.write_all(request.as_bytes())?;
        let mut status_line = [0u8; 16];
        stream.read_exact(&mut status_line)?;
        Ok(status_line.starts_with(b"HTTP/1.1 200") || status_line.starts_with(b"HTTP/1.0 200"))
    };
    attempt().unwrap_or(false)
}

/// Reveal the main window. Idempotent — `show()` on an already-visible window is a no-op, and the
/// readiness path can reach this from either the success or the give-up branch.
fn reveal_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
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

    // Bootstrap health-check: 60s budget, 500ms cadence.
    let health_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let deadline = Instant::now() + Duration::from_secs(60);
        loop {
            if probe(sidecar.port, sidecar.health_path) {
                let _ = health_handle.emit("sidecar:ready", sidecar.name);
                log::info!("[{}] ready on :{}{}", sidecar.name, sidecar.port, sidecar.health_path);
                note_ready(&health_handle, &ready, total);
                return;
            }
            if Instant::now() >= deadline {
                let _ = health_handle.emit(
                    "sidecar:error",
                    format!("{}: no 200 from :{}{} within 60s", sidecar.name, sidecar.port, sidecar.health_path),
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
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}
