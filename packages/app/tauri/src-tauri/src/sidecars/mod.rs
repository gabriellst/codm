//! Sidecar supervision — spawns the two bundled sidecars (TS daemon + Go gateway,
//! `bundle.externalBin`) and polls a bootstrap HTTP health-check per service.
//!
//! The `Sidecar` descriptor's INSTANCES are never hand-typed — `generated.rs`
//! (rendered from template.config.ts REPO.desktop by `bun desktop:generate`) is
//! the single source of every name / port / health path / boot-env literal, plus
//! the `IDENTIFIER` const (bundle id = keychain service). It is `include!`-ed
//! below, AFTER the `Sidecar` struct it references.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::{Duration, Instant};

use tauri::Emitter;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Sidecar bootstrap descriptor: binary name (as in `bundle.externalBin`),
/// readiness URL parts, and the env the process boots with.
pub struct Sidecar {
    name: &'static str,
    port: u16,
    health_path: &'static str,
    env: Vec<(String, String)>,
}

// IDENTIFIER (bundle id = keychain service) + sidecars(data_dir) — generated
// from the desktop contract; drift-gated by `bun desktop:generate --check`.
include!("generated.rs");

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

/// Spawn one sidecar and poll its health URL until ready (or timeout). Emits
/// `sidecar:ready` / `sidecar:error` to the webview so the console can render
/// boot progress honestly instead of spinning forever.
pub fn boot_sidecar(app: &tauri::AppHandle, sidecar: Sidecar) {
    let command = match app.shell().sidecar(sidecar.name) {
        Ok(cmd) => cmd.envs(sidecar.env.clone()),
        Err(e) => {
            let _ = app.emit("sidecar:error", format!("{}: spawn setup failed: {e}", sidecar.name));
            return;
        }
    };

    let (mut rx, _child) = match command.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            let _ = app.emit("sidecar:error", format!("{}: spawn failed: {e}", sidecar.name));
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
                return;
            }
            if Instant::now() >= deadline {
                let _ = health_handle.emit(
                    "sidecar:error",
                    format!("{}: no 200 from :{}{} within 60s", sidecar.name, sidecar.port, sidecar.health_path),
                );
                return;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    });
}
