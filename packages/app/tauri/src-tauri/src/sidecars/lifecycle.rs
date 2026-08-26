//! PROCESS LIFECYCLE — the other half of the 30/07 bug, widened on 31/07.
//!
//! Supervision makes a death visible; this makes "Restart" actually start clean. Without it the
//! button recreates the incident: the shell exits, its children are adopted by launchd (`ppid 1`)
//! and keep holding `:3030`/`:3032`, and the next window has NO children of its own while talking
//! happily to the previous session's processes. Nothing in that picture is an error anywhere.
//!
//! THREE parts now, in order of how much of the problem each one can see:
//!   (a) kill the children when the shell goes down GRACEFULLY (`RunEvent::Exit`);
//!   (b) kill them when the shell is asked to go down by SIGNAL (`install_signal_handlers`);
//!   (c) refuse to spawn onto a port somebody is already listening on (`port_conflict`).
//!
//! And the one the shell CANNOT do from here at all: `SIGKILL`, a panic in the event loop, or a
//! power cut run no hook of ours, so (a) and (b) are both skipped. The only defense that survives
//! the parent's sudden death is on the CHILD side — each sidecar watches the pid the shell handed
//! it (`CODM_PARENT_PID`) and exits when it stops being its parent (TS: `core/src/utils/Watchdog.ts`,
//! Go: `core/pkg/watchdog/watchdog.go`). `sidecars::reap_previous_run` is the belt to that
//! suspenders: whatever a crash still left behind is swept at the NEXT boot, before anything is
//! spawned.
//!
//! ## Why every kill here is SIGTERM first
//!
//! `CommandChild::kill` is `SIGKILL` (std's `Child::kill`), and `SIGKILL` cannot be caught — the
//! daemon's whole graceful `shutdown()` (`api/typescript/src/index.ts`) is skipped, including the
//! step that takes down every provider CLI's PROCESS GROUP. Those CLIs are spawned `detached: true`
//! (`AgentProcess.ts`), i.e. in a group of their OWN, so nothing on the shell side can reach them:
//! the daemon's own drain is the single path that can, and `SIGKILL` is exactly what denies it.
//! So the escalation mirrors the one the daemon already uses on its agents — SIGTERM to everyone,
//! ONE shared grace window, SIGKILL to whoever is left.
//!
//! ## The gap SIGTERM-first left open on Windows
//!
//! `send_sigterm` was ALREADY a documented no-op on Windows (see the `#[cfg(windows)]` block below)
//! — but until now nothing connected that fact to its cost: on a NORMAL quit (window close, the
//! tray's Quit, `RunEvent::Exit`) the SIGTERM half of this file's own graceful step never reaches
//! the daemon there, so `TERM_GRACE` elapses doing nothing OBSERVABLE to the child and `force_kill`
//! (`CommandChild::kill` = `TerminateProcess`) always fires — every bit as hard a kill as `SIGKILL`
//! is on POSIX. `shutdown()` (outbox drain, mediator stop, and the part that actually LEAKS: every
//! provider CLI process tree, `AgentProcess.ts`) never runs. This is NOT the sudden-death case the
//! parent watchdog covers (`core/src/utils/Watchdog.ts`) — the shell is alive and quitting in
//! order, it simply had no channel to ASK the daemon on that OS.
//!
//! The fix opens that channel without a platform-specific transport: `tauri_plugin_shell` keeps a
//! spawned child's stdin PIPED (`process::Command::new`, `Stdio::piped()`) on every OS, so
//! `CommandChild::write` can carry a line to the child regardless of platform. `Supervised::terminate`
//! now writes `SHUTDOWN_SENTINEL` to stdin in the SAME step that sends SIGTERM — POSIX gets both (the
//! sentinel is belt-and-suspenders there; SIGTERM still does the real work and nothing about it
//! changes), Windows gets ONLY the sentinel, which is now the one thing that reaches it. The daemon
//! arms a stdin listener (`core/src/utils/StdinShutdown.ts`) that runs the exact same `shutdown()`
//! SIGTERM already triggers on POSIX — the drain is unified across OSes, not merely "less bad" on
//! Windows. The gateway sidecar receives the same bytes on its own stdin and ignores them (it reads
//! no stdin at all) — see `SHUTDOWN_SENTINEL`'s doc for why that is the intentionally simpler design.

#[cfg(test)]
use std::io::Write;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri_plugin_shell::process::CommandChild;

/// Ceiling on how long the WHOLE fleet gets to exit on SIGTERM before SIGKILL follows.
///
/// Sized off the longest legitimate drain: the daemon's shutdown fans out to
/// `AgentRunnerFactory.shutdown()`, whose own escalation gives each provider CLI group
/// `KILL_GRACE_MS = 2s` (`AgentProcess.ts`) before forcing it. Three seconds leaves that plus the
/// outbox/mediator/DB steps around it. It is a CEILING, not a cost: `terminate_then_force` returns
/// the moment the last child is gone, which for an idle daemon is ~200ms.
pub const TERM_GRACE: Duration = Duration::from_secs(3);

/// How often the grace window re-checks whether the fleet is already gone.
const GRACE_POLL: Duration = Duration::from_millis(50);

/// THE SHELL→DAEMON STDIN LINE — written to EVERY supervised child's stdin on the graceful step, on
/// EVERY platform (POSIX included: belt-and-suspenders next to SIGTERM, never a replacement for it).
/// It is the one thing Windows can observe at all, because no signal exists there for a
/// console-less child (`send_sigterm` below is a no-op on `#[cfg(windows)]`).
///
/// Written to BOTH sidecars, not just the daemon: `ChildRegistry` is role-agnostic by design (a flat
/// `Vec<Box<dyn Supervised>>`, see the `Supervised` trait) and giving `Supervised::terminate` a
/// per-child role to consult would be new plumbing for zero behavioural gain — the Go gateway never
/// reads `os.Stdin` (confirmed: no reference anywhere in `packages/api/go`), so the bytes sit unread
/// in its stdin pipe until the process exits, exactly as harmless as the `SIGTERM` it already
/// ignores having no handler for. Wiring a reader on the Go side, if ever wanted, is a SEPARATE
/// task — it does not change what the shell writes here.
///
/// MIRROR of `core/src/utils/StdinShutdown.ts` `SHUTDOWN_SENTINEL_LINE` — Rust cannot import that
/// file, so this names it as the other half of the pair, against drift. Same seam rule as
/// `updater.rs` mirroring `config/updater.ts`. The TS constant holds the same text WITHOUT the
/// trailing `\n` (it compares an already-line-split string); this one carries the `\n` because it is
/// written straight into the raw byte stream and the newline is what makes it one complete line.
pub(crate) const SHUTDOWN_SENTINEL: &str = "supervisor:shutdown\n";

/// Write the sentinel to anything writable. Its own function — not inlined into
/// `impl Supervised for CommandChild::terminate` — purely so the BYTES are unit-testable without a
/// live `CommandChild`, which cannot be constructed outside a running tauri App (`Command::new` is
/// `pub(crate)` in `tauri_plugin_shell`, reachable only through `ShellExt`). See the tests at the
/// bottom of this file. `#[cfg(test)]`: production writes via `CommandChild::write` directly
/// (`impl Supervised for CommandChild::terminate`, below) — this helper exists solely so the BYTES
/// are testable against a plain `Vec<u8>`/pipe without a live `CommandChild`, so it is dead code
/// outside the test build and stays gated to match.
#[cfg(test)]
pub(crate) fn write_shutdown_sentinel<W: Write>(mut writer: W) {
    let _ = writer.write_all(SHUTDOWN_SENTINEL.as_bytes());
}

/// Everything the shutdown path needs from a process, so the ESCALATION POLICY can be tested
/// without spawning anything and can serve two very different sources:
/// a `CommandChild` we own, and a bare pid left behind by a PREVIOUS run (`reaper::ForeignProcess`).
pub trait Supervised: Send {
    fn pid(&self) -> u32;
    /// Ask politely — SIGTERM (POSIX only) AND the shutdown sentinel written to stdin (every
    /// platform — see `SHUTDOWN_SENTINEL`), so the process's own shutdown hooks run and it can take
    /// its descendants with it. `&mut self` because writing to a piped stdin needs it
    /// (`CommandChild::write` — tauri-plugin-shell 2.3.5, `src/process/mod.rs:72`). This is the ONLY
    /// step that can reach a grandchild.
    fn terminate(&mut self);
    /// Is it still there? Answered by `kill(pid, 0)`, so a process we are not allowed to signal
    /// (EPERM) still counts as alive.
    fn is_alive(&self) -> bool;
    /// Force. Consumes the handle because `CommandChild::kill` does.
    fn force_kill(self: Box<Self>);
}

impl Supervised for CommandChild {
    fn pid(&self) -> u32 {
        CommandChild::pid(self)
    }
    fn terminate(&mut self) {
        send_sigterm(CommandChild::pid(self));
        // Best-effort: a dead child's pipe write fails (`BrokenPipe`) exactly like a SIGTERM to an
        // already-gone pid fails inside `send_sigterm` — both are the EXPECTED case for whichever
        // sidecar finishes its own drain first, and neither failure blocks the other signal.
        let _ = CommandChild::write(self, SHUTDOWN_SENTINEL.as_bytes());
    }
    fn is_alive(&self) -> bool {
        pid_alive(CommandChild::pid(self))
    }
    fn force_kill(self: Box<Self>) {
        // Errors are the EXPECTED case for a fleet the supervisor already declared `Down`.
        let _ = (*self).kill();
    }
}

// ── raw signals ───────────────────────────────────────────────────────────────────
//
// `libc` is declared for these three lines only. It was already in `Cargo.lock` (a transitive dep
// of tauri), so naming it adds no crate to the build.

/// SIGTERM to one pid. Failures are ignored on purpose: the only ones possible are ESRCH (already
/// gone — the goal) and EPERM (not ours — `terminate_then_force` will find it still alive and the
/// force step will fail identically, which is the honest outcome).
#[cfg(unix)]
pub(crate) fn send_sigterm(pid: u32) {
    unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) };
}

/// SIGKILL to one pid — for a process we did NOT spawn and therefore hold no handle to.
#[cfg(unix)]
pub(crate) fn send_sigkill(pid: u32) {
    unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) };
}

/// `kill(pid, 0)` — probe without delivering. EPERM means the process EXISTS but is not ours to
/// signal, which is still "alive"; only ESRCH means gone.
///
/// Reliable for our own children specifically because tauri-plugin-shell keeps a thread in
/// `SharedChild::wait()` per child (that is what produces `CommandEvent::Terminated`), so an exited
/// sidecar is REAPED rather than left as a zombie that would answer this probe forever.
#[cfg(unix)]
pub(crate) fn pid_alive(pid: u32) -> bool {
    if unsafe { libc::kill(pid as libc::pid_t, 0) } == 0 {
        return true;
    }
    std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

/// Windows has no SIGTERM for a console-less child: there is nothing between "ask" and
/// `TerminateProcess`, so this half of the graceful step stays a no-op. `Supervised::terminate`'s
/// OTHER half, the stdin sentinel (see `SHUTDOWN_SENTINEL`), is what reaches the child here now —
/// before this task the daemon's ONLY Windows drain path was its `CODM_PARENT_PID` watchdog
/// (sudden-death only); this closes the gap for the ORDINARY quit too. Liveness and force are REAL,
/// though — via `sysinfo`, the same crate the startup sweep's table uses: without them
/// `terminate_then_force` could never see a Windows process die, and `reaper` could find an orphan
/// without being able to remove it.
#[cfg(windows)]
pub(crate) fn send_sigterm(_pid: u32) {}

/// `TerminateProcess` on one pid — the Windows equivalent of SIGKILL, for a process we hold no
/// handle to. Failures (already gone, or not ours) are ignored for the same reason as on unix:
/// `terminate_then_force` will find it still alive and report it, which is the honest outcome.
#[cfg(windows)]
pub(crate) fn send_sigkill(pid: u32) {
    let system = windows_system_for(pid);
    if let Some(process) = system.process(sysinfo::Pid::from_u32(pid)) {
        process.kill();
    }
}

/// Is the pid still in the process table? `sysinfo` opens the process to ask; one this user cannot
/// open (another session, elevated) is still LISTED — like `kill(pid, 0)`'s EPERM, that counts as
/// alive. Only a pid that is gone comes back `None`.
#[cfg(windows)]
pub(crate) fn pid_alive(pid: u32) -> bool {
    windows_system_for(pid)
        .process(sysinfo::Pid::from_u32(pid))
        .is_some()
}

/// One refresh, one pid, no fields — the cheapest view `sysinfo` offers (feature `system`).
/// Built per call: `pid_alive` is polled every `GRACE_POLL` and a cached table would answer stale.
#[cfg(windows)]
fn windows_system_for(pid: u32) -> sysinfo::System {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[sysinfo::Pid::from_u32(pid)]),
        true,
        ProcessRefreshKind::nothing(),
    );
    system
}

/// Neither unix nor Windows: nothing to signal with and nothing to probe with — the
/// pre-escalation behaviour (straight to `force_kill` after the grace window) is all that is left.
#[cfg(not(any(unix, windows)))]
pub(crate) fn send_sigterm(_pid: u32) {}
#[cfg(not(any(unix, windows)))]
pub(crate) fn send_sigkill(_pid: u32) {}
#[cfg(not(any(unix, windows)))]
pub(crate) fn pid_alive(_pid: u32) -> bool {
    true
}

/// THE ESCALATION, once, for every caller: SIGTERM to EVERYONE first, then ONE shared grace window,
/// then force whoever is still standing. Returns the pids that had to be forced.
///
/// "Everyone first" is the load-bearing part. Terminating and waiting per child would serialize the
/// grace windows — two sidecars would cost `2 × TERM_GRACE` in the worst case, and a Cmd+Q would sit
/// there for six seconds. Signalling the fleet up front makes the drains overlap, so the wait is
/// bounded by the SLOWEST child rather than by their sum.
pub(crate) fn terminate_then_force(mut children: Vec<Box<dyn Supervised>>, grace: Duration) -> Vec<u32> {
    for child in &mut children {
        child.terminate();
    }
    let mut survivors = children;
    let deadline = Instant::now() + grace;
    loop {
        survivors.retain(|child| child.is_alive());
        if survivors.is_empty() || Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(GRACE_POLL);
    }
    let forced: Vec<u32> = survivors.iter().map(|child| child.pid()).collect();
    for child in survivors {
        child.force_kill();
    }
    forced
}

/// The live children, retained for exactly one reason: killing them on the way out.
///
/// Before this the handle was dropped as `_child` right after spawn — and dropping a `CommandChild`
/// does NOT kill the process, which is precisely how the orphans in the incident were born.
#[derive(Default)]
pub struct ChildRegistry {
    children: Mutex<Vec<Box<dyn Supervised>>>,
}

impl ChildRegistry {
    /// Take ownership of a freshly spawned child.
    pub fn adopt(&self, child: CommandChild) {
        self.children
            .lock()
            .expect("child registry mutex")
            .push(Box::new(child));
    }

    /// Kill every surviving child — SIGTERM, one `TERM_GRACE` window, SIGKILL for the rest.
    ///
    /// Draining is not an optimization: it makes a SECOND call (the `RunEvent::Exit` that follows
    /// the signal handler's own `kill_all`) a no-op instead of a double-kill.
    pub fn kill_all(&self) {
        self.kill_all_within(TERM_GRACE);
    }

    /// `kill_all` with an explicit grace — the seam the tests use so a policy assertion does not
    /// cost three seconds of wall clock.
    pub fn kill_all_within(&self, grace: Duration) {
        let children: Vec<Box<dyn Supervised>> = self
            .children
            .lock()
            .expect("child registry mutex")
            .drain(..)
            .collect();
        if children.is_empty() {
            return;
        }
        log::info!(
            "codm-shell: shutting down — SIGTERM to {} sidecar process(es)",
            children.len()
        );
        for pid in terminate_then_force(children, grace) {
            log::warn!(
                "codm-shell: sidecar pid {pid} ignored SIGTERM within the grace — SIGKILLed"
            );
        }
    }
}

/// EVERY EXIT PATH, not just the graceful one. `RunEvent::Exit` covers a window close, Cmd+Q and
/// `app.exit()`; it does NOT run when the shell is signalled from outside — and outside is where
/// the founder's incidents come from: `tauri dev` kills and respawns the shell on every recompile,
/// which is how a day's worth of orphaned daemons was collected, one of them serving a stale
/// provider catalog to a brand-new window.
///
/// Order matters. `kill_all()` runs FIRST and synchronously, because it is the part that must not
/// depend on anything else still working; `app.exit(0)` follows so the shell closes through its own
/// path (and `RunEvent::Exit` fires, finding the registry already drained — a no-op).
///
/// The backstop exists because we have now SWALLOWED a signal whose default disposition was to
/// terminate the process. If the event loop is wedged, `app.exit(0)` never lands and the shell
/// would hang holding the terminal — strictly worse than the behaviour we replaced. So the task
/// gives it a bounded window and then exits by hand with the conventional `128 + signo`.
#[cfg(unix)]
pub fn install_signal_handlers(app: &tauri::AppHandle, children: Arc<ChildRegistry>) {
    use tokio::signal::unix::{signal, SignalKind};

    // SIGHUP rides along with the two the founder named: it is what a closing terminal delivers,
    // and `bun desktop:dev` is started from one.
    for (kind, signo) in [
        (SignalKind::terminate(), libc::SIGTERM),
        (SignalKind::interrupt(), libc::SIGINT),
        (SignalKind::hangup(), libc::SIGHUP),
    ] {
        let app = app.clone();
        let children = children.clone();
        tauri::async_runtime::spawn(async move {
            let Ok(mut stream) = signal(kind) else {
                log::error!("codm-shell: could not install handler for signal {signo}");
                return;
            };
            if stream.recv().await.is_none() {
                return;
            }
            log::info!("codm-shell: signal {signo} — taking the sidecars down first");
            children.kill_all();
            app.exit(0);
            tokio::time::sleep(EXIT_BACKSTOP).await;
            log::error!("codm-shell: event loop did not exit — leaving by hand");
            std::process::exit(128 + signo);
        });
    }
}

/// Windows delivers no POSIX signals; `RunEvent::Exit` is the only path there.
#[cfg(not(unix))]
pub fn install_signal_handlers(_app: &tauri::AppHandle, _children: Arc<ChildRegistry>) {}

/// How long `app.exit(0)` gets to actually close the shell before the signal handler stops waiting.
/// Generous next to a healthy event loop (which exits in milliseconds) and short enough that a
/// wedged one does not look like a hang.
#[cfg(unix)]
const EXIT_BACKSTOP: Duration = Duration::from_secs(5);

/// TEST-ONLY MUTUAL EXCLUSION between the tests that LISTEN and the tests that FORK.
///
/// macOS has no `SOCK_CLOEXEC`: `TcpListener::bind` creates the socket and marks it close-on-exec in
/// a SECOND syscall, so a `posix_spawn` landing between the two hands the listener to the child —
/// which then holds the port for its whole life, and `port_conflict` on a released port reports it
/// occupied. Measured at 6 failures in 12 `cargo test` runs (cargo gives every test its own thread,
/// so the listener test and the process-spawning tests genuinely overlap).
///
/// The shell itself is not exposed: its only forks are `/bin/ps` in the startup sweep and the two
/// `command.spawn()` calls, all of them SEQUENTIAL with — never concurrent to — `port_conflict`'s
/// transient bind, on the one `setup` thread. So the fix belongs here, in the tests, and not in a
/// production retry that would paper over a real conflict.
#[cfg(test)]
pub(crate) static FORK_GUARD: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Take `FORK_GUARD`, surviving a poisoned lock — a panic in one test must not cascade into
/// "all the other tests fail too", which is how a single red becomes an unreadable suite.
#[cfg(test)]
pub(crate) fn fork_guard() -> std::sync::MutexGuard<'static, ()> {
    FORK_GUARD.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Is somebody ALREADY listening on this port? `Some(reason)` if the port cannot be taken.
///
/// The technique is the honest one available before spawning: try to bind it ourselves and hand the
/// port straight back. There is a race — between our `drop` and the child's `bind` a third party
/// could take it — and it is the right trade: the alternative is letting the child lose the bind and
/// hoping it exits loudly, which is exactly the assumption that produced a window talking to another
/// session's daemon. A sidecar that fails to bind may log and keep running; a shell that never
/// spawned it cannot be confused about what it is talking to.
///
/// `127.0.0.1` is deliberate — the same address the probe and the SDK use. A process bound to the
/// wildcard (`*:3030`, which is what both sidecars do) still collides with it, so a hijacked port is
/// detected either way.
///
/// NOTE the division of labour with `reap_previous_run`, which runs just BEFORE this: the sweep
/// removes leftovers of OUR OWN binary (matched by path), and whatever still holds the port after
/// that is by definition somebody else's process — which this refuses to boot onto rather than
/// kill. Killing by port is the one thing neither of them will ever do.
pub fn port_conflict(port: u16) -> Option<String> {
    match std::net::TcpListener::bind(("127.0.0.1", port)) {
        Ok(listener) => {
            drop(listener);
            None
        }
        Err(e) => Some(format!(
            "port :{port} is already taken by another process ({e}) — refusing to boot onto a port this shell does not own"
        )),
    }
}

/// THE DECISION, pure: given an optional fixed override and the candidate list (tried through
/// `try_bind`, injected so this is provable without a real socket), which port wins. `Err` names
/// EVERY candidate that was tried, in order, so the caller can build a boot-error reason that lists
/// them (spec 2026-08-25/26, AC: "falhe com erro legível que nomeie as portas tentadas").
pub(crate) fn decide_port(fixed: Option<u16>, candidates: &[u16], try_bind: impl Fn(u16) -> bool) -> Result<u16, Vec<u16>> {
    if let Some(port) = fixed {
        return Ok(port);
    }
    candidates.iter().copied().find(|&port| try_bind(port)).ok_or_else(|| candidates.to_vec())
}

/// Resolve ONE sidecar's listening port against the REAL network: an explicit `process.env` value
/// wins outright — how dev/e2e pin a single fixed port — else the first free candidate
/// (`port_conflict`'s real bind-and-release).
pub fn resolve_port(env_key: &str, candidates: &[u16]) -> Result<u16, Vec<u16>> {
    let fixed = std::env::var(env_key).ok().and_then(|v| v.parse::<u16>().ok());
    decide_port(fixed, candidates, |port| port_conflict(port).is_none())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    /// A process that only exists in the test: it records what was done to it and decides for
    /// itself whether SIGTERM is enough to kill it.
    struct FakeProcess {
        pid: u32,
        alive: Arc<AtomicBool>,
        dies_on_term: bool,
        log: Arc<Mutex<Vec<String>>>,
    }

    impl FakeProcess {
        /// Not `new`: it hands back a `Box<dyn Supervised>`, which is what the escalation takes.
        fn boxed(pid: u32, dies_on_term: bool, log: &Arc<Mutex<Vec<String>>>) -> Box<dyn Supervised> {
            Box::new(Self {
                pid,
                alive: Arc::new(AtomicBool::new(true)),
                dies_on_term,
                log: log.clone(),
            })
        }
    }

    impl Supervised for FakeProcess {
        fn pid(&self) -> u32 {
            self.pid
        }
        fn terminate(&mut self) {
            self.log.lock().unwrap().push(format!("term {}", self.pid));
            if self.dies_on_term {
                self.alive.store(false, Ordering::SeqCst);
            }
        }
        fn is_alive(&self) -> bool {
            self.alive.load(Ordering::SeqCst)
        }
        fn force_kill(self: Box<Self>) {
            self.log.lock().unwrap().push(format!("kill {}", self.pid));
            self.alive.store(false, Ordering::SeqCst);
        }
    }

    /// A child that honours SIGTERM is NEVER SIGKILLed — that is the whole reason the graceful step
    /// exists: only a daemon that got to run its own shutdown takes its provider CLIs with it.
    #[test]
    fn a_child_that_exits_on_sigterm_is_never_forced() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let forced = terminate_then_force(
            vec![FakeProcess::boxed(11, true, &log)],
            Duration::from_millis(200),
        );
        assert!(forced.is_empty(), "quem morreu no SIGTERM nao pode levar SIGKILL");
        assert_eq!(*log.lock().unwrap(), vec!["term 11"]);
    }

    /// ...and one that ignores it is forced anyway. "Graceful first" must never become
    /// "graceful only": the founder's complaint is orphans, and a polite request nobody answers is
    /// how you get one.
    #[test]
    fn a_child_that_ignores_sigterm_is_forced_after_the_grace() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let started = Instant::now();
        let forced = terminate_then_force(
            vec![FakeProcess::boxed(22, false, &log)],
            Duration::from_millis(150),
        );
        assert_eq!(forced, vec![22]);
        assert_eq!(*log.lock().unwrap(), vec!["term 22", "kill 22"]);
        assert!(
            started.elapsed() >= Duration::from_millis(150),
            "o SIGKILL nao pode chegar antes da janela de graca terminar"
        );
    }

    /// THE FLEET IS SIGNALLED BEFORE ANYONE IS WAITED ON. If the escalation terminated and waited
    /// per child, the grace windows would stack and a two-sidecar quit would cost 2 × TERM_GRACE.
    #[test]
    fn the_whole_fleet_is_signalled_before_the_first_wait() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let started = Instant::now();
        let forced = terminate_then_force(
            vec![
                FakeProcess::boxed(1, false, &log),
                FakeProcess::boxed(2, false, &log),
            ],
            Duration::from_millis(150),
        );
        assert_eq!(forced, vec![1, 2]);
        let log = log.lock().unwrap().clone();
        assert_eq!(
            log,
            vec!["term 1", "term 2", "kill 1", "kill 2"],
            "os dois SIGTERM tem de sair antes de qualquer espera"
        );
        assert!(
            started.elapsed() < Duration::from_millis(300),
            "as janelas de graca precisam se sobrepor, nao somar: {:?}",
            started.elapsed()
        );
    }

    /// Nothing to kill is not a failure — and the empty case has to stay silent, or every clean
    /// shutdown logs a scary line.
    #[test]
    fn killing_an_empty_registry_is_a_no_op() {
        let registry = ChildRegistry::default();
        registry.kill_all();
        registry.kill_all();
    }

    /// A real process, signalled for real: `terminate_then_force` has to work through the actual
    /// `libc` calls and not just through the fake, or the policy is tested and the plumbing is not.
    #[cfg(unix)]
    #[test]
    fn a_real_process_that_ignores_sigterm_is_still_killed() {
        let _no_listeners = fork_guard();
        struct RealProcess(std::process::Child);
        impl Supervised for RealProcess {
            fn pid(&self) -> u32 {
                self.0.id()
            }
            fn terminate(&mut self) {
                send_sigterm(self.0.id());
            }
            fn is_alive(&self) -> bool {
                pid_alive(self.0.id())
            }
            fn force_kill(mut self: Box<Self>) {
                let _ = self.0.kill();
                // Reap it, or the pid lingers as a zombie the assertion below would still see.
                let _ = self.0.wait();
            }
        }

        // `trap '' TERM` = ignore SIGTERM. The only way out of this process is SIGKILL.
        let child = std::process::Command::new("/bin/sh")
            .args(["-c", "trap '' TERM; sleep 30"])
            .spawn()
            .expect("spawn a SIGTERM-deaf process");
        let pid = child.id();
        let forced = terminate_then_force(vec![Box::new(RealProcess(child))], Duration::from_millis(300));

        assert_eq!(forced, vec![pid], "um processo surdo ao SIGTERM tem de ser forcado");
        assert!(!pid_alive(pid), "e depois do SIGKILL ele nao pode continuar vivo");
    }

    /// AC-7 — a port somebody else holds is REFUSED, and the refusal names the port so the splash
    /// can tell the operator which one.
    #[test]
    fn an_occupied_port_is_refused_with_a_reason_naming_it() {
        // Nothing may fork while this listener exists — see `FORK_GUARD`.
        let _no_forks = fork_guard();
        // Port 0 = "any free port", so the test never fights a real service for a fixed number.
        let squatter = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind an ephemeral port");
        let port = squatter.local_addr().expect("local addr").port();

        let conflict = port_conflict(port).expect("AC-7: uma porta ocupada tem de ser recusada");
        assert!(
            conflict.contains(&format!(":{port}")),
            "a razao precisa nomear a porta — e ela que o operador vai procurar: {conflict}"
        );

        drop(squatter);
        assert_eq!(
            port_conflict(port),
            None,
            "liberada a porta, o boot segue normal — o guarda nao pode virar um bloqueio permanente"
        );
    }

    /// `decide_port` honra um valor fixo por cima de qualquer candidata — o jeito de dev/e2e
    /// cravarem uma porta única (`process.env`, via `resolve_port`), sem tocar `config/ports.ts`.
    /// `try_bind` nunca é chamado neste caso — provado pelo `panic!` dentro dele.
    #[test]
    fn decide_port_prefers_a_fixed_override_and_never_probes() {
        assert_eq!(decide_port(Some(9999), &[1, 2, 3], |_| panic!("nao deveria sondar nenhuma candidata")), Ok(9999));
    }

    /// Sem override: a primeira candidata que `try_bind` aceita vence, mesmo que uma anterior tenha
    /// sido recusada.
    #[test]
    fn decide_port_falls_back_to_the_first_candidate_try_bind_accepts() {
        assert_eq!(decide_port(None, &[10, 20, 30], |p| p == 20), Ok(20));
    }

    /// Toda candidata recusada, sem override: `Err` nomeia exatamente as portas tentadas, na mesma
    /// ordem — o que o boot-error precisa para uma mensagem acionável (spec 2026-08-25/26).
    #[test]
    fn decide_port_names_every_candidate_when_none_is_accepted() {
        assert_eq!(decide_port(None, &[10, 20, 30], |_| false), Err(vec![10, 20, 30]));
    }

    /// `resolve_port` contra a rede DE VERDADE: sem override no ambiente, a primeira candidata
    /// livre vence.
    #[test]
    fn resolve_port_falls_back_to_the_first_free_candidate() {
        let _no_forks = fork_guard();
        let free = std::net::TcpListener::bind(("127.0.0.1", 0))
            .expect("bind an ephemeral port")
            .local_addr()
            .expect("local addr")
            .port();

        assert_eq!(resolve_port("CODM_TEST_RESOLVE_PORT_UNSET_KEY", &[free]), Ok(free));
    }

    /// Toda candidata ocupada de verdade, sem override: `Err` nomeia as portas tentadas.
    #[test]
    fn resolve_port_names_every_candidate_when_all_are_taken() {
        let _no_forks = fork_guard();
        let a = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind a");
        let b = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind b");
        let ports = vec![a.local_addr().unwrap().port(), b.local_addr().unwrap().port()];

        assert_eq!(resolve_port("CODM_TEST_RESOLVE_PORT_UNSET_KEY", &ports), Err(ports));
    }

    /// The frozen wire value, byte for byte: ONE complete line. The TS side
    /// (`core/src/utils/StdinShutdown.ts`) reads stdin as line-buffered text and compares against
    /// the SAME text minus this trailing `\n` — see `SHUTDOWN_SENTINEL`'s doc for why the two
    /// constants differ by exactly that character.
    #[test]
    fn the_shutdown_sentinel_is_one_terminated_line() {
        let mut buf: Vec<u8> = Vec::new();
        write_shutdown_sentinel(&mut buf);
        assert_eq!(buf, SHUTDOWN_SENTINEL.as_bytes());
        assert_eq!(
            String::from_utf8(buf).unwrap(),
            "supervisor:shutdown\n",
            "o valor esta CONGELADO — mudar aqui sem mudar StdinShutdown.ts quebra o par"
        );
    }

    /// The actual mechanism `impl Supervised for CommandChild::terminate` exercises: a piped stdin,
    /// written to while the child is alive, delivers the bytes verbatim. Goes through a REAL child
    /// and a REAL OS pipe rather than a fake, because `CommandChild` itself cannot be constructed in
    /// a test — `tauri_plugin_shell::process::Command::new` is `pub(crate)` to that crate and needs
    /// a live tauri App to reach through `ShellExt`. This is the same trade the `RealProcess` test
    /// above already makes for SIGTERM.
    #[cfg(unix)]
    #[test]
    fn writing_the_sentinel_to_a_piped_stdin_reaches_the_child_verbatim() {
        let _no_listeners = fork_guard();
        let out_path = std::env::temp_dir().join(format!("codm-sentinel-test-{}", std::process::id()));
        let mut child = std::process::Command::new("/bin/sh")
            .arg("-c")
            .arg(format!("cat > {}", out_path.display()))
            .stdin(std::process::Stdio::piped())
            .spawn()
            .expect("spawn a stdin sink");
        let mut stdin = child.stdin.take().expect("piped stdin");
        write_shutdown_sentinel(&mut stdin);
        drop(stdin); // EOF — `cat` exits once its input closes
        child.wait().expect("child exits");

        let received = std::fs::read_to_string(&out_path).expect("read back what the child received");
        let _ = std::fs::remove_file(&out_path);
        assert_eq!(
            received, SHUTDOWN_SENTINEL,
            "o filho tem de receber a linha inteira, byte a byte, pelo MESMO tipo de pipe que CommandChild usa"
        );
    }
}
