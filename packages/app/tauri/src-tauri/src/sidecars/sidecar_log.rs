//! Sidecar output (stdout + stderr) → disk. The persisted twin of `gate.rs`'s in-memory ring buffer.
//!
//! Incident (2026-08-07): an installed app showed the generic boot-error splash ("um ou mais
//! serviços não responderam em 60s"). The actual cause — the daemon sidecar dying instantly on a
//! Zod config error — was invisible: this shell has no log backend (`tauri-plugin-log` is
//! deliberately absent, so every `log::*` macro is a no-op in a packaged build), and the only copy
//! of that stderr lived in `gate::ReadinessGate`'s 50-line ring buffer, readable only while the
//! splash itself was on screen. Diagnosing it took ~40 minutes of code archaeology on a different
//! machine than the one that failed. A log file would have made it one line.
//!
//! Same posture as `crate::crash`: best-effort (a logging bug must never become the reason boot
//! fails or the process panics), written under the same app-data root, rotation bounded so a
//! crash-looping sidecar cannot grow the data dir without limit.
//!
//! One divergence from `crash.rs`, on purpose: a panic is a single self-contained payload written
//! once, but a sidecar's failure is a BUILD-UP of lines across its run (every line it printed, then
//! the exit line) — so this opens ONE file per sidecar per app boot and appends to it for as long as
//! that process lives, rather than writing once. Rotation is scoped to that sidecar's OWN filename
//! prefix — a crash-looping daemon must not evict the gateway's only surviving log, or vice versa.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Rotation cap PER SIDECAR — same order of magnitude as `crash::KEEP`, bounded so a crash-looping
/// sidecar cannot grow the data dir without limit.
const KEEP: usize = 20;

/// One sidecar's log file for one app run. Cheap to `Clone` (just a `PathBuf`) — the stderr reader
/// task and the health-check task each need their own handle to the same file.
#[derive(Clone)]
pub struct SidecarLog {
    path: PathBuf,
}

impl SidecarLog {
    /// Opens (creates) today's log file for `name` under `dir`, rotating that sidecar's own older
    /// files out of the way. Best-effort by design: `None` means logging is unavailable this run
    /// (disk full, permissions, a read-only bundle mount) — boot proceeds exactly as it did before
    /// this existed, with only the in-memory ring buffer surviving.
    pub fn open(dir: &Path, name: &str) -> Option<Self> {
        std::fs::create_dir_all(dir).ok()?;
        let path = dir.join(format!("{name}-{}.log", timestamp()));
        // Touch it now — proves the file is writable before anything relies on `path()`, and gives
        // a quiet run (no stderr, clean exit) a file that still exists.
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ok()?;
        rotate(dir, name);
        Some(Self { path })
    }

    /// Append one line, best-effort. Reopens rather than holding a `File` across awaits — stderr
    /// arrives at process speed, not a hot path, and a held handle would need its own mutex for no
    /// real gain. `create(true)` too, so an externally-deleted file (a user clearing the folder
    /// mid-run) heals itself instead of going silent for the rest of the run.
    pub fn append(&self, line: &str) {
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            let _ = writeln!(file, "{line}");
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

fn timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Keep the newest [`KEEP`] `<name>-*.log` files for THIS sidecar — name-sorted, same trick as
/// `crash::rotate`: the timestamp prefix makes lexicographic order chronological. Scoped by `name`
/// (not the whole dir) so the daemon and the gateway each get their own budget instead of competing
/// for one — a daemon crash-loop must not evict the gateway's only log.
fn rotate(dir: &Path, name: &str) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let prefix = format!("{name}-");
    let mut logs: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(&prefix) && n.ends_with(".log"))
                .unwrap_or(false)
        })
        .collect();
    logs.sort();
    while logs.len() > KEEP {
        let oldest = logs.remove(0);
        let _ = std::fs::remove_file(oldest);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "codm-sidecar-log-test-{label}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn opens_a_file_and_appended_lines_land_in_it() {
        let dir = scratch("append");
        let log = SidecarLog::open(&dir, "codm-daemon").expect("dir is writable");
        assert!(
            log.path().exists(),
            "open() must create the file even before any append"
        );

        log.append("ZodError: CODM_DATA_DIR is required");
        log.append("process exited (code Some(1), signal None)");

        let content = std::fs::read_to_string(log.path()).unwrap();
        assert_eq!(
            content,
            "ZodError: CODM_DATA_DIR is required\nprocess exited (code Some(1), signal None)\n"
        );
    }

    #[test]
    fn rotation_keeps_only_the_newest_keep_files_for_that_name() {
        let dir = scratch("rotate");
        // One over the cap: the FIRST file opened must be the one rotated away.
        let mut paths = Vec::new();
        for _ in 0..=KEEP {
            let log = SidecarLog::open(&dir, "codm-daemon").expect("dir is writable");
            paths.push(log.path().to_owned());
        }
        let survivors: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(survivors.len(), KEEP);
        assert!(!paths[0].exists(), "oldest log must be rotated away");
        assert!(paths.last().unwrap().exists(), "newest log must survive");
    }

    /// A crash-looping daemon must not evict the gateway's only surviving log — each sidecar's
    /// rotation budget is scoped to its OWN filename prefix.
    #[test]
    fn rotation_is_scoped_per_sidecar_and_does_not_cross_evict() {
        let dir = scratch("scoped");
        for _ in 0..KEEP {
            SidecarLog::open(&dir, "codm-daemon").expect("dir is writable");
        }
        let gateway_log = SidecarLog::open(&dir, "codm-gateway").expect("dir is writable");

        let daemon_survivors = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("codm-daemon-"))
            .count();
        assert_eq!(
            daemon_survivors, KEEP,
            "the gateway's own open() must not rotate the daemon's files"
        );
        assert!(gateway_log.path().exists());
    }

    /// Best-effort contract: a directory that cannot be created (a FILE already occupies the path)
    /// must return `None`, never panic — the same posture `crash::write_crash_log` documents.
    #[test]
    fn open_returns_none_instead_of_panicking_when_the_dir_is_unwritable() {
        let blocked = scratch("blocked");
        std::fs::create_dir_all(blocked.parent().unwrap()).unwrap();
        std::fs::write(&blocked, b"i am a file, not a directory").unwrap();

        assert!(SidecarLog::open(&blocked, "codm-daemon").is_none());
    }
}
