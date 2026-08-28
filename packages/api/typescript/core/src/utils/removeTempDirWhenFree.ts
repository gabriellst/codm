import { rmSync } from 'node:fs'

/**
 * Remove a suite's scratch directory, deferring to process exit when the OS still holds the files.
 *
 * A suite that owns a `LibSqlDriver` over its own `mkdtemp` dir ends by removing that dir, and on
 * Windows the removal fails: `EBUSY: resource busy or locked`, after every assertion in the suite
 * has already passed. POSIX never showed it, because unlinking an open file is legal there.
 *
 * CLOSING THE DRIVER FIRST DOES NOT HELP, and that is measured rather than assumed. Against
 * `@libsql/client` alone, with none of this repo's code involved:
 *
 *     const c = createClient({ url: `file:${join(dir, 'x.db')}` })
 *     await c.execute('CREATE TABLE t (a int)')
 *     c.close()
 *     unlinkSync(join(dir, 'x.db'))   // → EBUSY
 *
 * `x.db`, `x.db-wal` and `x.db-shm` all stay locked until the PROCESS ends — the client does not
 * hand the file back on Windows. So there is nothing a suite can do at teardown to make the removal
 * succeed, and reaching for `LibSqlDriver.close()` is worse than useless here: that method is a
 * documented no-op precisely because the harness SHARES one driver across suites, and making it
 * release for real takes the connections out from under every suite that has not run yet (measured
 * too — six unrelated suites went intermittently red).
 *
 * What is left is the honest thing: try now, and if the OS says the files are busy, do it on the
 * way out, which is the one moment it can work. Cleanup still happens, in the same process, with no
 * platform branch and without a suite reporting red over a directory.
 */
export function removeTempDirWhenFree(dir: string): void {
	try {
		rmSync(dir, { recursive: true, force: true })
	} catch {
		process.on('exit', () => {
			// Best effort by then: the process is going away and the temp dir is the OS's to reap.
			try {
				rmSync(dir, { recursive: true, force: true })
			} catch {
				// Nothing left to do — see the docblock.
			}
		})
	}
}
