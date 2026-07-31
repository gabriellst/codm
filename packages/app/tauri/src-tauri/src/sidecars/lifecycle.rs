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
//! it (`CODM_PARENT_PID`) and exits when it stops being its parent (TS: `src/watchdog.ts`, Go:
//! `internal/shared/watchdog.go`). `sidecars::reap_previous_run` is the belt to that suspenders:
//! whatever a crash still left behind is swept at the NEXT boot, before anything is spawned.
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

/// Everything the shutdown path needs from a process, so the ESCALATION POLICY can be tested
/// without spawning anything and can serve two very different sources:
/// a `CommandChild` we own, and a bare pid left behind by a PREVIOUS run (`reaper::ForeignProcess`).
pub trait Supervised: Send {
    fn pid(&self) -> u32;
    /// Ask politely — SIGTERM, so the process's own shutdown hooks run and it can take its
    /// descendants with it. This is the ONLY step that can reach a grandchild.
    fn terminate(&self);
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
    fn terminate(&self) {
        send_sigterm(CommandChild::pid(self));
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

/// Windows has no SIGTERM for a console-less child, and no cheap liveness probe. The graceful half
/// degrades to a no-op and `pid_alive` stays pessimistic, so every child goes through `force_kill` —
/// the exact behaviour that shipped before this escalation existed.
#[cfg(not(unix))]
pub(crate) fn send_sigterm(_pid: u32) {}
#[cfg(not(unix))]
pub(crate) fn send_sigkill(_pid: u32) {}
#[cfg(not(unix))]
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
pub(crate) fn terminate_then_force(children: Vec<Box<dyn Supervised>>, grace: Duration) -> Vec<u32> {
    for child in &children {
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
        // `eprintln!` and not `log::info!`: this crate has no logging backend wired
        // (`tauri-plugin-log` is deliberately absent), so every `log::*` macro is a no-op and the
        // only channel that actually reaches a terminal is the shell's own stderr.
        eprintln!(
            "codm-shell: shutting down — SIGTERM to {} sidecar process(es)",
            children.len()
        );
        for pid in terminate_then_force(children, grace) {
            eprintln!("codm-shell: sidecar pid {pid} ignored SIGTERM within the grace — SIGKILLed");
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
                eprintln!("codm-shell: could not install handler for signal {signo}");
                return;
            };
            if stream.recv().await.is_none() {
                return;
            }
            eprintln!("codm-shell: signal {signo} — taking the sidecars down first");
            children.kill_all();
            app.exit(0);
            tokio::time::sleep(EXIT_BACKSTOP).await;
            eprintln!("codm-shell: event loop did not exit — leaving by hand");
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
        fn terminate(&self) {
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
            fn terminate(&self) {
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
}
