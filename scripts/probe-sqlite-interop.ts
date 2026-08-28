#!/usr/bin/env bun
/**
 * probe-sqlite-interop.ts — the measurement that gives the SQLite-migration plan the right
 * to invoke "a measured contradiction stops the run".
 *
 * The four decisions in .plans/2026-07-26-daemon-sqlite-migration.md rest on claims about how
 * `@libsql/client` behaves and how it interoperates with the Go gateway's `modernc.org/sqlite`
 * over ONE WAL file. Those claims were measured in a throwaway session whose scripts were never
 * committed — so nobody downstream could reproduce them, and the "stop and report" rule was
 * unusable in practice. This script is that measurement, committed, re-runnable on any host.
 *
 * It is the input to the T07C gate, which reads the fields below and decides whether the flip
 * may begin. Run it and redirect (NEVER pipe through `tee` — a pipeline reports tee's exit code):
 *
 *   bun scripts/probe-sqlite-interop.ts > /tmp/probe.out
 *
 * ═══ WHAT IT MEASURES, AND WHY EACH ONE CAN KILL THE PLAN ═══
 *
 *  1  defaults        libsql's own PRAGMA defaults before we touch anything. The decision sets
 *                     foreign_keys OFF and busy_timeout 5000 explicitly; if the defaults were
 *                     already those, the explicit pragmas would be untested dead code.
 *  2  WAL interop     libsql (a SQLite FORK) and modernc (a pure-Go reimplementation) reading
 *                     and writing each other's rows in one file. If this fails, the phase has
 *                     no substrate.
 *  3  concurrency     300 concurrent TS write transactions against 300 concurrent Go ones, over
 *                     THE MECHANISM THIS PLAN SHIPS (manual BEGIN IMMEDIATE on a dedicated
 *                     write client behind a FIFO gate) — not over client.transaction(), which
 *                     is banned. Numbers taken through the banned path measure a regime nobody
 *                     will run.
 *  5  pragma sticky   Do the pragmas SURVIVE 200 transactions? client.transaction() steals the
 *                     native connection and nulls it, so the next call silently opens a fresh
 *                     one with default pragmas. The whole mechanism rests on manual BEGIN not
 *                     doing that. Measured against the banned path for contrast, so the cost of
 *                     the ban is a number in the repo instead of a paragraph.
 *  6  fd leak         client.transaction() never closes the connection it stole. Counted
 *                     directly. This is the number that justifies banning db.transaction()
 *                     across the whole repo.
 *  7  dirty read      The risk the CORRECTION creates: with no rotation, a read issued on the
 *                     WRITE client during an open transaction sees uncommitted rows. Proving
 *                     it is what makes the separate read client load-bearing rather than taste.
 *  8  read-after-cmt  The only property the entire phase depends on and that nothing else here
 *                     measures: that the long-lived READ client SEES a committed row — from
 *                     both writers. A "no" is the exact failure this migration exists to kill
 *                     (a console still showing DISCONNECTED over correct data), and it would be
 *                     silent: no error, no log, no failing test.
 *
 * The probe deliberately imports NOTHING from core/src — it runs straight against
 * `@libsql/client` and the Go binary, so it stays executable during the red window of block 2
 * and on any branch.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const GO_DIR = join(REPO_ROOT, 'packages/api/go')
const GO_PROBE = 'scripts/probe_sqlite_interop.go'
/** The package that DECLARES the driver. This workspace is on bun's isolated layout, so
 *  `@libsql/client` is resolvable neither at runtime nor for types from the repo root —
 *  resolve it from its owner rather than adding a root dependency the product does not have.
 *  The structural types below are the whole surface this probe touches; declaring them here
 *  is what keeps the script self-contained and runnable on any branch, including during the
 *  red window of block 2. */
const CORE_DIR = join(REPO_ROOT, 'packages/api/typescript/core')

interface ResultSet {
	rows: Record<string, unknown>[]
}
interface Transaction {
	execute(stmt: string | { sql: string; args: unknown[] }): Promise<ResultSet>
	commit(): Promise<void>
}
interface Client {
	execute(stmt: string | { sql: string; args: unknown[] }): Promise<ResultSet>
	transaction(mode?: 'write' | 'read' | 'deferred'): Promise<Transaction>
	close(): void
}
type CreateClient = (config: { url: string }) => Client

const LIBSQL_PKG_JSON = Bun.resolveSync('@libsql/client/package.json', CORE_DIR)
const { createClient } = (await import(Bun.resolveSync('@libsql/client', CORE_DIR))) as { createClient: CreateClient }

const out: string[] = []
function emit(key: string, value: string | number): void {
	const line = `${key}=${value}`
	out.push(line)
	console.log(line)
}

/**
 * Pragmas in the EXACT order decision (c)(5) fixes: busy_timeout FIRST (so the two that follow
 * can wait out a lock instead of failing), then journal_mode, then foreign_keys. journal_mode is
 * a property of the FILE; the other two are per CONNECTION, which is the whole reason this
 * script measures whether they survive.
 */
async function applyPragmas(client: Client, busyTimeoutMs = 5000): Promise<void> {
	await client.execute(`PRAGMA busy_timeout = ${busyTimeoutMs}`)
	await client.execute('PRAGMA journal_mode = WAL')
	await client.execute('PRAGMA foreign_keys = OFF')
}

async function pragma(client: Client, name: string): Promise<string> {
	const rs = await client.execute(`PRAGMA ${name}`)
	const row = rs.rows[0] as Record<string, unknown> | undefined
	if (!row) return ''
	return String(Object.values(row)[0])
}

/** Manual BEGIN IMMEDIATE — the ONLY write path this plan allows. Never client.transaction(). */
async function manualTx(client: Client, body: () => Promise<void>): Promise<void> {
	await client.execute('BEGIN IMMEDIATE')
	try {
		await body()
		await client.execute('COMMIT')
	} catch (e) {
		try {
			await client.execute('ROLLBACK')
		} catch {
			/* the transaction is already gone */
		}
		throw e
	}
}

/** FIFO async mutex — one open write transaction per process, in deterministic order. */
class TxGate {
	#tail: Promise<unknown> = Promise.resolve()
	run<T>(fn: () => Promise<T>): Promise<T> {
		const result = this.#tail.then(fn, fn)
		this.#tail = result.then(
			() => {},
			() => {},
		)
		return result
	}
}

/** Open file descriptors held by this process against `file` (macOS/linux, via lsof). */
function fdCount(file: string): number {
	const res = spawnSync('lsof', ['-p', String(process.pid)], { encoding: 'utf8' })
	if (res.status !== 0 && !res.stdout) return -1
	return res.stdout.split('\n').filter(l => l.includes(file)).length
}

function runGo(args: string[]): { code: number; stdout: string; stderr: string } {
	const res = spawnSync('go', ['run', GO_PROBE, ...args], { cwd: GO_DIR, encoding: 'utf8' })
	return { code: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

function goField(stdout: string, key: string): string {
	const m = stdout.match(new RegExp(`^${key}=(.*)$`, 'm'))
	return m ? m[1].trim() : ''
}

function isBusy(e: unknown): boolean {
	const s = String(e instanceof Error ? e.message : e).toUpperCase()
	return s.includes('SQLITE_BUSY') || s.includes('DATABASE IS LOCKED')
}

const tempDirs: string[] = []
function freshDb(tag: string): string {
	const dir = mkdtempSync(join(tmpdir(), `codm-probe-${tag}-`))
	tempDirs.push(dir)
	return join(dir, 'probe.db')
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 — libsql's own defaults, before any pragma of ours.
// ─────────────────────────────────────────────────────────────────────────────
async function probeDefaults(): Promise<void> {
	const client = createClient({ url: `file:${freshDb('defaults')}` })
	// A statement is needed before the pragmas mean anything — the connection is lazy.
	await client.execute('CREATE TABLE warmup (x INTEGER)')
	emit('LIBSQL_DEFAULT_FOREIGN_KEYS', await pragma(client, 'foreign_keys'))
	emit('LIBSQL_DEFAULT_BUSY_TIMEOUT', await pragma(client, 'busy_timeout'))
	client.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 — WAL interop, both directions, two different SQLite implementations.
// ─────────────────────────────────────────────────────────────────────────────
async function probeInterop(): Promise<void> {
	const db = freshDb('interop')
	const client = createClient({ url: `file:${db}` })
	await applyPragmas(client)

	await client.execute('CREATE TABLE probe_interop (writer TEXT NOT NULL, note TEXT NOT NULL)')
	await manualTx(client, async () => {
		await client.execute({ sql: `INSERT INTO probe_interop (writer, note) VALUES ('ts', ?)`, args: ['written-by-libsql'] })
	})
	emit('JOURNAL_MODE', await pragma(client, 'journal_mode'))

	const go = runGo(['interop', db])
	if (go.code !== 0) {
		emit('WAL_INTEROP', 'fail')
		emit('WAL_INTEROP_GO_STDERR', go.stderr.trim().split('\n').slice(-1)[0] ?? '')
		client.close()
		return
	}
	emit('GO_JOURNAL_MODE', goField(go.stdout, 'GO_JOURNAL_MODE'))

	// …and back: the TS client (already open, never reopened) must see the Go row.
	const rs = await client.execute(`SELECT note FROM probe_interop WHERE writer = 'go'`)
	const goReadTs = goField(go.stdout, 'GO_READ_TS') === 'ok'
	const tsReadGo = rs.rows.length === 1
	emit('WAL_INTEROP', goReadTs && tsReadGo ? 'ok' : 'fail')
	emit('WAL_INTEROP_GO_READ_TS', goReadTs ? 'yes' : 'no')
	emit('WAL_INTEROP_TS_READ_GO', tsReadGo ? 'yes' : 'no')
	client.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 — cross-process concurrency, over THE SHIPPED MECHANISM.
// ─────────────────────────────────────────────────────────────────────────────
async function probeConcurrency(n = 300): Promise<void> {
	const db = freshDb('concurrent')
	const writeClient = createClient({ url: `file:${db}` })
	const readClient = createClient({ url: `file:${db}` })
	await applyPragmas(writeClient)
	await applyPragmas(readClient)

	await writeClient.execute('CREATE TABLE probe_ts (i INTEGER NOT NULL)')
	await writeClient.execute('CREATE TABLE probe_go (i INTEGER NOT NULL)')

	// The Go half runs CONCURRENTLY, not before or after — contention is the measurement.
	const goProc = Bun.spawn(['go', 'run', GO_PROBE, 'concurrent', db, String(n)], {
		cwd: GO_DIR,
		stdout: 'pipe',
		stderr: 'pipe',
	})

	const gate = new TxGate()
	let tsOk = 0
	let tsErr = 0
	let tsBusy = 0
	await Promise.all(
		Array.from({ length: n }, (_, i) =>
			gate
				.run(() =>
					manualTx(writeClient, async () => {
						await writeClient.execute({ sql: 'INSERT INTO probe_ts (i) VALUES (?)', args: [i] })
					}),
				)
				.then(
					() => {
						tsOk++
					},
					(e: unknown) => {
						tsErr++
						if (isBusy(e)) tsBusy++
					},
				),
		),
	)

	const goStdout = await new Response(goProc.stdout).text()
	const goStderr = await new Response(goProc.stderr).text()
	const goCode = await goProc.exited
	if (goCode !== 0) emit('GO_CONCURRENT_STDERR', goStderr.trim().split('\n').slice(-1)[0] ?? '')

	const goBusy = Number(goField(goStdout, 'GO_SQLITE_BUSY') || 0)
	emit('TS_OK', tsOk)
	emit('TS_ERR', tsErr)
	emit('GO_OK', goField(goStdout, 'GO_OK') || 0)
	emit('GO_ERR', goField(goStdout, 'GO_ERR') || 0)
	emit('SQLITE_BUSY', tsBusy + goBusy)

	// Counted through the READ client — the handle the daemon actually serves HTTP from.
	const tsRows = await readClient.execute('SELECT COUNT(*) AS c FROM probe_ts')
	const goRows = await readClient.execute('SELECT COUNT(*) AS c FROM probe_go')
	emit('FINAL_TS_ROWS', Number((tsRows.rows[0] as Record<string, unknown>).c))
	emit('FINAL_GO_ROWS', Number((goRows.rows[0] as Record<string, unknown>).c))

	writeClient.close()
	readClient.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 — do pragmas survive? Manual BEGIN vs the banned client.transaction().
// ─────────────────────────────────────────────────────────────────────────────
async function probePragmaStickiness(n = 200): Promise<void> {
	{
		const db = freshDb('sticky')
		const client = createClient({ url: `file:${db}` })
		await applyPragmas(client)
		await client.execute('CREATE TABLE t (i INTEGER)')
		for (let i = 0; i < n; i++) {
			await manualTx(client, async () => {
				await client.execute({ sql: 'INSERT INTO t (i) VALUES (?)', args: [i] })
			})
		}
		emit('PRAGMA_STICKY_BUSY_TIMEOUT', await pragma(client, 'busy_timeout'))
		emit('PRAGMA_STICKY_FOREIGN_KEYS', await pragma(client, 'foreign_keys'))
		emit('PRAGMA_STICKY_JOURNAL_MODE', await pragma(client, 'journal_mode'))
		client.close()
	}
	{
		// The BANNED path, for contrast: same sequence through client.transaction().
		const db = freshDb('sticky-txapi')
		const client = createClient({ url: `file:${db}` })
		await applyPragmas(client)
		await client.execute('CREATE TABLE t (i INTEGER)')
		for (let i = 0; i < n; i++) {
			const tx = await client.transaction('write')
			await tx.execute({ sql: 'INSERT INTO t (i) VALUES (?)', args: [i] })
			await tx.commit()
		}
		emit('PRAGMA_AFTER_TX_API_BUSY_TIMEOUT', await pragma(client, 'busy_timeout'))
		emit('PRAGMA_AFTER_TX_API_FOREIGN_KEYS', await pragma(client, 'foreign_keys'))
		client.close()
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 — file-descriptor leak: the number that bans db.transaction() repo-wide.
// ─────────────────────────────────────────────────────────────────────────────
async function probeFdLeak(n = 500): Promise<void> {
	const dbApi = freshDb('fd-txapi')
	const apiClient = createClient({ url: `file:${dbApi}` })
	await applyPragmas(apiClient)
	await apiClient.execute('CREATE TABLE t (i INTEGER)')
	emit('FD_BASELINE', fdCount(dbApi))

	for (let i = 0; i < n; i++) {
		const tx = await apiClient.transaction('write')
		await tx.execute({ sql: 'INSERT INTO t (i) VALUES (?)', args: [i] })
		await tx.commit()
	}
	emit('FD_AFTER_500_TX_API', fdCount(dbApi))
	apiClient.close()

	// Same count, same file shape, manual BEGIN: expected to land back on the baseline.
	const dbManual = freshDb('fd-manual')
	const manualClient = createClient({ url: `file:${dbManual}` })
	await applyPragmas(manualClient)
	await manualClient.execute('CREATE TABLE t (i INTEGER)')
	const manualBaseline = fdCount(dbManual)
	for (let i = 0; i < n; i++) {
		await manualTx(manualClient, async () => {
			await manualClient.execute({ sql: 'INSERT INTO t (i) VALUES (?)', args: [i] })
		})
	}
	const manualAfter = fdCount(dbManual)
	// Reported relative to ITS OWN baseline, then re-expressed on the reported FD_BASELINE so
	// the gate can compare the two fields directly without knowing about two files.
	emit('FD_AFTER_500_MANUAL', manualAfter - manualBaseline + Number(out.find(l => l.startsWith('FD_BASELINE='))!.split('=')[1]))
	emit('FD_MANUAL_OWN_BASELINE', manualBaseline)
	emit('FD_MANUAL_OWN_AFTER', manualAfter)
	manualClient.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// 7 — dirty read: the risk the correction CREATES. Expected no / yes.
// ─────────────────────────────────────────────────────────────────────────────
async function probeDirtyRead(): Promise<void> {
	const db = freshDb('dirty')
	const writeClient = createClient({ url: `file:${db}` })
	const readClient = createClient({ url: `file:${db}` })
	await applyPragmas(writeClient)
	await applyPragmas(readClient)
	await writeClient.execute('CREATE TABLE probe_dirty (sentinel TEXT NOT NULL)')
	// Force the read client to have a live connection BEFORE the write transaction opens.
	await readClient.execute('SELECT COUNT(*) FROM probe_dirty')

	await writeClient.execute('BEGIN IMMEDIATE')
	await writeClient.execute({ sql: 'INSERT INTO probe_dirty (sentinel) VALUES (?)', args: ['uncommitted'] })

	let onRead = 'no'
	try {
		const rs = await readClient.execute(`SELECT sentinel FROM probe_dirty WHERE sentinel = 'uncommitted'`)
		onRead = rs.rows.length > 0 ? 'yes' : 'no'
	} catch (e) {
		// A lock error is NOT a dirty read; record it as "no" and keep the reason.
		emit('DIRTY_READ_ON_READ_CLIENT_ERROR', isBusy(e) ? 'SQLITE_BUSY' : String(e).slice(0, 80))
	}
	const rsWrite = await writeClient.execute(`SELECT sentinel FROM probe_dirty WHERE sentinel = 'uncommitted'`)
	const onWrite = rsWrite.rows.length > 0 ? 'yes' : 'no'

	await writeClient.execute('ROLLBACK')
	emit('DIRTY_READ_ON_READ_CLIENT', onRead)
	emit('DIRTY_READ_ON_WRITE_CLIENT', onWrite)
	writeClient.close()
	readClient.close()
}

// ─────────────────────────────────────────────────────────────────────────────
// 8 — visibility AFTER commit on the long-lived READ client. Both writers.
// ─────────────────────────────────────────────────────────────────────────────
async function probeReadAfterCommit(): Promise<void> {
	const db = freshDb('visibility')
	const writeClient = createClient({ url: `file:${db}` })
	const readClient = createClient({ url: `file:${db}` })
	await applyPragmas(writeClient)
	await applyPragmas(readClient)
	await writeClient.execute('CREATE TABLE probe_visibility (writer TEXT NOT NULL, sentinel TEXT NOT NULL)')

	// The read client is opened and USED before either commit — exactly how the daemon runs it
	// (long-lived, never reopened per request).
	await readClient.execute('SELECT COUNT(*) FROM probe_visibility')

	// (a) same process: write client commits, read client reads. No sleep, no reopen.
	const sameSentinel = `ts-${Date.now()}`
	await manualTx(writeClient, async () => {
		await writeClient.execute({
			sql: `INSERT INTO probe_visibility (writer, sentinel) VALUES ('ts', ?)`,
			args: [sameSentinel],
		})
	})
	const sameRs = await readClient.execute({
		sql: 'SELECT sentinel FROM probe_visibility WHERE sentinel = ?',
		args: [sameSentinel],
	})
	emit('READ_AFTER_COMMIT_SAME_PROCESS', sameRs.rows.length > 0 ? 'yes' : 'no')

	// (b) cross-process: the GO gateway commits; the SAME already-open read client reads.
	const crossSentinel = `go-${Date.now()}`
	const go = runGo(['commit', db, crossSentinel])
	if (go.code !== 0) {
		emit('READ_AFTER_COMMIT_CROSS_PROCESS', 'no')
		emit('READ_AFTER_COMMIT_CROSS_PROCESS_LAG_MS', 0)
		emit('READ_AFTER_COMMIT_GO_STDERR', go.stderr.trim().split('\n').slice(-1)[0] ?? '')
		writeClient.close()
		readClient.close()
		return
	}

	const started = Date.now()
	let lagMs = 0
	let seen = false
	// Poll so the LAG is measured rather than assumed. The expectation is a hit on the very
	// first attempt (lag 0); anything else is itself the finding.
	for (let attempt = 0; attempt < 50; attempt++) {
		const rs = await readClient.execute({
			sql: 'SELECT sentinel FROM probe_visibility WHERE sentinel = ?',
			args: [crossSentinel],
		})
		if (rs.rows.length > 0) {
			seen = true
			lagMs = attempt === 0 ? 0 : Date.now() - started
			break
		}
		await new Promise(r => setTimeout(r, 20))
	}
	emit('READ_AFTER_COMMIT_CROSS_PROCESS', seen ? 'yes' : 'no')
	emit('READ_AFTER_COMMIT_CROSS_PROCESS_LAG_MS', lagMs)

	writeClient.close()
	readClient.close()
}

async function main(): Promise<void> {
	emit('HOST', `${process.platform}-${process.arch}`)
	emit('LIBSQL_CLIENT_VERSION', JSON.parse(await Bun.file(LIBSQL_PKG_JSON).text()).version)

	await probeDefaults()
	await probeInterop()
	await probeConcurrency(300)
	await probePragmaStickiness(200)
	await probeFdLeak(500)
	await probeDirtyRead()
	await probeReadAfterCommit()
}

try {
	await main()
} finally {
	for (const dir of tempDirs) {
		try {
			rmSync(dir, { recursive: true, force: true })
		} catch {
			/* best effort */
		}
	}
}
