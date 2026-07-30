#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lockPathFor } from '@codm/core-typescript/db/lock'

const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API_TS_ROOT = resolve(E2E_ROOT, '../api/typescript')

/**
 * Resolve a Node binary to boot the daemon the RUN-UNDER-NODE way (the daemon is built with Bun but
 * runs under Node). Node is nvm-only on the build host (absent from the bare non-interactive PATH),
 * so resolve explicitly: honor `CODEDM_NODE_BIN`, else the newest `~/.nvm/versions/node/<v>/bin/node`,
 * else PATH `node`.
 */
function resolveNodeBin(): string {
	if (process.env.CODEDM_NODE_BIN) return process.env.CODEDM_NODE_BIN
	const nvmRoot = join(process.env.HOME ?? '', '.nvm/versions/node')
	if (existsSync(nvmRoot)) {
		for (const v of readdirSync(nvmRoot).sort().reverse()) {
			const candidate = join(nvmRoot, v, 'bin/node')
			if (existsSync(candidate)) return candidate
		}
	}
	return 'node'
}

/**
 * CodeDM e2e runner. Boots the REAL stack the harness can stand up on its own — the TS daemon in
 * `real` mode over the EMBEDDED, file-backed SQLite store (founder decision 3: no external Postgres), plus
 * the app-react console — and runs Playwright against it.
 *
 * The Go Channel Gateway is NOT booted; gateway ingress is simulated at the integration-event seam by
 * the TEST-ONLY `/v1/_test/gateway` endpoint (mounted only under CODEDM_E2E). So this runner needs no
 * Postgres, no Redis, no Docker — just a scratch data dir the daemon migrates on boot.
 *
 * What it owns:
 *   - a fresh scratch CODEDM_DATA_DIR per run (codedm.db + its -wal/-shm and daemon.lock root here;
 *     dropped on exit);
 *   - the two dev ports (pre-kills stale listeners — a watch-mode orphan pointing at a dropped dir is
 *     always wrong), pinned per-server so the api (fastify) and app (vite) don't collide on $PORT;
 *   - CODEDM_E2E=true, which flips the daemon's `real` bindings to the hermetic seams (in-process
 *     ExternalMediator, stub AgentRunner, canned ProviderDetector, test ingress controller).
 */
function runCaptureExitCode(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
	return new Promise<number>(resolvePromise => {
		const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
		child.on('exit', code => resolvePromise(code ?? 1))
		child.on('error', err => {
			console.error(`[e2e] failed to spawn ${command}:`, err)
			resolvePromise(1)
		})
	})
}

async function main() {
	// Scratch, file-backed SQLite data dir — the embedded `real` driver roots here and migrates on
	// boot (idempotent). A fresh dir per run = a fresh database with no cross-run state.
	const dataDir = mkdtempSync(join(tmpdir(), 'codedm-e2e-data-'))

	const apiPort = process.env.API_PORT ?? '3030'
	const vitePort = process.env.VITE_PORT ?? '5173'
	const nodeBin = resolveNodeBin()

	// Build the daemon as a Node bundle BEFORE Playwright boots it (the webServer runs
	// `node dist/server.js`). This is the ONLY thing that gives the e2e suite evidence for the
	// run-under-Node path — booting from Bun source would validate a runtime we don't ship.
	console.log(`[e2e] building api node bundle (node=${nodeBin})…`)
	const build = Bun.spawnSync(['bun', 'run', 'scripts/build.ts'], {
		cwd: API_TS_ROOT,
		stdout: 'inherit',
		stderr: 'inherit',
	})
	if (build.exitCode !== 0) {
		console.error('[e2e] api node build failed')
		process.exit(build.exitCode ?? 1)
	}

	const childEnv: NodeJS.ProcessEnv = {
		...process.env,
		// Hermetic seam: real-mode daemon with the in-process mediator + test ingress endpoint + stub
		// runner (no Redis, no Go gateway, no provider CLI). Refused under NODE_ENV=production.
		CODEDM_E2E: 'true',
		CODEDM_DATA_DIR: dataDir,
		// Pin ports so the webServer entries don't collide on $PORT from the root .env.
		API_PORT: apiPort,
		PORT: apiPort,
		VITE_PORT: vitePort,
		// The node binary the playwright webServer uses to boot `dist/server.js` (nvm-resolved).
		CODEDM_NODE_BIN: nodeBin,
		// One host runs the whole suite — per-IP auth windows would 429 legitimate specs.
		RATE_LIMIT_DISABLED: 'true',
	}

	// This runner OWNS the two dev ports for the duration of the run: its servers must be wired to
	// THIS run's scratch data dir, so a leftover listener from a previous run (watch-mode orphan
	// pointing at a dropped dir) is always wrong — kill it, never reuse it.
	for (const port of [apiPort, vitePort]) {
		const found = Bun.spawnSync(['lsof', '-ti', `:${port}`])
			.stdout.toString()
			.trim()
		if (found) {
			console.log(`[e2e] killing stale listener(s) on :${port} (${found.split('\n').join(', ')})`)
			for (const pid of found.split('\n')) Bun.spawnSync(['kill', '-9', pid])
		}
	}

	console.log(`[e2e] embedded SQLite data dir: ${dataDir}`)

	let exitCode = 1
	try {
		const extraArgs = process.argv.slice(2)
		console.log(`[e2e] running playwright${extraArgs.length ? ` ${extraArgs.join(' ')}` : ''}`)
		// bun-first repo: npx may not exist at all. bun ships with the workspace — always present.
		exitCode = await runCaptureExitCode(
			'bun',
			['x', 'playwright', 'test', '--config', 'playwright.config.ts', '--project=e2e', ...extraArgs],
			childEnv,
			E2E_ROOT,
		)
	} finally {
		console.log(`[e2e] removing scratch data dir: ${dataDir}`)
		try {
			// The lock now lives INSIDE the data dir, scoped by role (see lockPathFor), so the recursive
			// drop already takes it — but the rule is imported rather than re-typed, and the explicit
			// removal stays, so a future retarget cannot leave a silent no-op here.
			rmSync(lockPathFor(dataDir), { force: true })
			rmSync(dataDir, { recursive: true, force: true })
		} catch (err) {
			console.error(`[e2e] teardown failed:`, err)
		}
	}

	process.exit(exitCode)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
