//! STARTUP SWEEP — the shell's first act, before a single sidecar is spawned.
//!
//! Every shutdown path this crate controls kills the fleet (`ChildRegistry::kill_all`, reached from
//! `RunEvent::Exit` and from `install_signal_handlers`), and every sidecar kills ITSELF when its
//! parent disappears (`CODM_PARENT_PID` + the two watchdogs). What is left over after all of that
//! is the residue of a run that ended in a way NOTHING could observe: `SIGKILL`, a panic in the
//! event loop, a hard reset. This is where that residue is collected, one boot late.
//!
//! It is also what makes `retry_boot` honest. That command is `app.restart()`, which execs a fresh
//! process WITHOUT going through `RunEvent::Exit` — so before this sweep existed, the retry button
//! reliably reproduced the incident it was there to fix: old children still holding `:3030`, new
//! shell refused by `port_conflict`, splash again.
//!
//! ## The matching rule, and why it is not negotiable
//!
//! A process is ours iff its EXECUTABLE PATH is byte-for-byte one of the paths this shell is about
//! to spawn. Never the port, never the process name.
//!
//! Matching by port would mean killing whoever answers on `:3030`/`:3032`, and the founder's
//! machine has sibling repos running all day — a `vite` on `:5173` from template-fullstack was
//! sitting there during the very incident that prompted this. "It is on my port" is not evidence of
//! ownership; "it IS my binary, at the exact path I am about to exec" is. Matching by NAME would be
//! nearly as bad: a second checkout of this same repo has a `codm-daemon` too, at a different path,
//! and it belongs to a different shell.
//!
//! The consequence is deliberate: a foreign process holding one of our ports SURVIVES this sweep,
//! and `port_conflict` then refuses the boot and names the port on the splash. Refusing loudly is
//! the correct answer to somebody else's process; killing it is not ours to do.
//!
//! ## Platforms
//!
//! macOS reads `ps -Ao pid=,comm=` (BSD `comm` is the full executable path); Linux reads the
//! `/proc/<pid>/exe` symlink; Windows asks `sysinfo` for each process's image path
//! (`QueryFullProcessImageNameW` — the kernel's own answer, like `/proc/<pid>/exe`). Anywhere else
//! the table comes back empty and the sweep is a no-op: a wrong `pid → path` mapping is worse than
//! no sweep.
//!
//! The path we compare against carries the host's executable suffix (`.exe` on Windows, nothing
//! elsewhere) — the same `EXE_SUFFIX` tauri-plugin-shell's `relative_command_path` appends when it
//! execs the sidecar, so "the path we are about to exec" stays one formula on every host.

use std::path::PathBuf;
use std::time::Duration;

use super::lifecycle::{pid_alive, send_sigkill, send_sigterm, terminate_then_force, Supervised, TERM_GRACE};

/// One process the sweep found and removed.
#[derive(Debug, PartialEq, Eq)]
pub struct Reaped {
    pub pid: u32,
    /// The executable path that matched — echoed so the report proves WHICH binary was matched,
    /// never "whatever was on the port".
    pub path: String,
    /// `true` when the process had to be force-killed after the grace window. On Windows there is
    /// no graceful ask (`lifecycle::send_sigterm` is a no-op there), so `false` means the process
    /// exited ON ITS OWN during the grace window — e.g. its own `CODM_PARENT_PID` watchdog fired.
    pub forced: bool,
}

/// A process this shell did NOT spawn and holds no handle to — only a pid. Same escalation as a
/// live child (`terminate_then_force`), because a leftover daemon has exactly the same reason to
/// get its graceful shutdown: it may be holding provider CLIs in process groups of their own, and
/// only its own drain can reach them.
struct ForeignProcess {
    pid: u32,
}

impl Supervised for ForeignProcess {
    fn pid(&self) -> u32 {
        self.pid
    }
    fn terminate(&mut self) {
        send_sigterm(self.pid);
    }
    fn is_alive(&self) -> bool {
        pid_alive(self.pid)
    }
    fn force_kill(self: Box<Self>) {
        send_sigkill(self.pid);
    }
}

/// What the report calls the two escalation steps — `[graceful, forced]`. Named per platform so
/// `shell.log` never claims a SIGKILL on a host that has no signals — nor a "terminate" that was
/// never sent: on Windows the graceful half is a no-op, so a non-forced reap there means the
/// process exited on its own inside the grace window, and the log says exactly that.
#[cfg(unix)]
const HOW: [&str; 2] = ["SIGTERM", "SIGKILL"];
#[cfg(not(unix))]
const HOW: [&str; 2] = ["self-exit within the grace", "TerminateProcess"];

/// PURE — the safety property, isolated so it can be falsified in `cargo test` instead of on a
/// machine with the founder's other repos running.
///
/// Exact path equality, nothing else: no basename match, no prefix match, no `contains`.
pub fn orphans_in(table: &[(u32, String)], ours: &[String]) -> Vec<(u32, String)> {
    table
        .iter()
        .filter(|(_, path)| ours.iter().any(|our| our == path))
        .cloned()
        .collect()
}

/// PURE — `ps -Ao pid=,comm=` into `(pid, executable path)`.
///
/// Splits on the FIRST run of whitespace only: `ps` right-aligns the pid column, and everything
/// after it is one path that may itself contain spaces (`/Applications/My App.app/...`).
pub fn parse_ps_table(output: &str) -> Vec<(u32, String)> {
    output
        .lines()
        .filter_map(|line| {
            let (pid, rest) = line.trim_start().split_once(char::is_whitespace)?;
            let pid: u32 = pid.parse().ok()?;
            let path = rest.trim_start().trim_end_matches(['\r', '\n']);
            (!path.is_empty()).then(|| (pid, path.to_owned()))
        })
        .collect()
}

/// PURE — the file name a sidecar is exec'd as on THIS host: the `externalBin` name plus the
/// platform's executable suffix (`std::env::consts::EXE_SUFFIX`: `.exe` on Windows, empty
/// elsewhere). The same suffix `tauri_plugin_shell::process::relative_command_path` appends, so a
/// Windows leftover is matched as `codm-daemon.exe`, which is what actually ran.
pub fn sidecar_file_name(name: &str) -> String {
    format!("{name}{}", std::env::consts::EXE_SUFFIX)
}

/// The absolute paths this shell will spawn its sidecars from — the same computation
/// `tauri_plugin_shell`'s `relative_command_path` does (`current_exe()`'s directory, stepping out
/// of `deps/` under `cargo test`, plus the host's exe suffix), because "the path we are about to
/// exec" is the entire matching rule and a second, drifting derivation of it would quietly widen
/// or narrow the sweep.
///
/// The canonicalized form is added ALONGSIDE the joined one (never instead of it): the two differ
/// only when the target dir sits behind a symlink, and a previous run may have exec'd either. On
/// Windows `canonicalize` yields the verbatim `\\?\C:\…` form, which no process table reports —
/// the joined form is the one that matches there, and the extra entry is harmless.
fn sidecar_binary_paths(names: &[&str]) -> Vec<String> {
    let Ok(exe) = tauri::utils::platform::current_exe() else {
        return Vec::new();
    };
    let Some(exe_dir) = exe.parent() else {
        return Vec::new();
    };
    let base = if exe_dir.ends_with("deps") {
        exe_dir.parent().unwrap_or(exe_dir)
    } else {
        exe_dir
    };

    let mut paths: Vec<String> = Vec::new();
    let mut push = |path: PathBuf| {
        if let Some(text) = path.to_str() {
            if !paths.iter().any(|existing| existing == text) {
                paths.push(text.to_owned());
            }
        }
    };
    for name in names {
        let path = base.join(sidecar_file_name(name));
        if let Ok(real) = std::fs::canonicalize(&path) {
            push(real);
        }
        push(path);
    }
    paths
}

/// Sweep, then report. Returns what was removed — and logs it, via `log::warn!` so it survives into
/// `shell.log` on a packaged build, not just a dev terminal's stderr.
///
/// Silence when nothing matched is intentional: the sweep runs on EVERY boot and the normal case
/// must not log anything.
pub fn reap_previous_run(names: &[&str]) -> Vec<Reaped> {
    reap_within(names, TERM_GRACE)
}

fn reap_within(names: &[&str], grace: Duration) -> Vec<Reaped> {
    let ours = sidecar_binary_paths(names);
    if ours.is_empty() {
        return Vec::new();
    }
    let found = orphans_in(&process_table(), &ours);
    if found.is_empty() {
        return Vec::new();
    }

    log::warn!(
        "codm-shell: startup sweep — {} sidecar process(es) left by a previous run",
        found.len()
    );
    let handles: Vec<Box<dyn Supervised>> = found
        .iter()
        .map(|(pid, _)| Box::new(ForeignProcess { pid: *pid }) as Box<dyn Supervised>)
        .collect();
    let forced = terminate_then_force(handles, grace);

    found
        .into_iter()
        .map(|(pid, path)| {
            let forced = forced.contains(&pid);
            let how = HOW[usize::from(forced)];
            log::warn!("codm-shell: reaped pid {pid} via {how} — {path}");
            Reaped { pid, path, forced }
        })
        .collect()
}

/// `(pid, absolute executable path)` for every process this user can see.
#[cfg(target_os = "macos")]
fn process_table() -> Vec<(u32, String)> {
    // Absolute path to `ps`: this runs before anything else and must not depend on the PATH a
    // double-clicked .app happens to inherit.
    let Ok(output) = std::process::Command::new("/bin/ps")
        .args(["-Ao", "pid=,comm="])
        .output()
    else {
        return Vec::new();
    };
    parse_ps_table(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "linux")]
fn process_table() -> Vec<(u32, String)> {
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return Vec::new();
    };
    entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let pid: u32 = entry.file_name().to_str()?.parse().ok()?;
            // `/proc/<pid>/exe` is the kernel's own answer to "which binary is this", which is
            // exactly the question; `comm` on Linux is a truncated NAME and would answer a
            // different, unsafe one.
            let exe = std::fs::read_link(entry.path().join("exe")).ok()?;
            Some((pid, exe.to_string_lossy().into_owned()))
        })
        .collect()
}

#[cfg(windows)]
fn process_table() -> Vec<(u32, String)> {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    // One snapshot, exe paths only — no CPU/memory/cmdline sampling; this runs on every boot.
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::Always),
    );
    system
        .processes()
        .iter()
        .filter_map(|(pid, process)| {
            // `exe()` is `QueryFullProcessImageNameW` — the kernel's absolute path for the image,
            // the Windows answer to `/proc/<pid>/exe`. `None` for a process this user cannot open
            // (another session, elevated): such a process cannot be ours, and no path never matches.
            let exe = process.exe()?;
            Some((pid.as_u32(), exe.to_string_lossy().into_owned()))
        })
        .collect()
}

#[cfg(not(any(target_os = "macos", target_os = "linux", windows)))]
fn process_table() -> Vec<(u32, String)> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    const OURS: &str = "/repo/packages/app/tauri/src-tauri/target/debug/codm-daemon";

    fn ours() -> Vec<String> {
        vec![OURS.to_owned()]
    }

    /// The leftover from a previous run of THIS shell is found — that is the sweep's only job.
    #[test]
    fn a_leftover_of_our_own_binary_is_matched() {
        let table = vec![(4242, OURS.to_owned())];
        assert_eq!(orphans_in(&table, &ours()), vec![(4242, OURS.to_owned())]);
    }

    /// FALSEADOR (c), at the logic level: NOTHING that is not our exact path is ever touched. A
    /// sibling repo's identically-named binary, a path that merely starts with ours, and the
    /// founder's vite on one of our ports all have to come back empty — killing any of them is the
    /// failure mode this rule exists to make impossible.
    #[test]
    fn nothing_but_our_exact_path_is_ever_matched() {
        let table = vec![
            (1, "/other-checkout/target/debug/codm-daemon".to_owned()),
            (2, format!("{OURS}-backup")),
            (3, "/repo/packages/app/tauri/src-tauri/target/debug/codm-daemon.old".to_owned()),
            (4, "/opt/homebrew/bin/node".to_owned()),
            (5, "/usr/local/bin/bun".to_owned()),
            (6, "/repo/target/debug/codm-daemon".to_owned()),
        ];
        assert_eq!(
            orphans_in(&table, &ours()),
            Vec::new(),
            "mesmo nome, mesmo prefixo ou mesma porta nao sao a mesma coisa que o mesmo binario"
        );
    }

    /// Two sidecars, one sweep — and the process that only SHARES a directory with them is left
    /// alone (that directory is `target/debug`, which also holds the shell itself).
    #[test]
    fn every_sidecar_path_is_matched_and_neighbours_are_not() {
        let daemon = OURS.to_owned();
        let gateway = "/repo/packages/app/tauri/src-tauri/target/debug/codm-gateway".to_owned();
        let shell = "/repo/packages/app/tauri/src-tauri/target/debug/codm-desktop".to_owned();
        let table = vec![
            (10, daemon.clone()),
            (11, shell),
            (12, gateway.clone()),
        ];
        assert_eq!(
            orphans_in(&table, &[daemon.clone(), gateway.clone()]),
            vec![(10, daemon), (12, gateway)]
        );
    }

    /// The `ps` shape this depends on: right-aligned pid, then a path that may contain spaces.
    #[test]
    fn the_ps_table_is_parsed_pid_first_path_rest() {
        let output = "    1 /sbin/launchd\n 9812 /repo/target/debug/codm-daemon\n  777 /Applications/My App.app/Contents/MacOS/My App\n";
        assert_eq!(
            parse_ps_table(output),
            vec![
                (1, "/sbin/launchd".to_owned()),
                (9812, "/repo/target/debug/codm-daemon".to_owned()),
                (777, "/Applications/My App.app/Contents/MacOS/My App".to_owned()),
            ],
            "um caminho com espaco nao pode ser cortado ao meio"
        );
    }

    /// Garbage in the table must not produce a pid — a mis-parse here is a kill on a random process.
    #[test]
    fn unparseable_lines_yield_no_pid() {
        assert_eq!(parse_ps_table("\n  PID COMM\nnotapid /bin/sh\n 123 \n"), vec![]);
    }

    /// The Windows exec path ends in `.exe` (tauri-plugin-shell's `relative_command_path` appends it);
    /// unix paths do not. One formula, `std::env::consts::EXE_SUFFIX`, no cfg — the same suffix the
    /// plugin uses, so the sweep matches what was actually exec'd on every host.
    #[test]
    fn the_sidecar_file_name_carries_the_host_exe_suffix() {
        let expected = if cfg!(windows) { "codm-daemon.exe" } else { "codm-daemon" };
        assert_eq!(sidecar_file_name("codm-daemon"), expected);
    }

    /// The Windows table answers the same question `/proc/<pid>/exe` does: the pid → ABSOLUTE
    /// image path, as the kernel reports it. Proven on the one process this test is sure about —
    /// itself — against `current_exe()`, the other Win32 source of the same path.
    #[cfg(windows)]
    #[test]
    fn the_windows_table_lists_this_process_by_its_absolute_exe_path() {
        let me = std::env::current_exe().expect("current exe");
        let table = process_table();
        let mine = table.iter().find(|(pid, _)| *pid == std::process::id());
        assert_eq!(
            mine.map(|(_, path)| path.as_str()),
            Some(me.to_string_lossy().as_ref()),
            "a tabela tem de reportar este processo pelo caminho absoluto do executavel"
        );
    }

    /// End to end against REAL processes: a decoy at another path survives the sweep that removes
    /// the one whose path we claim as ours. Same shape as falseador (b) + (c), without the app.
    #[cfg(unix)]
    #[test]
    fn the_sweep_removes_our_path_and_spares_every_other() {
        // This test FORKS — see `lifecycle::FORK_GUARD` for why that must not overlap a listener.
        let _no_listeners = super::super::lifecycle::fork_guard();
        // Two identical processes; only one of them is exec'd from "our" path.
        let mut ours_proc = std::process::Command::new("/bin/sleep").arg("30").spawn().expect("spawn");
        let mut foreign = std::process::Command::new("/bin/sleep").arg("30").spawn().expect("spawn");
        let (our_pid, foreign_pid) = (ours_proc.id(), foreign.id());

        // The table is the seam: `orphans_in` is what decides, and here it decides on a claim that
        // only the first pid runs our binary.
        let table = vec![
            (our_pid, OURS.to_owned()),
            (foreign_pid, "/usr/local/bin/vite".to_owned()),
        ];
        let matched = orphans_in(&table, &ours());
        assert_eq!(matched, vec![(our_pid, OURS.to_owned())]);

        let handles: Vec<Box<dyn Supervised>> = matched
            .iter()
            .map(|(pid, _)| Box::new(ForeignProcess { pid: *pid }) as Box<dyn Supervised>)
            .collect();
        terminate_then_force(handles, Duration::from_millis(500));
        let _ = ours_proc.wait();

        assert!(!pid_alive(our_pid), "o remanescente do nosso caminho tem de morrer");
        assert!(pid_alive(foreign_pid), "o processo de outro caminho tem de sobreviver");

        let _ = foreign.kill();
        let _ = foreign.wait();
    }

    /// A sweep that finds nothing reports nothing — the normal boot.
    #[test]
    fn an_empty_sweep_reports_nothing() {
        // `process_table()` shells out to `/bin/ps`, i.e. this forks — see `lifecycle::FORK_GUARD`.
        let _no_listeners = super::super::lifecycle::fork_guard();
        assert_eq!(reap_within(&["no-such-sidecar-binary"], Duration::from_millis(10)), Vec::new());
    }
}
