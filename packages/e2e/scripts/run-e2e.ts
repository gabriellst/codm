#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lockPathFor } from '@codm/core-typescript/db/lock'
import { REPO } from '../../../template.config'

const E2E_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const API_TS_ROOT = resolve(E2E_ROOT, '../api/typescript')
// Repo root, derived rather than hand-walked a second time — mirrors
// `packages/api/typescript/tests/support/testBoot.ts`'s own `REPO_ROOT`, which resolves the SAME
// manifest recipe this runner reuses below (T10).
const REPO_ROOT = resolve(E2E_ROOT, '../..')
const API_GO_ROOT = resolve(REPO_ROOT, REPO.workspaces.apiGo.pkgRoot)
// The DECLARED co-tenant recipe (template.config.ts `WORKSPACES.apiGo.testBoot`, T7/T8) — build
// argv and the fixed env (CODM_ENV + the two empty apikey keys) are read from the SAME manifest
// entry `startIntegrationBackend({ services: ['apiGo'] })` resolves, so the godotenv-trap
// workaround (see that entry's docblock) is declared exactly once, not re-typed here.
const apiGoRecipe = REPO.workspaces.apiGo.testBoot

/**
 * Resolve a Node binary to boot the daemon the RUN-UNDER-NODE way (the daemon is built with Bun but
 * runs under Node). Node is nvm-only on the build host (absent from the bare non-interactive PATH),
 * so resolve explicitly: honor `CODM_NODE_BIN`, else the newest `~/.nvm/versions/node/<v>/bin/node`,
 * else PATH `node`.
 */
function resolveNodeBin(): string {
	if (process.env.CODM_NODE_BIN) return process.env.CODM_NODE_BIN
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
 * CODM e2e runner. Boots the REAL stack the harness can stand up on its own — the TS daemon in
 * `real` mode over the EMBEDDED, file-backed SQLite store (founder decision 3: no external Postgres),
 * the Go channel gateway (T10), and the app-react console — and runs Playwright against it.
 *
 * The Go Channel Gateway IS booted (T10, .specs/2026-08-10-eixo-ambiente-go-design.md D12/AC-9) —
 * this stopped being true the moment the gateway grew its own `e2e` wiring column (T1-T4): it now
 * boots CODM_ENV=e2e over the SAME scratch CODM_DATA_DIR the TS daemon writes to, with
 * `channel.Overlays[EnvE2e]` swapping in the scripted `MockChannelFactory` (defaultE2eScenario,
 * internal/channel/overlay.go) — QR frames, auto-pairing, and contacts flow through the REAL
 * mapper/outbox/handler/projector pipeline, no phone involved. The TEST-ONLY `/_test/gateway`
 * endpoint (TS-side, mounted only under CODM_ENV=e2e) still exists and is still used by specs that
 * only need a CONNECTED channel row as background state (givenAttachedThread) — the two seams are
 * complementary, not a replacement of one by the other: this runner needs no Postgres, no Redis, no
 * Docker either way — just a scratch data dir both processes migrate/open on boot.
 *
 * What it owns:
 *   - a fresh scratch CODM_DATA_DIR per run (codm.db + its -wal/-shm and daemon.lock root here;
 *     dropped on exit) — shared by BOTH the TS daemon and the Go gateway subprocess (spec D10: one
 *     store, no re-spawn between tests, the topology production already uses);
 *   - the three dev ports (pre-kills stale listeners — a watch-mode orphan pointing at a dropped dir
 *     is always wrong), pinned per-server so the api (fastify), the gateway, and the app (vite) don't
 *     collide on $PORT;
 *   - CODM_ENV=e2e, which selects the daemon's declared `e2e` registry column: real-shaped
 *     infrastructure (SqlExternalMediator, FileLibsqlDriver on the scratch dir) with the hermetic
 *     seams declared per token (stub AgentRunner, canned ProviderDetector, test ingress controller) —
 *     and, on the Go side, the SAME column name selecting `channel.Overlays[EnvE2e]`.
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
	const dataDir = mkdtempSync(join(tmpdir(), 'codm-e2e-data-'))

	// E2E-OWNED PORT RANGE — deliberately NOT the dev/production ports (3030/5173), and this is a
	// lesson written in blood, 2026-08-06: the pre-kill below sends kill -9 to whatever holds these
	// ports, on the assumption that a listener here is a stale watch-mode orphan. When the defaults
	// were the production ports, an issue agent running `bun e2e` from its worktree killed the LIVE
	// daemon + vite — its own grandparent — taking down the whole app and every in-flight turn with
	// it (and the resumed turn re-ran e2e on relaunch, murdering the app in a loop). With a port
	// range only e2e ever binds, the pre-kill can only ever hit e2e's own orphans — correct by
	// construction, no "is it stale or is it production?" heuristic.
	const apiPort = process.env.E2E_API_PORT ?? '3130'
	const vitePort = process.env.E2E_VITE_PORT ?? '5273'
	// E2E-owned, third port in the same deliberately-not-dev/production range as the two above
	// (T10) — 3132, not 3032 (dev) or the api's own 3130 here.
	const gatewayPort = process.env.E2E_GATEWAY_PORT ?? '3132'
	// QUARTA porta da mesma faixa e2e-only (F7) — 3134, não a 3033 do `dev:cloud`. O daemon de NUVEM.
	//
	// Ele existe porque o ADR 0001 partiu o daemon em dois deployments e o e2e ficou com metade da
	// topologia: `auth` e `owner` são cloud-only, e o daemon LOCAL não tem a quem perguntar quem é o
	// operador — `CloudSessionMiddleware` está declarado em praticamente todo controller local, e sem
	// `CODM_CLOUD_URL` ele recusa TUDO. Eram 10 das 11 specs reprovando por essa única razão.
	const cloudPort = process.env.E2E_CLOUD_PORT ?? '3134'
	// Data dir PRÓPRIO: o daemon de nuvem não compartilha o arquivo SQLite do par local/gateway — ele
	// fala Postgres (PGlite, em-processo, coluna `e2e`). Um dir separado deixa isso explícito e
	// impede que um `lockPathFor` de um pise no do outro.
	const cloudDataDir = mkdtempSync(join(tmpdir(), 'codm-e2e-cloud-'))
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

	// Build the gateway binary BEFORE Playwright boots it too (T10) — same reasoning as the node
	// bundle above: `go build` runs ONCE here, the webServer entry just execs the prebuilt `./api`,
	// so a slow compile fails loudly on this line instead of hiding behind the webServer timeout.
	// argv comes from the manifest recipe (template.config.ts `WORKSPACES.apiGo.testBoot.build`) —
	// not re-typed, so this can never drift from what `startIntegrationBackend({ services })` builds.
	console.log('[e2e] building gateway binary (go build)…')
	const [goBuildCmd, ...goBuildArgs] = apiGoRecipe.build
	if (goBuildCmd === undefined) throw new Error('run-e2e: apiGo testBoot recipe declares an empty build command')
	const gatewayBuild = Bun.spawnSync([goBuildCmd, ...goBuildArgs], {
		cwd: API_GO_ROOT,
		stdout: 'inherit',
		stderr: 'inherit',
	})
	if (gatewayBuild.exitCode !== 0) {
		console.error('[e2e] gateway build failed')
		process.exit(gatewayBuild.exitCode ?? 1)
	}

	const childEnv: NodeJS.ProcessEnv = {
		...process.env,
		// Hermetic seam: real-mode daemon with the in-process mediator + test ingress endpoint + stub
		// runner (no Redis, no provider CLI) — plus, since T10, the REAL Go gateway as a co-tenant
		// subprocess (see this file's docblock). Refused under NODE_ENV=production.
		CODM_ENV: 'e2e',
		CODM_DATA_DIR: dataDir,
		// Pin ports so the webServer entries don't collide on $PORT from the root .env.
		API_PORT: apiPort,
		PORT: apiPort,
		VITE_PORT: vitePort,
		// Pin the api URL for BOTH consumers that would otherwise fall back to the root .env's
		// production address (localhost:3030): the node-side given helpers read API_URL, and the
		// BROWSER reads VITE_API_URL (vite gives process-env precedence over .env files). Without
		// these, moving the api off :3030 would silently point e2e specs at the production daemon.
		API_URL: `http://127.0.0.1:${apiPort}`,
		VITE_API_URL: `http://127.0.0.1:${apiPort}`,
		// The node binary the playwright webServer uses to boot `dist/server.js` (nvm-resolved).
		CODM_NODE_BIN: nodeBin,
		// One host runs the whole suite — per-IP auth windows would 429 legitimate specs.
		RATE_LIMIT_DISABLED: 'true',
		// Gateway co-tenant (T10). CHANNEL_PORT is the wire var BOTH the Go binary (config.go's
		// CHANNEL-prefixed resolveEnv) and playwright.config.ts's third webServer read. The two apikey
		// keys are READ off the manifest recipe (not re-typed as literals) — CODM_ENV is already set
		// above with the same value the recipe declares, so only the two it uniquely contributes are
		// pulled in here (spreading the whole `apiGoRecipe.env` would redeclare CODM_ENV a second time
		// in this same object, which tsc rightly flags as TS2783). API_GO_URL is the SERVER-SIDE var
		// api-ts's `forwardToChannel` proxies through — the browser never learns this port directly
		// (app-react `lib/config.ts`: "No VITE_GATEWAY_URL exists on purpose").
		CHANNEL_PORT: gatewayPort,
		CHANNEL_GLOBAL_API_KEY: apiGoRecipe.env.CHANNEL_GLOBAL_API_KEY,
		GLOBAL_API_KEY: apiGoRecipe.env.GLOBAL_API_KEY,
		API_GO_URL: `http://127.0.0.1:${gatewayPort}`,
		// ── O DAEMON DE NUVEM (F7) ─────────────────────────────────────────────────────────────────
		// Declarado AQUI, explicitamente, e NÃO por `--env-file=../../.env`. O atalho de espelhar o
		// `migrate:dev` foi medido e rejeitado por duas razões: (a) carregar o `.env` do desenvolvedor
		// numa suíte hermética é o caminho pelo qual um teste acaba escrevendo no data dir do daemon
		// VIVO — risco contra o qual `api/typescript/tests/support/testing.ts` já guarda com erro
		// dedicado; (b) o `.env` aponta `CODM_CLOUD_URL` para :3033, a porta do `dev:cloud`, que é
		// justamente a produção-local que esta faixa de portas existe para nunca tocar.
		//
		// `CLOUD_CONFIGURED` é `Boolean(data.CODM_CLOUD_URL)` computado ANTES do cross-default para
		// API_URL (core/src/utils/Config.ts) — então só a var CRUA presente arma o caminho de nuvem, e
		// é por isso que ela precisa estar neste objeto e não herdada de arquivo.
		CODM_CLOUD_URL: `http://127.0.0.1:${cloudPort}`,
		E2E_CLOUD_PORT: cloudPort,
		E2E_CLOUD_DATA_DIR: cloudDataDir,
	}

	// This runner OWNS the three dev ports for the duration of the run: its servers must be wired to
	// THIS run's scratch data dir, so a leftover listener from a previous run (watch-mode orphan
	// pointing at a dropped dir) is always wrong — kill it, never reuse it.
	for (const port of [apiPort, vitePort, gatewayPort, cloudPort]) {
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
			// O dir do daemon de nuvem (F7) segue a MESMA regra: criado por este runner, largado por
			// este runner. Sem isto cada execução deixaria um `mkdtemp` órfão para trás.
			rmSync(lockPathFor(cloudDataDir), { force: true })
			rmSync(cloudDataDir, { recursive: true, force: true })
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
