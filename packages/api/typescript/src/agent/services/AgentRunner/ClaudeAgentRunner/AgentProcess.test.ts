import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROCESS_TREES, posixProcessTree, type ProcessTree, type TreeRoot } from '@codm/core-typescript'
import { resolveProviderEnv } from '../platformInvocation'
import { createNodeAgentProcessSpawner, type AgentProcess } from './AgentProcess'

/**
 * `nodeAgentProcessSpawner` is `createNodeAgentProcessSpawner(PROCESS_TREES[process.platform])`.
 * This suite proves the spawner actually CONSUMES the strategy it was built with — both halves:
 * `spawnOptions` reach `spawn()`, and `kill()` delegates to `terminate()` exactly once with the
 * production grace window. Spawning `/bin/sh` here does not contradict §8 rule 8 (no test spawns a
 * PROVIDER CLI): whether a child became a group leader is an OS fact a fake process cannot show.
 *
 * Both cases spawn `/bin/sh` and probe POSIX process groups — meaningless on a Windows host, hence
 * the `skipIf`. The Windows half of the strategy is already proven host-agnostic in
 * `ProcessTree.test.ts` via the injected exec fake.
 */

const KILL_GRACE_MS = 2_000

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

/** Does a process GROUP with this id exist? `kill(-pid, 0)` probes the group without signalling it. */
function groupExists(pid: number): boolean {
	try {
		process.kill(-pid, 0)
		return true
	} catch {
		return false
	}
}

async function readFirstLine(proc: AgentProcess): Promise<string> {
	let buffer = ''
	for await (const chunk of proc.stdout) {
		buffer += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
		const newline = buffer.indexOf('\n')
		if (newline >= 0) return buffer.slice(0, newline)
	}
	throw new Error(`process never printed a line; got ${JSON.stringify(buffer)}`)
}

// `exec` replaces the sh with the sleep in the SAME pid: no grandchild inherits the stdout pipe, so
// a fake strategy's direct SIGKILL kills the only process and lets 'close' fire (`exited` resolves
// instead of hanging on a pipe a grandchild still holds). The child+grandchild sweep is
// cancellation.test.ts's property, not this suite's.
const ANNOUNCE_PID_THEN_BLOCK = ['/bin/sh', '-c', 'echo $$; exec sleep 300']

describe('createNodeAgentProcessSpawner — consumes the ProcessTree strategy', () => {
	describe.skipIf(process.platform === 'win32')(
		'spawns with the strategy’s options and hands kill() to terminate() ONCE, with the production grace window',
		() => {
			it('spawns with the strategy’s options and hands kill() to terminate() ONCE, with the production grace window', async () => {
				const calls: { pid: number | undefined; graceMs: number }[] = []
				const tree: ProcessTree = {
					spawnOptions: { detached: false },
					terminate(child: TreeRoot, _exited, graceMs) {
						calls.push({ pid: child.pid, graceMs })
						child.kill('SIGKILL')
					},
					// This suite only exercises `terminate` — `kill()` never reaches `terminateByPid` — so the
					// fixture delegates to the REAL POSIX strategy instead of a mute stub. Kept honest with the
					// rest of this describe block, which is already `skipIf(win32)` and already uses
					// `posixProcessTree` directly for its other cases.
					terminateByPid: posixProcessTree.terminateByPid,
				}
				const proc = createNodeAgentProcessSpawner(tree)({ cmd: ANNOUNCE_PID_THEN_BLOCK, cwd: process.cwd(), stdin: false })

				const pid = Number(await readFirstLine(proc))
				expect(alive(pid)).toBe(true)
				// `detached: false` reached `spawn()`: the child shares OUR group, so no group carries its pid.
				// That is the observable difference between the two strategies' spawn options.
				expect(groupExists(pid)).toBe(false)

				proc.kill()
				proc.kill() // idempotent — the second call must not reach the strategy
				expect(calls).toEqual([{ pid, graceMs: KILL_GRACE_MS }])

				await proc.exited
				expect(alive(pid)).toBe(false)
			})
		},
	)

	describe.skipIf(process.platform === 'win32')(
		'with the POSIX strategy the child leads its own process group (today’s behaviour, kept byte-for-byte)',
		() => {
			it('with the POSIX strategy the child leads its own process group (today’s behaviour, kept byte-for-byte)', async () => {
				const proc = createNodeAgentProcessSpawner(posixProcessTree)({ cmd: ANNOUNCE_PID_THEN_BLOCK, cwd: process.cwd(), stdin: false })

				const pid = Number(await readFirstLine(proc))
				expect(groupExists(pid)).toBe(true)

				proc.kill()
				await proc.exited
				expect(alive(pid)).toBe(false)
			})
		},
	)
})

/**
 * O BUG DO PATH MÍNIMO, reproduzido de verdade — o `provider exited with code 127: env: node: No
 * such file or directory` que envenenava issues em máquinas com node por Homebrew/nvm.
 *
 * A fixture é o formato exato da falha: um "CLI" cujo shebang é `#!/usr/bin/env node` (o do próprio
 * `claude`), e um daemon cujo PATH herdado é o de um .app lançado pelo Finder/launchd — sem node.
 * O `node` de mentira mora AO LADO do CLI (o layout real de nvm/npm-global/Homebrew), que é
 * exatamente o diretório que `resolveProviderEnv` atesta via `dirname(binary)`.
 *
 * Hermético nos dois sentidos: o controle usa um dir de fixture VAZIO como PATH (nenhum host tem
 * node nele), e o caso verde assertiva o stdout do NOSSO node — o node real do host executaria o
 * conteúdo do CLI e imprimiria outra coisa, então um vazamento de host não passa por verde.
 * POSIX-only: shebang é mecanismo POSIX (no Windows o caminho é o `cmd.exe` de `resolveInvocation`).
 */
describe.skipIf(process.platform === 'win32')('createNodeAgentProcessSpawner — monta o env do filho (PATH resolvido)', () => {
	let root: string
	let cli: string
	let emptyDir: string

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'agent-process-path-'))
		// Não existe de propósito: uma entrada de PATH inexistente é o "sem node" mais hermético possível.
		emptyDir = join(root, 'empty')
		writeFileSync(join(root, 'node'), '#!/bin/sh\necho fake-node-ok\n', { mode: 0o755 })
		cli = join(root, 'fake-cli')
		writeFileSync(cli, '#!/usr/bin/env node\nconsole.log("real-node-ran")\n', { mode: 0o755 })
	})
	afterEach(() => {
		rmSync(root, { recursive: true, force: true })
	})

	it('CONTROLE — com o env herdado cru de um .app (PATH sem node), o shebang morre com 127', async () => {
		// O resolver identidade é o comportamento antigo: o filho recebe o PATH do pai como está.
		const inherited = () => ({ PATH: emptyDir })
		const proc = createNodeAgentProcessSpawner(posixProcessTree, inherited)({ cmd: [cli], cwd: root, stdin: false })

		expect(await proc.exited).toBe(127)
	})

	it('com o env MONTADO, o mesmo PATH mínimo resolve o node mesmo assim — pelo dir do próprio binário', async () => {
		const resolveEnv = (binary: string) =>
			resolveProviderEnv(binary, {
				// A base é o PATH de um .app lançado pelo Finder: nada utilizável. `home` aponta para a
				// fixture para os knownDirs da row não vazarem o host para dentro do verde.
				basePath: emptyDir,
				env: { PATH: emptyDir },
				home: join(root, 'home'),
				execPath: join(root, 'home', 'daemon'),
			})
		const proc = createNodeAgentProcessSpawner(posixProcessTree, resolveEnv)({ cmd: [cli], cwd: root, stdin: false })

		expect(await readFirstLine(proc)).toBe('fake-node-ok')
		expect(await proc.exited).toBe(0)
	})
})

/**
 * The COMPOSITION of the two env layers, on every host — deliberately not `skipIf`ed.
 *
 * The two PATH cases above are the sharp proof, but they are POSIX-only (a `#!` shebang is not a
 * thing on Windows), which left the composition unguarded on exactly the platform where the merge
 * that broke it was being worked on. `resolveEnv` had lost its call site: the spread was written
 * `spec.env ? {...process.env, ...spec.env} : {}`, so the resolver was never consulted, and the one
 * path that does pass `spec.env` got the raw daemon environment. Both halves are asserted here —
 * that the resolver IS called, and that the run's own keys win over it — with no shebang involved.
 */
describe('createNodeAgentProcessSpawner — spec.env layers OVER the resolved base', () => {
	it('consults the resolver for the invoked binary, and lets spec.env win the overlap', async () => {
		const asked: string[] = []
		const resolveEnv = (binary: string): NodeJS.ProcessEnv => {
			asked.push(binary)
			return { ...process.env, CODM_FROM_RESOLVER: 'base', CODM_OVERLAP: 'base' }
		}

		const proc = createNodeAgentProcessSpawner(
			PROCESS_TREES[process.platform],
			resolveEnv,
		)({
			cmd: [
				process.execPath,
				'-e',
				'console.log([process.env.CODM_FROM_RESOLVER, process.env.CODM_OVERLAP, process.env.CODM_FROM_SPEC].join("|"))',
			],
			cwd: process.cwd(),
			stdin: false,
			env: { CODM_OVERLAP: 'spec', CODM_FROM_SPEC: 'spec' },
		})

		// base survives | spec wins the collision | spec-only key arrives
		expect(await readFirstLine(proc)).toBe('base|spec|spec')
		// The resolver is asked about the BINARY being invoked, not about the daemon.
		expect(asked).toEqual([process.execPath])
	})

	it('still consults the resolver when the spec carries NO env — the base is never conditional', async () => {
		const asked: string[] = []
		const resolveEnv = (binary: string): NodeJS.ProcessEnv => {
			asked.push(binary)
			return { ...process.env, CODM_FROM_RESOLVER: 'base' }
		}

		const proc = createNodeAgentProcessSpawner(
			PROCESS_TREES[process.platform],
			resolveEnv,
		)({
			cmd: [process.execPath, '-e', 'console.log(process.env.CODM_FROM_RESOLVER)'],
			cwd: process.cwd(),
			stdin: false,
		})

		expect(await readFirstLine(proc)).toBe('base')
		expect(asked).toEqual([process.execPath])
	})
})
