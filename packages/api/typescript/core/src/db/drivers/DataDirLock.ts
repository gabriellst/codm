import fs from 'node:fs'

/**
 * Thrown when a second daemon tries to open a data dir that a LIVE process already holds. Named so
 * boot can fail loudly (and callers can `instanceof`-match) instead of the old silent-divergence
 * failure mode: `new PGlite(dataDir)` takes NO OS advisory lock, so two api-ts starts on one
 * CODEDM_DATA_DIR would each open a live instance and split/corrupt state with no error surfaced.
 */
export class DataDirLockedError extends Error {
	readonly code = 'DATA_DIR_LOCKED'
	constructor(
		readonly dataDir: string,
		readonly heldByPid: number,
	) {
		super(
			`CODEDM_DATA_DIR "${dataDir}" is already held by a running daemon (pid ${heldByPid}). ` +
				`Only one api-ts process may own an embedded PGlite data dir at a time — stop the other daemon ` +
				`or point this one at a different CODEDM_DATA_DIR.`,
		)
		this.name = 'DataDirLockedError'
	}
}

/**
 * Lock path for a given data dir. Deliberately a SIBLING of the data dir (`<dataDir>.lock`), never a
 * file INSIDE it: PGlite runs `initdb` on a fresh data dir and initdb aborts ("directory exists but is
 * not empty") if it finds any stray file — a lockfile placed inside would crash the WASM on first boot.
 */
function lockPathFor(dataDir: string): string {
	return `${dataDir}.lock`
}

/** True when `pid` names a process that is currently alive (signal 0 probes without delivering). */
function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch (err) {
		// EPERM ⇒ the process exists but we can't signal it (still alive). ESRCH ⇒ no such process.
		return (err as NodeJS.ErrnoException).code === 'EPERM'
	}
}

/**
 * Single-instance guard for the real, FILE-BACKED PGlite path. Acquires an exclusive PID lockfile in
 * `dataDir` (created O_EXCL so the acquire is atomic against a racing daemon). If the lockfile already
 * exists and its PID is a LIVE process, throws {@link DataDirLockedError}; if the PID is dead (stale
 * lock from a crashed daemon), the lock is reclaimed. Registers a process-exit cleanup that removes the
 * lockfile iff this process owns it. In-memory (test) drivers pass no dataDir and never call this.
 */
export function acquireDataDirLock(dataDir: string): void {
	const lockPath = lockPathFor(dataDir)

	const writeLock = () => fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' })

	try {
		writeLock()
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err

		const holder = Number.parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10)
		if (isProcessAlive(holder)) throw new DataDirLockedError(dataDir, holder)

		// Stale lock (previous daemon crashed without cleanup) — reclaim it. The retry is still O_EXCL,
		// so a live daemon that acquired in the gap wins and we surface its lock instead of stomping it.
		fs.rmSync(lockPath, { force: true })
		try {
			writeLock()
		} catch (retryErr) {
			if ((retryErr as NodeJS.ErrnoException).code === 'EEXIST') {
				const winner = Number.parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10)
				throw new DataDirLockedError(dataDir, winner)
			}
			throw retryErr
		}
	}

	// Release on exit — only if we still own the file (defensive against a reclaim by another daemon).
	const release = () => {
		try {
			const current = Number.parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10)
			if (current === process.pid) fs.rmSync(lockPath, { force: true })
		} catch {
			// best-effort cleanup — a missing/unreadable lockfile on shutdown is not worth crashing over
		}
	}
	process.once('exit', release)
}
