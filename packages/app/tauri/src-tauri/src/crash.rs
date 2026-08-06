//! Minimal crash capture (SP1 decision 6) — the first-distribution dose of observability.
//!
//! A panic in the shell on a machine that is not the founder's is invisible: no terminal, no
//! debugger, nothing. This hook writes the panic payload + backtrace to
//! `$data_dir/crashes/shell-<timestamp>.log` and keeps the most recent [`KEEP`] files. Remote
//! crash telemetry (Sentry et al.) is SP4 territory — it needs an account/DSN that does not exist
//! yet, and a local file the founder can ask for already satisfies the roadmap's CP-1 at this
//! phase. The hook CHAINS to the previous one, so dev builds keep the default stderr output.

use std::path::{Path, PathBuf};

/// Rotation cap — enough history to diagnose a crash loop, bounded so a crash storm cannot grow
/// the data dir without limit (same posture as the SSE replay buffer's caps).
const KEEP: usize = 20;

pub fn install_panic_hook(data_dir: PathBuf) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        let payload = format!("{info}\n\nbacktrace:\n{backtrace}\n");
        // Best-effort by design: a crash logger that can itself crash the crash path helps nobody.
        let _ = write_crash_log(&data_dir.join("crashes"), &payload);
        previous(info);
    }));
}

/// Write one crash log and rotate. Public and pure-over-its-dir so the behaviour is testable
/// without panicking a real process.
pub fn write_crash_log(dir: &Path, payload: &str) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let path = dir.join(format!("shell-{ts}.log"));
    std::fs::write(&path, payload)?;
    rotate(dir)?;
    Ok(path)
}

/// Keep the newest [`KEEP`] `shell-*.log` files. Name-sorted — the timestamp prefix makes
/// lexicographic order chronological.
fn rotate(dir: &Path) -> std::io::Result<()> {
    let mut logs: Vec<PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("shell-") && n.ends_with(".log"))
                .unwrap_or(false)
        })
        .collect();
    logs.sort();
    while logs.len() > KEEP {
        let oldest = logs.remove(0);
        let _ = std::fs::remove_file(oldest);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("codm-crash-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn writes_payload_and_rotates_past_the_cap() {
        let dir = scratch();
        // One over the cap: the FIRST file written must be the one rotated away.
        let mut paths = Vec::new();
        for i in 0..=KEEP {
            let p = write_crash_log(&dir, &format!("panic {i}")).unwrap();
            paths.push(p);
        }
        let survivors: Vec<_> = std::fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).collect();
        assert_eq!(survivors.len(), KEEP);
        assert!(!paths[0].exists(), "oldest log must be rotated away");
        assert!(paths.last().unwrap().exists(), "newest log must survive");
        let content = std::fs::read_to_string(paths.last().unwrap()).unwrap();
        assert_eq!(content, format!("panic {KEEP}"));
    }
}
