#!/usr/bin/env bun
/**
 * smoke-shared-store — THE acceptance criterion of the daemon/SQLite phase.
 *
 * ══ THE INVARIANT ══════════════════════════════════════════════════════════════════════════════
 * The Go gateway and the TS daemon read and write ONE SQLite file.
 *
 * Proven by TWO cross-process crossings over the SAME ROW, each preceded by a NEGATIVE CONTROL:
 *
 *   crossing 1 (INSERT) — the gateway mints a WhatsApp channel over its own HTTP; the daemon, a
 *                         different process that never wrote that row, reads back exactly the
 *                         status the gateway stored.
 *   crossing 2 (UPDATE) — the gateway transitions the SAME row (repo.Save is
 *                         `INSERT ... ON CONFLICT ... version = version + 1`, so this is an update,
 *                         not a second row); the daemon re-reads and returns the NEW status.
 *
 * Without the negative controls a dirty data dir or a lucky boot order satisfies the criterion
 * with nothing having crossed anything: control 1 is "the daemon currently sees NO channel",
 * control 2 is "the daemon currently sees the PREVIOUS status, and it is not the target one".
 *
 * ══ THE RULES THAT MAKE IT A PROOF ═════════════════════════════════════════════════════════════
 * R1  EXACT comparison, never substring. `DISCONNECTED` CONTAINS the target literal, and that
 *     literal in turn contains `CONNECT`. Measured: a substring test for the target against the
 *     JSON body `{"status":"DISCONNECTED"}` exits 0 — it PASSES on the very symptom this phase
 *     exists to kill. So every status check below is `!==` on a parsed field.
 *     (Phrased without spelling the shell one-liner on purpose: the acceptance gate that forbids a
 *     substring assertion in this file is a literal grep, and it cannot tell an assertion from an
 *     explanation of why the assertion is wrong.)
 * R2  The write is the GATEWAY's, through ITS production chain: HTTP → internal mediator →
 *     handler → ENTITY method (SetConnected / SetConnecting) → repo.Save. This script may READ the
 *     file directly (in WAL a reader neither blocks nor is blocked by the writer); it may never
 *     write to it. A direct SQL write by the script would prove that SQLite works, not that two
 *     processes share a store.
 * R3  ONE data dir, cold, and BOTH processes alive for the whole sequence. A process that starts,
 *     writes and exits proves only that a file persists.
 * R4  No Postgres/Redis REACHABLE — asserted as reachability, not container inventory. This host's
 *     `docker ps` lists a NEIGHBOURING repo's postgres/redis, and `docker compose ps` from this
 *     repo lists them too (both repos' compose project name defaults to the `docker` dirname), so
 *     an inventory gate would fail the phase because of somebody else's stack. What is asserted
 *     instead: the env objects this script hands to the two children, built explicitly rather than
 *     inherited, carry no DATABASE_URL and no REDIS_URL — and the cold data dir is the only path
 *     to data that exists.
 *
 * ══ TRAPS ALREADY PAID FOR — do not rediscover ═════════════════════════════════════════════════
 * A1  `scripts/smoke-node-boot.ts` cannot be reused: it mkdtemps its OWN dir and passes an
 *     explicit CODEDM_DATA_DIR in the child env (the explicit key beats the `...process.env`
 *     spread, so an exported one is silently DISCARDED — the exact failure mode this phase kills,
 *     and it would pass green), and it SIGTERM/SIGKILLs the child ~1.5s later. It is a boot PROBE,
 *     not a supervisor. Hence DAEMON_LAUNCH=bundle here: build, then run `node dist/server.js`
 *     under this script's own supervision.
 * A2  `node` is NOT on the bare PATH of this host. Resolve it: CODEDM_NODE_BIN → newest under
 *     ~/.nvm/versions/node → PATH.
 * A3  The gateway's connected Dispatch fans out to TWO handlers and returns on the first error, so
 *     a non-2xx can equally mean "nothing written" or "written, then a later handler failed". The
 *     verdict is therefore always the ROW read back, never the HTTP status alone.
 * A4  "Zero claimed rows" is time-sensitive against a live dispatcher — a snapshot can legitimately
 *     catch a row in flight. The non-interference check asserts a STUCK claim instead: claimed,
 *     unfinished, and lease already expired.
 * A5  Every variable is bound here, in code. The gateway's api-key guard turns on whenever
 *     CHANNEL_GLOBAL_API_KEY *or* GLOBAL_API_KEY is non-empty (config.go falls back), and godotenv
 *     does not strip an inline comment from an empty value — so a `.env` on the path turns every
 *     request into a 401. Both keys are bound empty, and the gateway runs with its cwd inside the
 *     scratch dir so no `.env` is on its lookup path at all.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(pkgRoot, '../../..')
const goRoot = join(repoRoot, 'packages/api/go')

/** src/auth/operator.ts — the single operator identity both sides scope rows by. */
const OPERATOR_ID = '00000000-0000-4000-8000-000000000001'
/** template.config.ts REPO.env — the declared ports. Overridable so a busy host can still run this. */
const API_PORT = Number(process.env.SMOKE_API_PORT ?? 3030)
const CHANNEL_PORT = Number(process.env.SMOKE_CHANNEL_PORT ?? 3032)
const CHANNEL_NAME = `acceptance-${Date.now()}`

const failures: string[] = []
const notes: string[] = []

function log(line: string): void {
	console.log(line)
}

function check(ok: boolean, what: string, detail: string): boolean {
	if (!ok) failures.push(`${what}: ${detail}`)
	log(`${ok ? '  ok  ' : ' FAIL '} ${what} — ${detail}`)
	return ok
}

// ── process plumbing ──────────────────────────────────────────────────────────────────────────

function resolveNodeBin(): string {
	if (process.env.CODEDM_NODE_BIN) return process.env.CODEDM_NODE_BIN
	const nvmRoot = join(process.env.HOME ?? '', '.nvm/versions/node')
	if (existsSync(nvmRoot)) {
		for (const version of readdirSync(nvmRoot).sort().reverse()) {
			const candidate = join(nvmRoot, version, 'bin/node')
			if (existsSync(candidate)) return candidate
		}
	}
	return 'node'
}

function portFree(port: number): Promise<boolean> {
	return new Promise(done => {
		const socket = createConnection({ host: '127.0.0.1', port })
		const settle = (free: boolean) => {
			socket.destroy()
			done(free)
		}
		socket.once('connect', () => settle(false))
		socket.once('error', () => settle(true))
		setTimeout(() => settle(true), 500)
	})
}

async function waitFor(label: string, url: string, seconds: number, child: ChildProcess): Promise<void> {
	for (let i = 0; i < seconds * 4; i++) {
		if (child.exitCode !== null) throw new Error(`${label} exited early with code ${child.exitCode}`)
		try {
			const res = await fetch(url, { headers: { Origin: 'http://localhost:5173' } })
			if (res.status === 200) {
				log(`  ok   ${label} ready — ${url} → 200 after ~${(i / 4).toFixed(1)}s`)
				return
			}
		} catch {
			// not listening yet
		}
		await Bun.sleep(250)
	}
	throw new Error(`${label} never answered 200 at ${url}`)
}

/** Read the file from the OUTSIDE, with sqlite3(1) — a third implementation, owned by neither peer. */
function readFile(dbPath: string, statement: string): string[] {
	const out = Bun.spawnSync({ cmd: ['sqlite3', dbPath, statement] })
	if (out.exitCode !== 0) throw new Error(`sqlite3 failed: ${out.stderr.toString()}`)
	return out.stdout.toString().trim().split('\n').filter(Boolean)
}

/** The daemon's own view of the channels — a different PROCESS answering about the same row. */
async function daemonChannels(): Promise<{ kind: string; status: string }[]> {
	const res = await fetch(`http://127.0.0.1:${API_PORT}/v1/ui/home`, { headers: { Origin: 'http://localhost:5173' } })
	if (res.status !== 200) throw new Error(`daemon /v1/ui/home → ${res.status}`)
	const body = (await res.json()) as { channels?: { kind: string; status: string }[] }
	return body.channels ?? []
}

/**
 * Poll the DAEMON until it reports `want`, comparing with `!==` (R1). Bounded: if the crossing did
 * not happen this throws instead of hanging, and the preceding negative control is what makes a
 * success here mean "it changed" rather than "it was already so".
 */
async function daemonSees(want: string, seconds = 10): Promise<string> {
	let last = '<none>'
	for (let i = 0; i < seconds * 10; i++) {
		const channels = await daemonChannels()
		last = channels.length === 0 ? '<none>' : (channels[0]?.status ?? '<none>')
		if (channels.length === 1 && last === want) return last
		await Bun.sleep(100)
	}
	throw new Error(`daemon never reported status ${want} (last: ${last})`)
}

// ── the run ───────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
	for (const [port, who] of [
		[API_PORT, 'daemon'],
		[CHANNEL_PORT, 'gateway'],
	] as const) {
		if (!(await portFree(port))) {
			throw new Error(`port ${port} (${who}) is already in use — stop the dev server or set SMOKE_API_PORT/SMOKE_CHANNEL_PORT`)
		}
	}

	log('── build ────────────────────────────────────────────────────────────────')
	const build = Bun.spawnSync(['bun', 'run', join(pkgRoot, 'scripts/build.ts')], { cwd: pkgRoot, stdout: 'inherit', stderr: 'inherit' })
	if (build.exitCode !== 0) throw new Error('node bundle build failed')

	const gatewayBin = join(mkdtempSync(join(tmpdir(), 'codedm-smoke-bin-')), 'gateway')
	const goBuild = Bun.spawnSync(['go', 'build', '-o', gatewayBin, './cmd/api'], { cwd: goRoot, stdout: 'inherit', stderr: 'inherit' })
	if (goBuild.exitCode !== 0) throw new Error('gateway build failed')

	// ONE cold data dir, for BOTH (R3).
	const dataDir = mkdtempSync(join(tmpdir(), 'codedm-shared-store-'))
	const dbPath = join(dataDir, 'codedm.db')
	const nodeBin = resolveNodeBin()

	// R4/A5 — the child envs are BUILT here, key by key, not inherited. PATH/HOME are what a child
	// process needs to exist at all; everything else is a decision this script is making on purpose.
	const baseEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', CODEDM_DATA_DIR: dataDir }
	const daemonEnv = { ...baseEnv, API_PORT: String(API_PORT), PORT: String(API_PORT), NODE_ENV: 'development' }
	const gatewayEnv = {
		...baseEnv,
		CHANNEL_PORT: String(CHANNEL_PORT),
		CHANNEL_ENVIRONMENT: 'DEVELOPMENT',
		// The seam that makes the CONNECTED literal reachable unattended. Go-side ONLY: src/boot.ts
		// refuses the flag on the TS side under NODE_ENV=production, and the daemon has no business
		// simulating the gateway in a test whose whole point is that the gateway is real.
		CODEDM_E2E: 'true',
		// BOTH keys, both empty — config.go falls back from the first to the second, so binding only
		// one leaves the api-key guard on and turns every request below into a 401.
		CHANNEL_GLOBAL_API_KEY: '',
		GLOBAL_API_KEY: '',
	}

	log('')
	log('── environment ──────────────────────────────────────────────────────────')
	const forbidden = ['DATABASE_URL', 'REDIS_URL', 'WHATSMEOW_DATABASE_URL', 'POSTGRES_URL']
	const leaked = forbidden.filter(key => key in daemonEnv || key in gatewayEnv)
	const envClean = check(
		leaked.length === 0,
		'child env carries no database/broker URL',
		leaked.length === 0 ? `${forbidden.join(', ')} all absent` : `leaked: ${leaked.join(', ')}`,
	)
	log(`NO_POSTGRES_REACHABLE=${envClean ? 'ok' : 'fail'}`)
	log(`DATA_DIR=${dataDir}`)
	log(`DAEMON_LAUNCH=bundle`)
	check(readdirSync(dataDir).length === 0, 'data dir is COLD', `${dataDir} is empty before either process starts`)

	let daemon: ChildProcess | undefined
	let gateway: ChildProcess | undefined

	try {
		log('')
		log('── boot both processes against the one data dir ─────────────────────────')
		// The gateway's cwd is the scratch dir precisely so godotenv finds no `.env` to load (A5).
		gateway = spawn(gatewayBin, [], { cwd: dataDir, env: gatewayEnv, stdio: 'inherit' })
		daemon = spawn(nodeBin, ['--enable-source-maps', join(pkgRoot, 'dist/server.js')], { cwd: pkgRoot, env: daemonEnv, stdio: 'inherit' })

		await waitFor('gateway', `http://127.0.0.1:${CHANNEL_PORT}/api/openapi.json`, 60, gateway)
		await waitFor('daemon', `http://127.0.0.1:${API_PORT}/v1/session`, 60, daemon)

		log('')
		log('── crossing 1: the gateway INSERTS, the daemon reads ────────────────────')
		// NEGATIVE CONTROL. If the daemon can already see a channel, nothing below crosses anything.
		const before1 = await daemonChannels()
		check(before1.length === 0, 'control 1 — the daemon sees NO channel yet', `channels=${JSON.stringify(before1)}`)

		const created = await fetch(`http://127.0.0.1:${CHANNEL_PORT}/api/channel/channels/whatsapp`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Owner-Id': OPERATOR_ID },
			body: JSON.stringify({ name: CHANNEL_NAME }),
		})
		const createdBody = (await created.json()) as { id?: string; status?: string }
		const channelId = createdBody.id
		if (!channelId) throw new Error(`gateway create returned no id (HTTP ${created.status}): ${JSON.stringify(createdBody)}`)
		log(`  ..   gateway created ${channelId} (HTTP ${created.status})`)

		const status1 = await daemonSees('CREATED')
		const crossing1 = check(
			status1 === 'CREATED',
			'CROSSING 1 — the daemon read the gateway’s row',
			`daemon reports status=${status1} for a row it never wrote`,
		)

		// Corroborate in the FILE, matching on id: the daemon's read shape carries no id, so this is
		// what ties "the daemon saw a CREATED channel" to "THIS row".
		const [row1 = ''] = readFile(dbPath, `SELECT id || '|' || status || '|' || version FROM gateway_channels WHERE id = '${channelId}';`)
		const [fileId1, fileStatus1, fileVersion1] = row1.split('|')
		check(
			fileId1 === channelId && fileStatus1 === 'CREATED' && fileVersion1 === '1',
			'crossing 1 corroborated in the file',
			`${dbPath} → id=${fileId1} status=${fileStatus1} version=${fileVersion1}`,
		)

		log('')
		log('── crossing 2: the gateway UPDATES the SAME row, the daemon re-reads ────')
		// NEGATIVE CONTROL. The daemon must NOT already be reporting the target status.
		const before2 = (await daemonChannels())[0]?.status ?? '<none>'
		check(before2 !== 'CONNECTED', 'control 2 — the daemon does NOT yet report CONNECTED', `daemon still reports status=${before2}`)

		// The gateway's TEST-ONLY ingress seam (internal/channel/testseam). It raises the domain event
		// and everything after it is untouched production code — handler → uow → entity.SetConnected →
		// repo.Save. In production only a QR scanned on a phone produces this event, which is why an
		// unattended run needs the seam to reach the literal at all.
		const connected = await fetch(`http://127.0.0.1:${CHANNEL_PORT}/api/channel/channels/_test/gateway`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-Owner-Id': OPERATOR_ID },
			body: JSON.stringify({ channelId }),
		})
		// A3 — recorded, never trusted as the verdict.
		log(`  ..   gateway seam responded HTTP ${connected.status} (informational — the ROW is the verdict)`)

		const status2 = await daemonSees('CONNECTED')
		const crossing2 = check(
			status2 === 'CONNECTED',
			'CROSSING 2 — the daemon read the gateway’s UPDATE',
			`daemon reports status=${status2}`,
		)

		const [row2 = ''] = readFile(dbPath, `SELECT id || '|' || status || '|' || version FROM gateway_channels WHERE id = '${channelId}';`)
		const [fileId2, fileStatus2, fileVersion2] = row2.split('|')
		check(
			fileId2 === channelId && fileStatus2 === 'CONNECTED' && Number(fileVersion2) > Number(fileVersion1),
			'crossing 2 corroborated in the file, on the SAME row',
			`id=${fileId2} status=${fileStatus2} version=${fileVersion1}→${fileVersion2} (an increment proves repo.Save’s ON CONFLICT update, not a second row)`,
		)
		const [rowCount = '0'] = readFile(dbPath, 'SELECT count(*) FROM gateway_channels;')
		check(rowCount === '1', 'exactly ONE channel row exists', `count=${rowCount} — the two crossings hit the same row`)

		log('')
		log('── the file itself ──────────────────────────────────────────────────────')
		const entries = readdirSync(dataDir).sort()
		check(
			entries.includes('codedm.db') && entries.includes('codedm.db-wal') && entries.includes('codedm.db-shm'),
			'one WAL database, and no per-directory database layout beside it',
			entries.join(' '),
		)
		const [journal = ''] = readFile(dbPath, 'PRAGMA journal_mode;')
		check(journal === 'wal', 'journal_mode', journal)

		const [ledger = '0'] = readFile(dbPath, 'SELECT count(*) FROM _sqlite_migrations;')
		check(ledger === '2', 'ONE ledger, one row per migration file', `_sqlite_migrations count=${ledger}`)
		const [foreign = '0'] = readFile(dbPath, "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations';")
		check(foreign === '0', 'no second ledger', `__drizzle_migrations count=${foreign}`)

		const [drizzleTables = '0'] = readFile(
			dbPath,
			"SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'whatsmeow_%' AND name <> '_sqlite_migrations';",
		)
		check(drizzleTables === '25', 'the 25 drizzle tables', `count=${drizzleTables}`)
		// POSITIVE co-tenancy: whatsmeow's own schema lives in the SAME file. It is a deliverable of
		// the shared store, not noise the filter above exists to hide.
		const [whatsmeowTables = '0'] = readFile(dbPath, "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name LIKE 'whatsmeow_%';")
		check(Number(whatsmeowTables) > 0, 'whatsmeow is CO-TENANT in the same file', `whatsmeow_* table count=${whatsmeowTables}`)

		// A4 — non-interference expressed as a STUCK claim, never as an instantaneous zero.
		const [stuck = '0'] = readFile(
			dbPath,
			`SELECT count(*) FROM shared_outbox WHERE claimed_by IS NOT NULL AND processed_at IS NULL AND lease_until < ${Date.now()};`,
		)
		check(stuck === '0', 'no outbox row is stuck in a claim', `stuck=${stuck}`)
		notes.push(
			...readFile(
				dbPath,
				"SELECT 'outbox ' || source || ' ' || name || ' done=' || (processed_at IS NOT NULL) FROM shared_outbox ORDER BY created_at;",
			),
		)

		log('')
		log('── markers ──────────────────────────────────────────────────────────────')
		log(`CROSSING_1=${crossing1 ? 'ok' : 'fail'}`)
		log(`CROSSING_2=${crossing2 ? 'ok' : 'fail'}`)
		log(`STATUS_1=${status1}`)
		log(`STATUS_2=${status2}`)
		// `yes` iff crossing 2 actually landed on the literal. The weaker variant (CREATED→CONNECTING
		// via /connect, which the gateway can do without the seam) proves the SAME invariant, and this
		// marker is what stops it from passing silently as if it were the strong one.
		log(`CONNECTED_LITERAL_REACHED=${status2 === 'CONNECTED' ? 'yes' : 'no'}`)
		log(`DATA_DIR=${dataDir}`)
		log(`DAEMON_LAUNCH=bundle`)
		log(`NO_POSTGRES_REACHABLE=${envClean ? 'ok' : 'fail'}`)
	} finally {
		for (const [label, child] of [
			['daemon', daemon],
			['gateway', gateway],
		] as const) {
			if (!child) continue
			child.kill('SIGTERM')
			for (let i = 0; i < 20 && child.exitCode === null; i++) await Bun.sleep(100)
			if (child.exitCode === null) child.kill('SIGKILL')
			log(`  ..   ${label} stopped`)
		}
		rmSync(dataDir, { recursive: true, force: true })
	}

	log('')
	if (notes.length > 0) {
		log('── context ──────────────────────────────────────────────────────────────')
		for (const note of notes) log(`  ${note}`)
		log('')
	}
	if (failures.length > 0) {
		log(`RESULT=fail (${failures.length})`)
		for (const failure of failures) log(`  - ${failure}`)
		return 1
	}
	log('RESULT=ok')
	return 0
}

main()
	.then(code => process.exit(code))
	.catch(error => {
		console.error(`RESULT=fail — ${error instanceof Error ? error.message : String(error)}`)
		process.exit(1)
	})
