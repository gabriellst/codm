//! Sidecar supervision — spawns the two bundled sidecars (TS daemon + Go gateway,
//! `bundle.externalBin`) and polls each service's readiness through the TYPED SDK
//! (`api::Api` → the generated `health()` operation), never a hand-assembled request.
//!
//! The sidecar SET is hand-written in `sidecars()` below, mirroring the LEAN
//! cross-boundary list the JS side needs (binary role → port env key → build recipe)
//! in `packages/app/tauri/config/sidecars.ts`, which `config/build-sidecars.ts` and
//! `config/generate.ts` read; keep the two in step (same two roles). Each process's
//! boot ENV has two halves: the CONTRACT half — the keys `template.config.ts` declares
//! the shell reads (`API_PORT`, `CHANNEL_PORT`, `CODM_CLOUD_URL`) — arrives as
//! compile-time constants through `crate::shell_env` (generated `shell-env.json` →
//! `build.rs` → `env!()`), never as a literal here; the RUNTIME half (`data_dir`,
//! `resource_dir/migrations`, the parent pid, the bundle version) is computed in
//! `sidecars()`, because only the running process knows it. The readiness PATH is in
//! NEITHER list any more: it lives in the OpenAPI contract and arrives through the
//! generated method (spec E2).

use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
// The typed-event trait — `SupervisionChanged::emit` is its method, not an inherent one.
use tauri_specta::Event as _;

use crate::api::Api;
use crate::shell_env;

mod gate;
pub use gate::*;

mod supervision;
pub use supervision::*;

mod lifecycle;
pub use lifecycle::*;

mod reaper;
pub use reaper::*;

// Not `pub use`d — only `boot_sidecar` below constructs one; nothing outside this module needs to
// name the type.
mod sidecar_log;
use sidecar_log::SidecarLog;

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

/// A sidecar whose every candidate port (`config/ports.ts`) was already taken when the shell tried
/// to bind one — no process spawned, nothing to supervise. Reported straight to the readiness gate
/// (`report_failure`, called from `lib.rs`'s `setup`) in the same vocabulary a spawn failure uses,
/// naming every port that was tried — never the generic "did not open" (spec 2026-08-25/26).
pub struct PortsExhausted {
    pub name: &'static str,
    pub candidates: Vec<u16>,
}

/// Resolve the daemon's and the gateway's listening ports ONCE, before either the typed SDK client
/// (`api::Api`) or the spawned processes' own boot env reads them — two independent resolutions
/// could each pick a different free candidate and put the client and the sidecar it calls on
/// different addresses. `process.env` (`API_PORT`/`CHANNEL_PORT`) pins a fixed value exactly as
/// before (dev/e2e); otherwise the first free candidate from `config/ports.ts` wins
/// (`lifecycle::resolve_port`).
///
/// A port that could not be resolved (every candidate occupied) still needs A number so the OTHER
/// sidecar's env can be built (`API_GO_URL` below) even though nothing will ever answer there — the
/// first candidate is used as that inert placeholder, and the failure is recorded in the returned
/// `Vec<PortsExhausted>` so the caller never spawns that sidecar and reports the failure instead.
pub fn resolve_ports() -> (u16, u16, Vec<PortsExhausted>) {
    // Named through a binding rather than an inline `name:` + string-literal struct field (as the
    // TWO `Sidecar` values below use): `scripts/release/smoke-sidecars.test.ts`'s cross-lang gate
    // extracts each Sidecar's boot env by finding that exact "field colon, quoted role" text in
    // THIS file and reading until the next `Sidecar {` — an extra occurrence of it ahead of the
    // real struct literals in `sidecars()` below would shift what the extractor reads.
    let daemon_name = "codm-daemon";
    let gateway_name = "codm-gateway";
    let api_candidates = shell_env::port_candidates(shell_env::DAEMON_API_PORT_CANDIDATES);
    let channel_candidates = shell_env::port_candidates(shell_env::GATEWAY_CHANNEL_PORT_CANDIDATES);
    let mut exhausted = Vec::new();

    let api_port = match resolve_port("API_PORT", &api_candidates) {
        Ok(port) => port,
        Err(candidates) => {
            let placeholder = candidates[0];
            exhausted.push(PortsExhausted { name: daemon_name, candidates });
            placeholder
        }
    };
    let channel_port = match resolve_port("CHANNEL_PORT", &channel_candidates) {
        Ok(port) => port,
        Err(candidates) => {
            let placeholder = candidates[0];
            exhausted.push(PortsExhausted { name: gateway_name, candidates });
            placeholder
        }
    };
    (api_port, channel_port, exhausted)
}

/// Report a failure straight to the readiness gate and reveal whichever window the gate decides —
/// the same path `boot_sidecar`'s own pre-spawn checks use, exposed here for a failure discovered
/// EARLIER than that (port resolution, in `lib.rs`'s `setup`, before any process is spawned at all).
pub fn report_failure(app: &tauri::AppHandle, gate: &ReadinessGate, name: &str, reason: &str) {
    log::error!("[{name}] {reason}");
    let _ = app.emit("sidecar:error", format!("{name}: {reason}"));
    if let Some(reveal) = gate.note_failed(name, reason, None) {
        apply(app, reveal);
    }
}

/// The two supervised sidecars + the exact env each boots with. The descriptors mirror
/// `config/sidecars.ts`; the boot env is assembled here from two sources — the
/// manifest-derived constants (`crate::shell_env`, the contract half) and the runtime
/// facts below (the half only this process knows).
///
/// `data_dir`     — app-data subdir (`app_data_dir()/data`), the sidecars' data root.
/// `resource_dir` — bundle resource dir, holding the two dirs a compiled sidecar reads
///                  from disk (`config/build-sidecars.ts` stages them under `binaries/`,
///                  `bundle.resources` copies them here):
///                  `migrations`     — the Drizzle migrations the daemon applies on boot;
///                  `daemon-runtime` — the libsql native-prebuild closure, which is the
///                                     daemon's spawn CWD (see `Sidecar::cwd`).
///
/// EVERY sidecar also gets `CODM_PARENT_PID`. It is the one thing the shell can hand a child that
/// survives the shell's own sudden death: no exit hook of ours runs under `SIGKILL`, so the last
/// line of defense has to be the child noticing it was orphaned. Each sidecar polls its own parent
/// pid against this value and shuts itself down when they stop matching — see
/// `api/typescript/src/watchdog.ts` and `api/go/internal/shared/watchdog.go`. Unset (a sidecar
/// started by hand, or by `bun dev`) DISABLES the watchdog, which is why it is passed here, at the
/// one place that actually knows a supervising shell exists.
///
/// `app_version` vem do `package_info()` do Tauri (que lê `tauri.conf.json`) — NÃO de
/// `CARGO_PKG_VERSION`, que é a versão da crate e não acompanha a do bundle (0.1.0 contra 0.1.10 em
/// 2026-08-07). A linha "Sobre" das configurações lia o package.json do workspace do daemon e
/// mostrava 0.0.1; a versão é fato do BUNDLE, e o shell é quem o conhece.
///
/// `api_port`/`channel_port` chegam JÁ RESOLVIDOS (`resolve_ports`, chamado uma vez em `setup`) —
/// esta função não escolhe porta nenhuma, só monta os dois descritores com os valores que venceram.
pub fn sidecars(data_dir: &str, resource_dir: &std::path::Path, app_version: &str, api_port: u16, channel_port: u16) -> Vec<Sidecar> {
    // A origem da nuvem, do manifesto (`config/cloud.ts` → shell-env.json). Sem esta linha o daemon
    // empacotado nascia sem `CODM_CLOUD_URL` e respondia `503 CLOUD_UNREACHABLE` a toda tela
    // (medido no 0.5.1 instalado): `auth` é cloud-only, então ele não tem a quem perguntar quem é
    // o operador a não ser que o shell diga onde a nuvem mora.
    let cloud_url = shell_env::value_from_env("CODM_CLOUD_URL", shell_env::DAEMON_CODM_CLOUD_URL);
    let migrations_dir = resource_dir
        .join("migrations")
        .to_string_lossy()
        .into_owned();
    let parent_pid = std::process::id().to_string();
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
                ("CODM_CLOUD_URL".into(), cloud_url),
                // A marca de exibição, do manifesto. Sem esta linha o daemon caía no default
                // 'Your Product' do ProductConfig (medido no 0.5.3).
                ("PRODUCT_NAME".into(), shell_env::value_from_env("PRODUCT_NAME", shell_env::DAEMON_PRODUCT_NAME)),
                // Derived from the gateway's port, never a second literal for `:3032`.
                ("API_GO_URL".into(), format!("http://localhost:{channel_port}")),
                ("NODE_ENV".into(), "production".into()),
                ("CODM_PARENT_PID".into(), parent_pid.clone()),
                ("CODM_APP_VERSION".into(), app_version.to_string()),
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
                // O nome do dispositivo vinculado que o cliente vê no WhatsApp — sem isto o
                // gateway mostrava 'Your Product' (medido no 0.5.3).
                ("PRODUCT_NAME".into(), shell_env::value_from_env("PRODUCT_NAME", shell_env::GATEWAY_PRODUCT_NAME)),
                ("CODM_DATA_DIR".into(), data_dir.into()),
                (
                    "CHANNEL_ALLOWED_ORIGINS".into(),
                    "tauri://localhost,http://localhost:5173".into(),
                ),
                ("CODM_PARENT_PID".into(), parent_pid),
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
        SidecarService::Daemon => api
            .client
            .typescript
            .health()
            .await
            .err()
            .map(|e| e.status()),
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
            log::error!(
                "boot failed for {} sidecar(s): {}",
                failures.len(),
                names.join(", ")
            );
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
    let gate = app.state::<Arc<ReadinessGate>>().inner().clone();
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
        // A PERIOD, not a gap. `sleep(INTERVAL)` at the top of the loop would ADD the cycle's own
        // cost to the wait, so a sidecar that hangs (each probe burning the full `PROBE_TIMEOUT`)
        // would stretch the cadence to ~9s and push the 3-failure verdict from the spec's ~15s out
        // to ~27s — the hysteresis silently getting slower exactly when something IS wrong.
        // `MissedTickBehavior::Delay` keeps that honest without the opposite failure: after a slow
        // cycle it waits a full interval instead of firing a burst to "catch up".
        let mut ticker = tokio::time::interval(PROBE_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        ticker.tick().await; // the first tick resolves immediately — that one is the boot's own probe
        loop {
            ticker.tick().await;
            let api = handle.state::<Api>();
            for (service, name) in &fleet {
                let outcome = probe_within_budget(&api, *service).await;
                if let Some(state) = monitor.note_probe(*service, outcome) {
                    log::warn!("[{name}] supervision transition after probe: {outcome:?}");
                    react(&handle, &gate, &monitor, state);
                }
            }
        }
    });
}

/// What a transition DOES — the reaction is SPLIT BY SIDECAR (spec Decision 6), because the two
/// deaths cost different things:
///
/// - **daemon down** -> the console is worthless (every read, every write and the SSE stream go
///   through it), so the window is taken away and the boot-error splash comes back with the stderr
///   tail and the retry button. REUSED, not reimplemented: `Reveal::BootError` + `apply` are the
///   same path the boot takes, and the splash reads the same `boot_failures`.
/// - **gateway down** -> the console stays usable and shows a fixed banner. It renders that from the
///   event below plus the `supervision_state` command; the shell decides nothing about it.
///
/// Everything else (`Degraded`, and the recovery back to `Healthy`) is console-only by construction:
/// the emit fires for every transition, and only the daemon's death touches a window.
///
/// NO AUTO-RESPAWN (spec Decision 7). Detect and show; the operator restarts through `retry_boot`.
/// A silent respawn hides the failure, and a crash-loop becomes a blinking window with no cause.
fn react(
    app: &tauri::AppHandle,
    gate: &ReadinessGate,
    monitor: &SupervisionMonitor,
    state: SupervisionState,
) {
    log::warn!("supervision state changed: {state:?}");
    // PUSH half of spec Decision 9. The PULL half (`supervision_state`) exists because this emit is
    // lost on anyone who was not mounted yet — the `boot_failures` lesson.
    if let Err(e) = (SupervisionChanged {
        state: state.clone(),
    })
    .emit(app)
    {
        log::error!("failed to emit supervision change: {e}");
    }
    if state
        == (SupervisionState::Down {
            sidecar: SidecarService::Daemon,
        })
    {
        let name = monitor.name_of(SidecarService::Daemon);
        // The splash's whole reason for being ACTIONABLE (2026-08-07 incident) is this path — the
        // operator reading it needs to know WHERE the persisted stderr lives, not just that the
        // daemon died.
        let log_path = monitor.log_path_of(SidecarService::Daemon);
        let reveal = gate.note_runtime_failure(
            &name,
            "sidecar died while the app was running",
            log_path.as_deref(),
        );
        apply(app, reveal);
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
    children: Arc<ChildRegistry>,
    log_dir: &std::path::Path,
) {
    // FAIL LOUD BEFORE SPAWNING (spec Decision 8b / AC-7). A port already held by somebody else is
    // the incident's first domino: spawn anyway and the new child loses the bind while the OLD
    // process keeps answering, so the fresh window converses with the previous session's backend and
    // every health probe passes. Refusing here routes it to the splash with the reason instead.
    //
    // No log file is opened for this branch (and the two spawn-failure branches below): nothing has
    // run yet, so there is no stderr to persist — the in-memory `reason` already carries the whole
    // story for these, and the splash renders it without needing a file.
    if let Some(reason) = port_conflict(sidecar.port) {
        let _ = app.emit("sidecar:error", format!("{}: {reason}", sidecar.name));
        log::error!("[{}] {reason}", sidecar.name);
        if let Some(reveal) = gate.note_failed(sidecar.name, &reason, None) {
            apply(app, reveal);
        }
        return;
    }

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
            if let Some(reveal) = gate.note_failed(sidecar.name, &reason, None) {
                apply(app, reveal);
            }
            return;
        }
    };

    let (mut rx, child) = match command.spawn() {
        Ok(pair) => pair,
        Err(e) => {
            let reason = format!("spawn failed: {e}");
            let _ = app.emit("sidecar:error", format!("{}: {reason}", sidecar.name));
            // Same reason as above: every exit from this function must report to the gate.
            if let Some(reveal) = gate.note_failed(sidecar.name, &reason, None) {
                apply(app, reveal);
            }
            return;
        }
    };

    // The handle is RETAINED, not dropped. Dropping a `CommandChild` does not kill the process —
    // that is exactly how a shell's children outlive it and start holding ports for nobody.
    children.adopt(child);

    // PERSISTED STDERR (2026-08-07 incident) — best-effort disk mirror of the ring buffer the gate
    // already keeps in memory. `None` here just means the splash's reason has no file to point the
    // operator to; boot proceeds exactly as it did before this existed. Recorded on the monitor
    // (not just held locally) so a RUNTIME death — reported from the probe loop in `supervise()`,
    // which never touches this stack frame — can still attach the same path.
    let sidecar_log = SidecarLog::open(log_dir, sidecar.name);
    if let Some(log) = &sidecar_log {
        monitor.set_log_path(sidecar.service, log.path().to_string_lossy().into_owned());
    }

    // ONE reader, THREE jobs. Stderr goes to the shell log, the gate's ring buffer, AND — the
    // point of this whole module — the persisted file (the log is for the developer tailing a
    // terminal, the ring is what the boot-error splash shows live, the file is what survives after
    // both are gone). `Terminated` is the death signal itself — the child is gone the instant this
    // arrives, so supervision hears it without waiting a single probe cycle; its exit code/signal is
    // exactly the line that used to only reach `log::error!` (a no-op in a packaged build) and now
    // also lands in the file.
    let log_handle = app.clone();
    let log_name = sidecar.name;
    let log_service = sidecar.service;
    let log_gate = gate.clone();
    let log_monitor = monitor.clone();
    let reader_log = sidecar_log.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stderr(line) => {
                    let line = String::from_utf8_lossy(&line);
                    log::warn!("[{}] {}", log_name, line);
                    let trimmed = line.trim_end();
                    log_gate.record_stderr(log_name, trimmed);
                    if let Some(log) = &reader_log {
                        log.append(trimmed);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    log::error!(
                        "[{}] process exited (code {:?}, signal {:?})",
                        log_name,
                        payload.code,
                        payload.signal
                    );
                    if let Some(log) = &reader_log {
                        log.append(&format!(
                            "process exited (code {:?}, signal {:?})",
                            payload.code, payload.signal
                        ));
                    }
                    if let Some(state) = log_monitor.note_exit(log_service) {
                        react(&log_handle, &log_gate, &log_monitor, state);
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
    let health_log = sidecar_log.clone();
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
                log::warn!(
                    "[{}] never became healthy — routing boot to the error splash",
                    sidecar.name
                );
                // By the time we give up, the reader task above has had the full 60s to persist
                // whatever the process printed BEFORE it (maybe) died — the exact stderr the
                // 2026-08-07 incident needed and only had 60 seconds' worth of an in-memory buffer
                // for.
                let log_path = health_log
                    .as_ref()
                    .map(|log| log.path().to_string_lossy().into_owned());
                if let Some(reveal) = gate.note_failed(sidecar.name, &reason, log_path.as_deref()) {
                    apply(&health_handle, reveal);
                }
                return;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    });
}
