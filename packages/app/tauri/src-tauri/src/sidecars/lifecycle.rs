//! PROCESS LIFECYCLE — the other half of the 30/07 bug.
//!
//! Supervision makes a death visible; this makes "Restart" actually start clean. Without it the
//! button recreates the incident: the shell exits, its children are adopted by launchd (`ppid 1`)
//! and keep holding `:3030`/`:3032`, and the next window has NO children of its own while talking
//! happily to the previous session's processes. Nothing in that picture is an error anywhere.
//!
//! Two parts, both deliberately blunt:
//!   (a) kill the children when the shell goes down (`RunEvent::Exit`);
//!   (b) refuse to spawn onto a port somebody is already listening on.
//!
//! (b) exists because (a) can never be complete: `SIGKILL`, a panic in the event loop, or a dev
//! watcher that hard-kills the app all skip every shutdown hook there is. (a) covers the ordinary
//! exit; (b) is what makes the extraordinary one LOUD instead of silent.

use std::sync::Mutex;

use tauri_plugin_shell::process::CommandChild;

/// The live children, retained for exactly one reason: killing them on the way out.
///
/// Before this the handle was dropped as `_child` right after spawn — and dropping a `CommandChild`
/// does NOT kill the process, which is precisely how the orphans in the incident were born.
#[derive(Default)]
pub struct ChildRegistry {
    children: Mutex<Vec<CommandChild>>,
}

impl ChildRegistry {
    /// Take ownership of a freshly spawned child.
    pub fn adopt(&self, child: CommandChild) {
        self.children.lock().expect("child registry mutex").push(child);
    }

    /// Kill every surviving child. Draining is not an optimization — `CommandChild::kill` CONSUMES
    /// the handle, so the registry hands ownership over and empties itself, which also makes a
    /// second call (Exit after ExitRequested, say) a no-op instead of a double-kill.
    ///
    /// A child that already exited yields an error here; that is the expected case for a fleet the
    /// supervisor already declared `Down`, so it is logged at debug and never treated as a failure.
    pub fn kill_all(&self) {
        let children: Vec<CommandChild> = self
            .children
            .lock()
            .expect("child registry mutex")
            .drain(..)
            .collect();
        if children.is_empty() {
            return;
        }
        log::info!("shutting down — killing {} sidecar process(es)", children.len());
        for child in children {
            let pid = child.pid();
            match child.kill() {
                Ok(()) => log::info!("killed sidecar pid {pid}"),
                Err(e) => log::debug!("sidecar pid {pid} was already gone: {e}"),
            }
        }
    }
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

    /// AC-7 — a port somebody else holds is REFUSED, and the refusal names the port so the splash
    /// can tell the operator which one.
    #[test]
    fn an_occupied_port_is_refused_with_a_reason_naming_it() {
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

    /// Nothing to kill is not a failure — and the empty case has to stay silent, or every clean
    /// shutdown logs a scary line.
    #[test]
    fn killing_an_empty_registry_is_a_no_op() {
        let registry = ChildRegistry::default();
        registry.kill_all();
        registry.kill_all();
    }
}
