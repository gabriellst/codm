import net from 'node:net'
import { resolve } from 'node:path'
import { REPO, type TestBootWorkspaceId, type TestBoot } from '../../../../../template.config'

/**
 * THE RECIPE RUNNER (spec D9/AC-6, T7) — boots another workspace as a co-tenant SUBPROCESS of this
 * process's test backend, doing exactly and only what that workspace's manifest entry DECLARES.
 *
 * There is no service name in this file, and there is no `if` on one. A caller names a workspace
 * id; `REPO.workspaces[id].testBoot` answers with argv to build, argv to run, the fixed env of the
 * axis column it must boot in, which env var carries each harness-owned slot (`port`, `dataDir`),
 * and the path to poll until it answers. Adding a second bootable service is a manifest entry —
 * this file does not change, does not learn a language, and does not grow a branch
 * (CLAUDE.md Non-Negotiable §5).
 *
 * NOT exported from `tests/support/testing.ts`, on purpose: the `/testing` subpath is a CATALOG
 * with a name-set gate (`tests/architecture/testing-dts.test.ts`), and this is machinery behind
 * `startIntegrationBackend({ services })`, not a name a consumer composes with. The spike suite
 * imports it directly — from inside the same package — to MEASURE a second spawn cycle without
 * either duplicating this logic or widening the public surface to carry a measurement.
 */
export interface RunningService {
	/** The workspace id this process was booted from — the manifest key, never a nickname. */
	readonly id: TestBootWorkspaceId
	/** `http://127.0.0.1:<the port the harness picked and the recipe bound>`. */
	readonly url: string
	readonly port: number
	/** ms spent in `build` (0 when this process reused the per-process build). */
	readonly buildMs: number
	/** ms from spawn to the first 2xx on the declared health path. */
	readonly readyMs: number
	stop(): Promise<void>
}

/** Repo root, derived from THIS file's location — never from cwd, never from an env override: a
 *  worktree must build ITS OWN tree, and `bun test` is run from at least two different cwds. */
const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

/** `build` runs at most once per test process, per workspace — the promise IS the cache. */
const builds = new Map<string, Promise<number>>()

function recipeOf(id: TestBootWorkspaceId): TestBoot {
	const workspace = REPO.workspaces[id]
	// Unreachable through the type (TestBootWorkspaceId is derived from the recipes themselves), but
	// this module is also reachable from JS/dynamic-import consumers, and a silent `undefined` here
	// would surface as an unreadable spawn failure ten lines later.
	const recipe = (workspace as { testBoot?: TestBoot }).testBoot
	if (!recipe) throw new Error(`testBoot: workspace '${id}' declares no test-boot recipe in template.config.ts`)
	return recipe
}

async function buildOnce(id: TestBootWorkspaceId): Promise<number> {
	const cached = builds.get(id)
	if (cached) {
		await cached
		return 0
	}
	const recipe = recipeOf(id)
	const cwd = resolve(REPO_ROOT, REPO.workspaces[id].pkgRoot)
	const run = (async () => {
		const started = performance.now()
		const [command, ...args] = recipe.build
		if (command === undefined) throw new Error(`testBoot: workspace '${id}' declares an empty build command`)
		const proc = Bun.spawn([command, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
		const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
		if (exitCode !== 0) throw new Error(`testBoot: build for '${id}' failed (exit ${exitCode})\n${stderr}`)
		return performance.now() - started
	})()
	builds.set(id, run)
	return run
}

/** An OS-assigned free port, handed back after the probe listener releases it. The recipe binds it
 *  explicitly rather than letting the service pick one and logging it — the harness is the only
 *  side that needs to KNOW the number, and parsing it out of a subprocess's stdout is a second
 *  protocol nobody declared. */
async function freePort(): Promise<number> {
	const probe = net.createServer()
	await new Promise<void>((ok, fail) => {
		probe.once('error', fail)
		probe.listen(0, '127.0.0.1', ok)
	})
	const address = probe.address()
	if (address === null || typeof address === 'string') throw new Error('testBoot: probe listener bound no TCP port')
	await new Promise<void>(ok => probe.close(() => ok()))
	return address.port
}

/**
 * Boot one declared service. `dataDir` is the SAME scratch dir the TS backend's own driver opened
 * (`harnessDataDir.ts`) — that shared file IS the integration seam: gateway rows land in tables
 * this process reads, and integration events cross as `shared_outbox` rows, not as sockets.
 */
export async function bootService(id: TestBootWorkspaceId, options: { dataDir: string }): Promise<RunningService> {
	const recipe = recipeOf(id)
	const cwd = resolve(REPO_ROOT, REPO.workspaces[id].pkgRoot)
	const buildMs = await buildOnce(id)
	const port = await freePort()

	const [command, ...args] = recipe.run
	if (command === undefined) throw new Error(`testBoot: workspace '${id}' declares an empty run command`)
	const proc = Bun.spawn([command, ...args], {
		cwd,
		env: {
			...process.env,
			...recipe.env,
			[recipe.binds.port]: String(port),
			[recipe.binds.dataDir]: options.dataDir,
		},
		stdout: 'pipe',
		stderr: 'pipe',
	})

	// Drained continuously, never left to fill the pipe (a blocked child looks exactly like a hung
	// boot). Kept so a health-wait failure can SHOW what the subprocess said instead of timing out
	// mutely; discarded on success, which is why nothing is printed on the happy path.
	const log: string[] = []
	const drain = async (stream: ReadableStream<Uint8Array>): Promise<void> => {
		const reader = stream.getReader()
		const decoder = new TextDecoder()
		for (;;) {
			const { done, value } = await reader.read()
			if (done) return
			if (value) log.push(decoder.decode(value))
		}
	}
	void drain(proc.stdout).catch(() => {
		// no-op — drain() failing just means the health-wait log stays empty, not fatal
	})
	void drain(proc.stderr).catch(() => {
		// no-op — see comment above
	})

	const url = `http://127.0.0.1:${port}`
	const stop = async (): Promise<void> => {
		if (proc.exitCode !== null) return
		proc.kill()
		await Promise.race([proc.exited, Bun.sleep(5000).then(() => proc.kill(9))])
		await proc.exited
	}

	const started = performance.now()
	const deadline = started + 30_000
	for (;;) {
		if (proc.exitCode !== null)
			throw new Error(`testBoot: '${id}' exited (${proc.exitCode}) before answering ${recipe.healthPath}\n${log.join('')}`)
		try {
			const response = await fetch(`${url}${recipe.healthPath}`)
			if (response.ok) {
				await response.text()
				break
			}
			await response.text()
		} catch {
			// not listening yet — the deadline below is the only thing that gives up
		}
		if (performance.now() > deadline) {
			await stop()
			throw new Error(`testBoot: '${id}' never answered 2xx on ${recipe.healthPath} within 30s\n${log.join('')}`)
		}
		await Bun.sleep(25)
	}

	return { id, url, port, buildMs, readyMs: performance.now() - started, stop }
}
