#!/usr/bin/env bun
/**
 * Node-boot smoke — the gate that actually exercises the RUN-UNDER-NODE path (the e2e suite boots
 * from Bun source, so it proves nothing here). Builds the node bundle, boots `node dist/server.js`
 * against a scratch data dir, asserts `/session` answers 200 (only true once the shared SQLite
 * store migrated and the HTTP server is listening), then tears down. This is what would have caught
 * the two boot failures the grounded plan hit: the `import.meta.url` migrations path and the native
 * libsql addon left unresolvable outside `dist/node_modules`.
 *
 * Node is nvm-only on the build host (not on the bare non-interactive PATH), so resolve it explicitly:
 * honor `CODM_NODE_BIN`, else the newest node under `~/.nvm/versions/node`, else PATH `node`.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REPO } from '../../../../template.config'
// Pelo SPECIFIER do pacote, não por caminho relativo para dentro do workspace irmão (F1.1). O
// relativo funcionava, mas sob `composite: true` ele arrasta `core/src/**` para dentro deste
// programa sem estar em include nenhum — TS6307, três vezes. O `./db/lock` já existe no exports map
// do `@codm/core-typescript` e aponta para o MESMO módulo.
import { lockPathFor } from '@codm/core-typescript/db/lock'

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function resolveNodeBin(): string {
	if (process.env.CODM_NODE_BIN) return process.env.CODM_NODE_BIN
	const nvmRoot = join(process.env.HOME ?? '', '.nvm/versions/node')
	if (existsSync(nvmRoot)) {
		const versions = readdirSync(nvmRoot).sort().reverse()
		for (const v of versions) {
			const candidate = join(nvmRoot, v, 'bin/node')
			if (existsSync(candidate)) return candidate
		}
	}
	return 'node'
}

async function main(): Promise<void> {
	// Build the node bundle (idempotent — same script every gate uses).
	const build = Bun.spawnSync(['bun', 'run', join(pkgRoot, 'scripts/build.ts')], {
		cwd: pkgRoot,
		stdout: 'inherit',
		stderr: 'inherit',
	})
	if (build.exitCode !== 0) process.exit(build.exitCode ?? 1)

	const nodeBin = resolveNodeBin()
	const dataDir = mkdtempSync(join(tmpdir(), `${REPO.brand}-node-smoke-`))
	const port = Number(process.env.API_PORT ?? 3097)
	console.log(`[smoke] node=${nodeBin} port=${port} dataDir=${dataDir}`)

	const child = spawn(nodeBin, ['--enable-source-maps', join(pkgRoot, 'dist/server.js')], {
		cwd: pkgRoot,
		env: { ...process.env, CODM_DATA_DIR: join(dataDir, 'data'), API_PORT: String(port), PORT: String(port) },
		stdio: 'inherit',
	})

	let exitCode = 1
	try {
		const url = `http://127.0.0.1:${port}/session`
		for (let i = 0; i < 40; i++) {
			if (child.exitCode !== null) throw new Error(`daemon exited early with code ${child.exitCode}`)
			try {
				const res = await fetch(url)
				if (res.status === 200) {
					console.log(`[smoke] ✅ ${url} → 200 after ~${i}s`)
					exitCode = 0
					break
				}
			} catch {
				// not listening yet
			}
			await new Promise(r => setTimeout(r, 1000))
		}
		if (exitCode !== 0) console.error(`[smoke] ❌ ${url} never returned 200`)
	} finally {
		child.kill('SIGTERM')
		await new Promise(r => setTimeout(r, 1500))
		if (child.exitCode === null) child.kill('SIGKILL')
		try {
			// The lock now lives INSIDE the data dir (see lockPathFor) — and the child boots with
			// CODM_DATA_DIR = `<dataDir>/data`, so that is the dir to ask about. The rule is imported,
			// never re-typed: the old hardcoded sibling path became a silent no-op the moment the lock
			// moved, and this is a scratch dir where a no-op teardown looks exactly like a working one.
			rmSync(lockPathFor(join(dataDir, 'data')), { force: true })
			rmSync(dataDir, { recursive: true, force: true })
		} catch {
			// best effort
		}
	}

	process.exit(exitCode)
}

main().catch(err => {
	console.error('[smoke] failed:', err)
	process.exit(1)
})
