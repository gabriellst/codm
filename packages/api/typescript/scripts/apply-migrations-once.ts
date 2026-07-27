#!/usr/bin/env bun
/**
 * apply-migrations-once — run the TS daemon's migration applier ONCE against a data dir, then exit.
 *
 * WHY THIS EXISTS. T28 has to prove the TOCTOU correction of decision (b)(4): two appliers that
 * BOTH see an empty ledger must still apply each file exactly once. Proving that only inside one
 * runtime proves half of it — the two real appliers are written in different languages, against
 * different SQLite bindings (libsql vs modernc), and the interlock they rely on is SQLite's own
 * write lock. So the Go test (`store_test.go`, TestConcurrentBoot) and the TS test
 * (`tests/kernel/concurrent-boot.test.ts`) both spawn THIS script as a real second process.
 *
 * THE BARRIER IS THE WHOLE POINT. A child that boots on its own schedule loses the race by
 * hundreds of milliseconds and then observes a fully-applied ledger — a green test that exercised
 * nothing. So the child does all of its expensive work (bun start-up, module graph, libsql load,
 * opening the file) FIRST, announces itself by creating `--ready`, and only then spin-waits for
 * `--start` to appear. The peer creates `--start` and races from the same instant.
 *
 * Usage:
 *   bun scripts/apply-migrations-once.ts --data-dir <dir> [--ready <file>] [--start <file>]
 *
 * Exits 0 after printing `APPLIER_APPLIED`; exits 1 with the error on stderr.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from '@codedm/contracts/db'
import { migrationsDir } from '@codedm/contracts/db/migrations'
import { LibsqlDriver } from '@codedm/core-typescript'

function flag(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`)
	return index === -1 ? undefined : process.argv[index + 1]
}

const dataDir = flag('data-dir')
if (!dataDir) {
	console.error('apply-migrations-once: --data-dir <dir> is required')
	process.exit(1)
}

// Same file layout the Go store owns (`core/db/sqlite/store.go`, dbFileName) — the two appliers
// must land on the same path or the test proves nothing.
const driver = new LibsqlDriver({ schema, migrationsDir, dbPath: join(dataDir, 'codedm.db') })

const readyFile = flag('ready')
const startFile = flag('start')

// Announce readiness AFTER the driver is constructed: the two long-lived clients are already open
// and pragma'd, so nothing between here and the applier costs more than a few ms.
if (readyFile) writeFileSync(readyFile, String(process.pid))

if (startFile) {
	// Spin, do not sleep — a 10ms timer would blur the start instant this barrier exists to sharpen.
	const deadline = Date.now() + 30_000
	while (!existsSync(startFile)) {
		if (Date.now() > deadline) {
			console.error('apply-migrations-once: timed out waiting for the start barrier')
			process.exit(1)
		}
	}
}

await driver.runMigrations()
console.log('APPLIER_APPLIED')
process.exit(0)
