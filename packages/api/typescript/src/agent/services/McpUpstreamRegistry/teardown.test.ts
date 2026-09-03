// packages/api/typescript/src/agent/services/McpUpstreamRegistry/teardown.test.ts — arquivo final COMPLETO
import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Protocol } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { McpTransport } from '@codm/contracts-typescript/wire/enums'
import { PROCESS_TREES, type ProcessTree } from '@codm/core-typescript'
import { McpServer } from '../../entities/McpServer'
import { MockMcpServerRepository } from '../../repositories/McpServerRepository'
import { DefaultMcpUpstreamRegistry } from './DefaultMcpUpstreamRegistry'

/**
 * THE REGRESSION THIS SUITE EXISTS TO CLOSE (Task T11) — measured against the SDK source, not
 * imagined: `StdioClientTransport.close()` sets `this._process = undefined` SYNCHRONOUSLY, before
 * awaiting anything (`dist/esm/client/stdio.js:146`), and `get pid()` reads `this._process?.pid ??
 * null`. `shutdown()` used to read the pid AFTER `await client.close()` — always `null` by then — so
 * `if (pid)` never entered and `tree.terminate()` never ran for a single STDIO server. Whatever
 * grandchildren the upstream server spawned (a browser MCP opens the browser itself) leaked forever.
 *
 * This suite drives the REAL SDK client against REAL child processes (no server mock stands in for
 * `StdioClientTransport`, since the transport itself is the object whose pid-timing is under test)
 * and observes the pid ordering through the OS: a server's process must actually be gone once
 * `shutdown()` returns.
 */

const require = createRequire(import.meta.url)
const serverIndexUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/index.js')).href
const serverStdioUrl = pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/stdio.js')).href

/**
 * A REAL, minimal MCP stdio server, written to the OS temp dir (never the repo) fresh per test and
 * removed in `afterEach` — nothing survives the run. It only needs to complete the MCP handshake
 * (`Server` does that automatically) and then idle on stdin, exactly like a real third-party upstream
 * sitting there waiting for the next call.
 */
function writeFixtureServer(dir: string, name: string): string {
	const path = join(dir, `${name}.mjs`)
	writeFileSync(
		path,
		[
			`import { Server } from ${JSON.stringify(serverIndexUrl)}`,
			`import { StdioServerTransport } from ${JSON.stringify(serverStdioUrl)}`,
			`const server = new Server({ name: ${JSON.stringify(name)}, version: '0.0.0' }, { capabilities: {} })`,
			`await server.connect(new StdioServerTransport())`,
		].join('\n'),
		'utf8',
	)
	return path
}

/** `process.kill(pid, 0)` sends no signal — it only probes whether the pid still resolves to a process. */
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

/**
 * Polls for the pid's death against a GENEROUS deadline instead of a single fixed sleep — the
 * assertion this backs is "gone by the deadline", never "gone within exactly N ms". The deadline is
 * intentionally decoupled from any `it()` timeout: this suite spawns real OS processes and tears them
 * down through a real grace-period kill (`tree.terminate(..., 2000)`), and under CI/pre-commit load
 * (many suites' processes competing for scheduler time) the OS can take meaningfully longer than the
 * unloaded case to actually reap a child and report it gone via `process.kill(pid, 0)`. 10s here is
 * comfortably above the 2s grace period `shutdown()` requests, and every call site pairs this with an
 * `it()` timeout set well above 10s so the two deadlines never race each other.
 */
async function waitUntilDead(pid: number, timeoutMs = 10_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (!isAlive(pid)) return true
		await new Promise(resolve => setTimeout(resolve, 50))
	}
	return !isAlive(pid)
}

const OWNER_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

describe('DefaultMcpUpstreamRegistry.shutdown — teardown of REAL STDIO upstreams', () => {
	let dir: string
	let repo: MockMcpServerRepository
	let registry: DefaultMcpUpstreamRegistry
	let closeSpy: ReturnType<typeof spyOn>
	let originalTerminate: ProcessTree['terminate']
	let terminateCalls: { pid: number | undefined }[]

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'mcp-teardown-'))
		repo = new MockMcpServerRepository()
		registry = new DefaultMcpUpstreamRegistry(repo)

		// Spies through the REAL SDK classes — `close()` is defined on `Protocol.prototype`, which
		// `Client.prototype` inherits, so this observes every `client.close()` call the registry makes
		// without touching the registry's own code. Default `spyOn` behaviour calls through, so the
		// real teardown still runs.
		closeSpy = spyOn(Protocol.prototype, 'close')

		// The registry looks up `PROCESS_TREES[process.platform]` DIRECTLY — there is no injection seam
		// — so the only way to observe what it passes to `terminate` is to wrap the real strategy in
		// place and restore it afterwards. The wrapper still forwards to the original implementation,
		// so the OS-level kill this suite verifies is the production one, not a stub.
		const tree = PROCESS_TREES[process.platform]
		originalTerminate = tree.terminate.bind(tree)
		terminateCalls = []
		tree.terminate = (child, exited, graceMs) => {
			terminateCalls.push({ pid: child.pid })
			return originalTerminate(child, exited, graceMs)
		}
	})

	afterEach(() => {
		closeSpy.mockRestore()
		PROCESS_TREES[process.platform].terminate = originalTerminate
		rmSync(dir, { recursive: true, force: true })
	})

	async function registerStdioServer(key: string): Promise<McpServer> {
		const scriptPath = writeFixtureServer(dir, key)
		const server = McpServer.create({
			ownerId: OWNER_ID,
			key,
			transport: McpTransport.STDIO,
			// The registry's own runtime — guaranteed present, unlike a system `node` on PATH — running
			// a plain `.mjs` file needs no flags.
			command: process.execPath,
			args: [scriptPath],
		})
		await repo.save(server)
		return server
	}

	it('(a) closes every connected client', async () => {
		await registerStdioServer('alpha')
		await registerStdioServer('bravo')
		await registry.listTools(OWNER_ID) // connects to both, populating `clients` + `transports`

		await registry.shutdown()

		expect(closeSpy).toHaveBeenCalledTimes(2)
	}, // Real spawn + MCP handshake for 2 processes, then real teardown — see the module docblock atop
	// `waitUntilDead` for why this needs headroom above bun's 5000ms default under load.
	20_000)

	it('(b) terminate is called once per STDIO server, with that REAL pid — red before the fix, green after', async () => {
		await registerStdioServer('alpha')
		await registerStdioServer('bravo')
		await registry.listTools(OWNER_ID)

		// Sanity: two real, live OS processes exist before teardown.
		expect(terminateCalls).toHaveLength(0)

		await registry.shutdown()

		expect(terminateCalls).toHaveLength(2)
		const pids = terminateCalls.map(call => call.pid)
		// The defect this suite guards: pid read AFTER close is always `undefined` by the time
		// `shutdown` reaches `tree.terminate`. Both recorded pids must be real, positive process ids.
		for (const pid of pids) {
			expect(typeof pid).toBe('number')
			expect(pid).toBeGreaterThan(0)
		}
		// Distinct servers, distinct OS processes.
		expect(new Set(pids).size).toBe(2)

		// The strongest proof a recorded pid was the SERVER's real pid, not a stale/undefined one: the
		// OS actually reports that process gone once shutdown has run its course. Waited CONCURRENTLY,
		// not sequentially — sequential waits would let two independent 10s polling deadlines stack
		// into a worst case double the `it()` timeout below for no reason; both pids die from the same
		// `shutdown()` call, so there is nothing sequential about waiting for them.
		const deaths = await Promise.all(pids.map(pid => waitUntilDead(pid as number)))
		for (const dead of deaths) {
			expect(dead).toBe(true)
		}
	}, // Real spawn + handshake for 2 processes, real teardown, then up to `waitUntilDead`'s own 10s
	// deadline (run concurrently for both pids, so worst case is ~10s, not ~20s) — comfortably below
	// this cap even under load. See the module docblock atop `waitUntilDead`.
	25_000)

	it('(c) shutdown is idempotent — a second call terminates nothing again', async () => {
		await registerStdioServer('alpha')
		await registry.listTools(OWNER_ID)

		await registry.shutdown()
		expect(terminateCalls).toHaveLength(1)
		expect(closeSpy).toHaveBeenCalledTimes(1)

		await registry.shutdown()
		expect(terminateCalls).toHaveLength(1)
		expect(closeSpy).toHaveBeenCalledTimes(1)
	}, 20_000)

	it('(d) the Windows strategy is never asked for a process-group signal', async () => {
		await registerStdioServer('alpha')
		await registry.listTools(OWNER_ID)

		const killSpy = spyOn(process, 'kill')
		try {
			await registry.shutdown()

			if (process.platform === 'win32') {
				// `windowsProcessTree` tears the tree down via `taskkill /T /F`, never via
				// `process.kill(-pid, …)` — there is no process GROUP to signal on Windows (see
				// `ProcessTree.ts`'s module docblock). This host runs the Windows strategy, so this is
				// the assertion that actually exercises the guard.
				expect(killSpy).not.toHaveBeenCalled()
			} else {
				// On POSIX the group IS signalled — negative pid — by design (`posixProcessTree`).
				expect(killSpy).toHaveBeenCalled()
			}
		} finally {
			killSpy.mockRestore()
		}
	}, 20_000)
})
