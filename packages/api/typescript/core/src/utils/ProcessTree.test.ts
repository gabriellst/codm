import { describe, expect, it } from 'bun:test'
import { PROCESS_TREES, posixDescendants, posixProcessTree, windowsProcessTree, type TreeRoot } from './ProcessTree'

/**
 * The OS strategies behind `AgentProcess.kill()` (D6 of the Windows/Linux build plan).
 *
 * The Windows strategy is exercised from ANY host by injecting the shell-out (`run`) — the only
 * thing it does with the OS is spawn `taskkill`, so recording the argv IS observing the behaviour.
 * The POSIX strategy's group kill is proven against a real `/bin/sh` in `cancellation.test.ts`; here
 * only its fallback branch (group already gone) is pinned, because that branch is what decides
 * whether an escalation timer gets armed.
 */

const GRACE_MS = 30
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
/** A promise that never settles — "the tree is still alive". */
const stillAlive = (): Promise<never> => new Promise<never>(() => {})

function fakeRoot(
	pid: number | undefined,
	state: { exitCode?: number | null; signalCode?: NodeJS.Signals | null } = {},
): { root: TreeRoot; signals: string[] } {
	const signals: string[] = []
	const root: TreeRoot = {
		pid,
		exitCode: state.exitCode ?? null,
		signalCode: state.signalCode ?? null,
		kill(signal?: NodeJS.Signals | number) {
			signals.push(String(signal ?? 'SIGTERM'))
			return true
		},
	}
	return { root, signals }
}

describe('windowsProcessTree', () => {
	it('spawns WITHOUT detached — taskkill /T walks the tree from a child that stays in our group', () => {
		const tree = windowsProcessTree(() => {})
		expect(tree.spawnOptions).toEqual({ detached: false, windowsHide: true })
	})

	it('terminates a live tree with ONE forced taskkill /T /F — no graceful pass, no escalation timer (D6)', async () => {
		const calls: string[][] = []
		const tree = windowsProcessTree((file, args) => calls.push([file, ...args]))
		const { root } = fakeRoot(4242)

		tree.terminate(root, stillAlive(), GRACE_MS)
		expect(calls).toEqual([['taskkill', '/T', '/F', '/PID', '4242']])

		await wait(GRACE_MS * 3)
		// Still exactly one call: nothing was armed to fire after any grace window.
		expect(calls).toEqual([['taskkill', '/T', '/F', '/PID', '4242']])
	})

	it('does NOTHING when the tree root was already reaped — the runner’s finally kills on EVERY run end, and /F on a reused pid would hit an innocent tree', () => {
		const calls: string[][] = []
		const tree = windowsProcessTree((file, args) => calls.push([file, ...args]))

		const exitedClean = fakeRoot(4242, { exitCode: 0 })
		tree.terminate(exitedClean.root, Promise.resolve(0), GRACE_MS)

		const exitedBySignal = fakeRoot(4242, { signalCode: 'SIGTERM' })
		tree.terminate(exitedBySignal.root, Promise.resolve(0), GRACE_MS)

		expect(calls).toEqual([])
	})

	it('a child that never got a pid has nothing to terminate', () => {
		const calls: string[][] = []
		const tree = windowsProcessTree((file, args) => calls.push([file, ...args]))
		const { root, signals } = fakeRoot(undefined)

		tree.terminate(root, stillAlive(), GRACE_MS)

		expect(calls).toEqual([])
		expect(signals).toEqual([])
	})

	it('never signals the child handle directly — on Windows `child.kill()` is TerminateProcess of ONE pid, the leak this strategy exists to prevent', () => {
		const tree = windowsProcessTree(() => {})
		const { root, signals } = fakeRoot(4242)

		tree.terminate(root, stillAlive(), GRACE_MS)

		expect(signals).toEqual([])
	})
})

describe('posixProcessTree', () => {
	it('spawns detached so the child leads its own process group (unchanged from before the strategy split)', () => {
		expect(posixProcessTree.spawnOptions).toEqual({ detached: true })
	})

	it('falls back to the direct child and arms NO escalation when the group is already gone', async () => {
		// A pid no live group can carry: signalling its negative form throws ESRCH, which is the
		// "already reaped / never a group leader" branch of `signalGroup`.
		const { root, signals } = fakeRoot(2_147_483_647)

		posixProcessTree.terminate(root, stillAlive(), GRACE_MS)
		expect(signals).toEqual(['SIGTERM'])

		await wait(GRACE_MS * 3)
		// No SIGKILL: `signalGroup` returned false, so there was nothing left to escalate to.
		expect(signals).toEqual(['SIGTERM'])
	})

	it('a child that never got a pid is not signalled at all', () => {
		const { root, signals } = fakeRoot(undefined)
		posixProcessTree.terminate(root, stillAlive(), GRACE_MS)
		expect(signals).toEqual([])
	})
})

describe('PROCESS_TREES — the declared platform → strategy relation', () => {
	it('routes win32 to the Windows strategy and every unix-like platform to the POSIX one', () => {
		expect(PROCESS_TREES.win32.spawnOptions.detached).toBe(false)
		for (const platform of ['darwin', 'linux', 'freebsd', 'openbsd', 'netbsd', 'sunos', 'aix', 'android', 'haiku', 'cygwin'] as const) {
			expect(PROCESS_TREES[platform]).toBe(posixProcessTree)
		}
	})

	it('covers the platform this test is running on — the lookup in AgentProcess can never be undefined', () => {
		expect(PROCESS_TREES[process.platform]).toBeDefined()
	})
})

/**
 * A METADE DO TEARDOWN QUE DÁ PARA MEDIR EM QUALQUER HOST.
 *
 * O caso do neto (`teardown.test.ts` (e)) reprovou no CI do Ubuntu e passava no Windows, onde
 * `taskkill /T` anda a árvore sozinho — então a plataforma que precisava do mecanismo era a única
 * onde ele nunca era exercitado. Separar a construção da árvore da sinalização põe a lógica de volta
 * ao alcance de um teste: o snapshot é só texto.
 */
describe('posixDescendants — a árvore a partir de um snapshot `pid ppid`', () => {
	// `ps -A -o pid=,ppid=`: filho 200 do 100, neto 300 do 200, e um processo alheio que não pode entrar.
	const SNAPSHOT = `${['  100     1', '  200   100', '  300   200', '  999     1'].join('\n')}\n`

	it('desce até o NETO — o caso que o CI reprovou', () => {
		expect(posixDescendants(100, SNAPSHOT)).toContain(300)
	})

	it('entrega os MAIS FUNDOS PRIMEIRO — matar o pai antes reparenta o neto ao init', () => {
		expect(posixDescendants(100, SNAPSHOT)).toEqual([300, 200])
	})

	it('não arrasta quem não é descendente', () => {
		expect(posixDescendants(100, SNAPSHOT)).not.toContain(999)
		expect(posixDescendants(100, SNAPSHOT)).not.toContain(1)
	})

	/**
	 * O DEFEITO QUE NÃO PRECISAVA DE POSIX PARA SER VISTO, e que passou porque nada media esta parte.
	 * A versão anterior partia o stdout do `pgrep` por newline e filtrava com `Number.isInteger`; com o
	 * newline final isso rende um `''`, `Number('')` é `0`, e `0` É inteiro. O `0` entrava nos alvos —
	 * e `process.kill(0, sig)` no POSIX sinaliza O PRÓPRIO GRUPO DO CHAMADOR.
	 */
	it('NUNCA devolve 0 — `kill(0)` sinalizaria o próprio grupo do daemon', () => {
		// A linha `0 200` é o caso PATOLÓGICO que a guarda existe para barrar: um pid 0 pendurado
		// DENTRO da árvore que estamos varrendo. Sem `pid > 0` ele sai na lista de alvos e vira um
		// `process.kill(0, SIGTERM)`. (Uma linha em branco NÃO serve de prova aqui: ela vira
		// `pid=0, ppid=NaN` e já é rejeitada pela checagem do ppid — medido, o teste passava dos dois
		// jeitos e não mordia nada.)
		const comPidZero = `${SNAPSHOT}    0   200\n`
		expect(posixDescendants(100, comPidZero)).not.toContain(0)

		// E a linha em branco continua sendo ignorada, que é o caso comum do newline final.
		expect(posixDescendants(100, `${SNAPSHOT}\n   \n`)).toEqual([300, 200])
	})

	it('snapshot vazio (o `ps` faltou) devolve lista vazia, e o pai ainda é sinalizado pelo chamador', () => {
		expect(posixDescendants(100, '')).toEqual([])
	})

	it('um ciclo na tabela não trava a varredura', () => {
		expect(posixDescendants(100, ['100 200', '200 100'].join('\n'))).toEqual([200])
	})
})
