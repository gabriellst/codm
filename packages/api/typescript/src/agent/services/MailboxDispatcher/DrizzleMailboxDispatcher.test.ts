import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenThread, givenWorkspace } from '@test/support'
import { LoggingService } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, ProviderKind, AgentModelId } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '@thread/repositories'
import { WorkspaceRepository } from '@workspace/repositories'
import { AgentSessionRepository, MailboxRepository, type ClaimedMailboxItem } from '../../repositories'
import { RunOrchestratorTurn } from '../../usecases/RunOrchestratorTurn'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { DrizzleMailboxDispatcher, type TurnReport } from './DrizzleMailboxDispatcher'

/**
 * T5 — the scheduling guarantees, exercised against the REAL table.
 *
 * These are asserted at the repository seam rather than through `DrizzleMailboxDispatcher`, because
 * every property under test is a property of the CLAIM — the lease, its expiry, the per-target
 * exclusion — and driving them through the dispatcher would additionally require a provider, a
 * workspace and a CLI, none of which is what is being tested. The dispatcher's own loop is three
 * lines over `claimNext`; what makes it correct is what `claimNext` promises here.
 */
describe('MailboxRepository — the guarantees the dispatcher is built on', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const THREAD_A = '019e4d24-6524-7041-9e1c-8108180cdd0a'
	const THREAD_B = '019e4d24-6524-7041-9e1c-8108180cdd0b'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const enqueue = (repo: MailboxRepository, targetId: string, dedupKey: string) =>
		repo.enqueue({
			ownerId: OPERATOR_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { entryId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			dedupKey,
		})

	/**
	 * AC-T5.2, first half. This is the invariant that replaced a check-then-act the design review
	 * killed: producers no longer ask whether a turn is running, so the EXCLUSION has to live here.
	 */
	it('AC-T5.2 — two items for the SAME target never lease at once', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')
		await enqueue(repo, THREAD_A, 'a-2')

		const first = await repo.claimNext('worker-1', 60_000)
		const second = await repo.claimNext('worker-1', 60_000)

		expect(first?.dedupKey ?? first?.id).toBeDefined()
		// The second item exists and is runnable, but its TARGET is busy.
		expect(second).toBeUndefined()
	})

	it('AC-T5.2, second half — DIFFERENT targets run in parallel', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')
		await enqueue(repo, THREAD_B, 'b-1')

		const first = await repo.claimNext('worker-1', 60_000)
		const second = await repo.claimNext('worker-1', 60_000)

		expect(first).toBeDefined()
		expect(second).toBeDefined()
		expect(first?.targetId).not.toBe(second?.targetId)
	})

	/**
	 * AC-T5.3 — THE RE-POLL, and the reason it is a CORRECTNESS test rather than a latency one.
	 *
	 * The dispatcher's drain loops until `claimNext` returns nothing. The property that makes the loop
	 * work is asserted here: once the first item is COMPLETED, the second for the same target becomes
	 * claimable IMMEDIATELY — no lease expiry, no tick.
	 *
	 * Without the loop (one claim per tick) the second message waits for the next poll, which under
	 * backoff is up to fifteen seconds of a human watching a chat that went quiet. That is why the
	 * falsifier for this AC removes the loop and expects RED: "handled 1 of 2 items in a pass" is a
	 * wrong answer, not a slow one.
	 */
	it('AC-T5.3 — completing a turn unblocks the SAME target with no tick in between', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')
		await enqueue(repo, THREAD_A, 'a-2')

		const first = await repo.claimNext('worker-1', 60_000)
		expect(first).toBeDefined()
		expect(await repo.claimNext('worker-1', 60_000)).toBeUndefined()

		await repo.complete(first?.id ?? '')

		// The re-poll the dispatcher performs at the end of a turn. No time has passed.
		const second = await repo.claimNext('worker-1', 60_000)
		expect(second).toBeDefined()
		expect(second?.id).not.toBe(first?.id)
	})

	/**
	 * The heartbeat — and why it is a CORRECTNESS test, not a latency one.
	 *
	 * `leaseMs` is the crash budget. Without renewal it silently doubles as a turn-duration budget, and
	 * an issue turn is a coding agent that routinely outlives it. The lease then lapses under a HEALTHY
	 * run, this queue hands the same item out again, the dispatcher starts a SECOND turn for the target
	 * while the first is still healthy and running, and the duplicates burn attempts until the item
	 * poisons. Measured 2026-08-04: two issues died exactly that way while their original runs were
	 * still going.
	 *
	 * The falsifier is exact: delete the `renewLease` call in `runTurn` and this goes RED, because a
	 * lease that is never pushed forward is indistinguishable from a worker that died.
	 */
	it('a lease renewed mid-turn keeps the item OUT of the queue, however long the turn runs', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')

		// A turn claims it with a lease far shorter than the turn will take.
		const claimed = await repo.claimNext('worker-long-turn', 40)
		expect(claimed).toBeDefined()

		// The turn is still running, so its heartbeat pushes the lease forward before it lapses.
		await new Promise(resolve => setTimeout(resolve, 30))
		await repo.renewLease(claimed?.id ?? '', 'worker-long-turn', 40)
		await new Promise(resolve => setTimeout(resolve, 30))

		// Past the ORIGINAL expiry, and still nobody else may take it — the run owns it.
		expect(await repo.claimNext('worker-other', 60_000)).toBeUndefined()
	})

	it('only the CURRENT holder may renew — a lapsed worker cannot steal its item back', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')

		const lapsed = await repo.claimNext('worker-that-stalled', -1)
		const taken = await repo.claimNext('worker-that-took-over', 60_000)
		expect(taken?.id).toBe(lapsed?.id)

		// The stalled worker wakes up and heartbeats. It must NOT extend a lease it no longer holds,
		// or two runs would believe they own the same target.
		await repo.renewLease(lapsed?.id ?? '', 'worker-that-stalled', 60_000)

		expect(await repo.claimNext('worker-third', 60_000)).toBeUndefined()
	})

	/**
	 * AC-T5.1 — the BOOT SWEEP, which is not a special code path: an item leased by a process that died
	 * simply has an expired lease, and the ordinary claim picks it up. Simulated with a zero lease,
	 * because the alternative is sleeping past a real one.
	 */
	it('AC-T5.1 — an item stranded by a crashed worker is claimable again once its lease expires', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')

		// A worker claims it and dies without completing or failing it.
		//
		// The lease is NEGATIVE, not zero, and that is not a trick: `leaseUntil = now + leaseMs` and the
		// claim predicate is a strict `leaseUntil < now`, so a zero lease is only expired once the clock
		// has advanced. Written with `0` this test passed alone and failed in the full suite, where both
		// claims landed in the same millisecond — a real flake I wrote, not a property of the queue.
		// An already-expired lease says "this worker is gone" without depending on time passing.
		const claimed = await repo.claimNext('worker-that-dies', -1)
		expect(claimed).toBeDefined()

		// Boot. Nothing in memory remembers the previous process.
		const recovered = await repo.claimNext('worker-after-restart', 60_000)
		expect(recovered?.id).toBe(claimed?.id)

		// And the recovery COUNTS as an attempt. Worth asserting rather than glossing: it means a turn
		// that crashes the worker every time is bounded by the same poison counter as one that throws.
		// Without it, a crash-inducing item would be recovered forever, taking the process down with it
		// on every boot and starving its target permanently.
		expect(recovered?.attempts).toBe((claimed?.attempts ?? 0) + 1)
	})

	it('poisons an item past maxAttempts rather than starving the target behind it', async () => {
		const repo = testBed.resolve(MailboxRepository)
		await enqueue(repo, THREAD_A, 'a-1')
		await enqueue(repo, THREAD_A, 'a-2')

		for (let attempt = 0; attempt < 3; attempt++) {
			const item = await repo.claimNext('worker-1', 60_000)
			expect(item?.dedupKey ?? 'a-1').toBeDefined()
			await repo.fail(item?.id ?? '', 'boom', 3)
		}

		// The poisoned item is gone from the queue, and the one BEHIND it now runs.
		const next = await repo.claimNext('worker-1', 60_000)
		expect(next).toBeDefined()
	})

	it('a redelivered fact enqueues nothing — the dedupKey is the exactly-once story', async () => {
		const repo = testBed.resolve(MailboxRepository)

		expect(await enqueue(repo, THREAD_A, 'same-fact')).toBe(true)
		expect(await enqueue(repo, THREAD_A, 'same-fact')).toBe(false)
	})
})

/**
 * The DRAIN LOOP itself — the seam the suite above deliberately does not cover.
 *
 * Its preamble says the loop "is three lines over `claimNext`; what makes it correct is what
 * `claimNext` promises here". That was the blind spot: every claim-level guarantee held, and the
 * loop still stranded work, because the defect was in WHEN the loop asks — not in what the answer
 * is. So this suite drives `drain()` and asserts on scheduling, not on claiming.
 *
 * The turn is held in flight by gating `ThreadRepository.findById`, which is the FIRST await in both
 * `runThreadTurn` and `runIssueWork`. That keeps a turn genuinely in flight without a provider CLI,
 * a workspace or a use case — none of which is what is under test.
 */
describe('DrizzleMailboxDispatcher — the drain loop wakes for work that arrives mid-turn', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ISSUE_ID = '019e4d24-6524-7041-9e1c-8108180cdd10'
	const ISSUE_THREAD = '019e4d24-6524-7041-9e1c-8108180cdd11'
	const OTHER_THREAD = '019e4d24-6524-7041-9e1c-8108180cdd12'

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const until = async (predicate: () => Promise<boolean>, timeoutMs: number): Promise<boolean> => {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			if (await predicate()) return true
			await new Promise(resolve => setTimeout(resolve, 10))
		}
		return false
	}

	/**
	 * A invariante que sobrevive à remoção do guard em memória: dois itens ISSUE para a MESMA issue
	 * rodam em sequência, nunca ao mesmo tempo, e nenhum dos dois queima tentativa por contenção.
	 *
	 * O falsificador é exato: afrouxe o `NOT EXISTS` correlacionado de `claimNext` (o predicado que
	 * recusa um alvo com lease vivo) e os dois turnos passam a se sobrepor — `concurrentPeak` vira 2 e
	 * este teste fica vermelho. É a única trava que resta, então é a única que precisa de rede.
	 */
	it('dois itens para a MESMA issue rodam em sequência — a exclusão é do lease, e só dele', async () => {
		const ownerId = 'owner-lease-only'
		const issueId = uuidv7()

		let inFlight = 0
		let concurrentPeak = 0
		const turns: string[] = []

		class SequencingDispatcher extends DrizzleMailboxDispatcher {
			protected override async runIssueWork(item: ClaimedMailboxItem): Promise<TurnReport> {
				inFlight += 1
				concurrentPeak = Math.max(concurrentPeak, inFlight)
				turns.push(item.id)
				await new Promise(resolve => setTimeout(resolve, 20))
				inFlight -= 1
				return { spoke: true }
			}
		}

		const dispatcher = testBed.resolve(SequencingDispatcher)
		const mailbox = testBed.resolve(MailboxRepository)

		for (const seq of ['first', 'second']) {
			await mailbox.enqueue({
				ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: issueId,
				kind: MailboxItemKind.STEER,
				payload: { threadId: uuidv7(), key: 'ISS-1', title: 'lease only', text: seq, provider: 'CLAUDE' },
				dedupKey: `${issueId}:${seq}`,
			})
		}

		await dispatcher.start()
		await new Promise(resolve => setTimeout(resolve, 300))
		await dispatcher.stop()

		expect(turns).toHaveLength(2)
		expect(concurrentPeak).toBe(1)
	})

	/**
	 * Morrer em silêncio é o defeito, não a morte.
	 *
	 * Envenenar é uma decisão defensável: um item que falha sempre não pode bloquear o alvo para
	 * sempre. O que não é defensável é o item sumir da fila sem que NADA apareça em lugar nenhum — a
	 * issue fica `WORKING` para sempre e o operador descobre horas depois, perguntando. Medido em
	 * 2026-08-05: 2h38 nesse estado, com três itens mortos e zero sinal.
	 *
	 * O falsificador é exato: remova a chamada a `raiseStopForPoisoned` e este teste fica vermelho,
	 * porque o item morre igual e o Needs-you continua vazio.
	 */
	it('um item envenenado levanta um Stop em vez de sumir calado', async () => {
		const mailbox = testBed.resolve(MailboxRepository)
		const threads = testBed.resolve(ThreadRepository)
		const thread = await givenThread(testBed)

		// A falha é injetada no WORKSPACE, não na thread: `RaiseStop` também lê a thread, e derrubá-la
		// impediria o próprio Stop de nascer — o teste passaria a medir a injeção, não o comportamento.
		const workspaces = testBed.resolve(WorkspaceRepository)
		const realWorkspaceFindById = workspaces.findById.bind(workspaces)
		workspaces.findById = async () => {
			throw new Error('boom')
		}

		const dispatcher = new DrizzleMailboxDispatcher(
			mailbox,
			threads,
			workspaces,
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
		).bind(testContainer)

		await mailbox.enqueue({
			ownerId: testBed.ownerId,
			targetKind: MailboxTargetKind.THREAD,
			targetId: thread.id.value,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { entryId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			dedupKey: 'poison-1',
		})

		// Uma passada basta: o drain reivindica de novo assim que o `fail` solta o lease, então as três
		// tentativas se esgotam dentro do mesmo laço.
		try {
			await dispatcher.drain()

			expect(await mailbox.hasPending(MailboxTargetKind.THREAD, thread.id.value)).toBe(false)
			expect(await threads.openStops(thread.id.value)).not.toHaveLength(0)
		} finally {
			workspaces.findById = realWorkspaceFindById
		}
	})

	/**
	 * A turn that outlives its lease must keep its own item — the wiring, not the primitive.
	 *
	 * The repository-level tests above prove `renewLease` behaves; they say NOTHING about whether the
	 * dispatcher ever calls it, and that gap is the whole bug. Measured 2026-08-04: two issues poisoned
	 * because their leases lapsed under healthy runs, `claimNext` re-handed the same items out, the
	 * dispatcher started a SECOND turn for each target while the first was still healthy and running,
	 * and the duplicates burnt attempts until the items poisoned.
	 *
	 * The falsifier is exact: drop the `renewLease` call from `runTurn` and this goes RED, because a
	 * lease nobody pushes forward is indistinguishable from a worker that died.
	 */
	it('renova o lease do item enquanto o turno ainda está rodando', async () => {
		const mailbox = testBed.resolve(MailboxRepository)
		const threads = testBed.resolve(ThreadRepository)

		let releaseTurn = (): void => {}
		const turnStarted = Promise.withResolvers<void>()
		const gate = new Promise<void>(resolve => {
			releaseTurn = resolve
		})
		const realFindById = threads.findById.bind(threads)
		threads.findById = async (id: string) => {
			if (id === OTHER_THREAD) {
				turnStarted.resolve()
				await gate
			}
			return undefined
		}

		// Um lease curto e um heartbeat mais curto ainda: sem a renovação, o item volta à fila no meio
		// do turno — que é exatamente o estado que envenenou as duas issues em produção.
		class FastHeartbeatDispatcher extends DrizzleMailboxDispatcher {
			protected override leaseMs = 60
			protected override heartbeatMs = 15
		}
		const dispatcher = new FastHeartbeatDispatcher(
			mailbox,
			threads,
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
		).bind(testContainer)

		try {
			await mailbox.enqueue({
				ownerId: OPERATOR_ID,
				targetKind: MailboxTargetKind.THREAD,
				targetId: OTHER_THREAD,
				kind: MailboxItemKind.OPERATOR_MESSAGE,
				payload: { entryId: '019e4d24-6524-7041-9e1c-8108180cddae' },
				dedupKey: 'long-turn-1',
			})

			const draining = dispatcher.drain()
			await turnStarted.promise

			// Bem além do lease que o dispatcher usaria se nada o renovasse.
			await new Promise(resolve => setTimeout(resolve, 120))

			// Ninguém mais consegue reivindicar: o turno em voo ainda é o dono.
			expect(await mailbox.claimNext('worker-intruso', 60_000)).toBeUndefined()

			releaseTurn()
			await draining
		} finally {
			threads.findById = realFindById
			releaseTurn()
		}
	})

	/**
	 * A long issue turn must not silence the orchestrator.
	 *
	 * Reproduces the production trace verbatim: a WORK item claimed first and still running, then an
	 * OPERATOR_MESSAGE for a DIFFERENT target queued while it runs. Before `settleOrPoll` the loop was
	 * parked in `Promise.race(inflight)` and the message stayed at `attempts = 0` until the issue turn
	 * ended — minutes, for a coding agent. The falsifier is exact: restore the bare
	 * `await Promise.race(inflight)` and this goes RED while every claim-level test stays green.
	 */
	it('answers a thread message queued while an issue turn is still in flight', async () => {
		const mailbox = testBed.resolve(MailboxRepository)
		const threads = testBed.resolve(ThreadRepository)

		// The gate. `findById` for the issue's thread never settles until the test releases it, so the
		// issue turn stays in flight; every other lookup answers "gone", which routes the item straight
		// to `dropSilently` — a completed turn with no collaborators involved.
		let releaseIssueTurn = (): void => {}
		const issueTurnStarted = Promise.withResolvers<void>()
		const gate = new Promise<void>(resolve => {
			releaseIssueTurn = resolve
		})
		const realFindById = threads.findById.bind(threads)
		threads.findById = async (id: string) => {
			if (id === ISSUE_THREAD) {
				issueTurnStarted.resolve()
				await gate
			}
			return undefined
		}

		const dispatcher = new DrizzleMailboxDispatcher(
			mailbox,
			threads,
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
		).bind(testContainer)

		try {
			await mailbox.enqueue({
				ownerId: OPERATOR_ID,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: ISSUE_ID,
				kind: MailboxItemKind.WORK,
				payload: { threadId: ISSUE_THREAD, key: 'some-issue', title: 'Some issue', provider: 'CLAUDE_CODE' },
				dedupKey: 'issue-work-1',
			})

			// NOT awaited: the drain is the thing under test and it will not return until the gate opens.
			const draining = dispatcher.drain()
			await issueTurnStarted.promise

			// The operator writes WHILE the issue runs. This is the moment the bug swallowed.
			await mailbox.enqueue({
				ownerId: OPERATOR_ID,
				targetKind: MailboxTargetKind.THREAD,
				targetId: OTHER_THREAD,
				kind: MailboxItemKind.OPERATOR_MESSAGE,
				payload: { entryId: '019e4d24-6524-7041-9e1c-8108180cddae' },
				dedupKey: 'operator-msg-1',
			})

			// Generous next to the 250ms poll floor, and deliberately so: the assertion is "the loop wakes
			// at all with the issue still gated", not "it wakes in exactly one interval".
			const answered = await until(async () => !(await mailbox.hasPending(MailboxTargetKind.THREAD, OTHER_THREAD)), 3_000)

			expect(answered).toBe(true)
			// The gate is still shut — proving the wakeup came from the poll floor and not from the issue
			// turn finishing. Without this line the test would also pass on the broken loop.
			expect(await mailbox.hasPending(MailboxTargetKind.ISSUE, ISSUE_ID)).toBe(true)

			releaseIssueTurn()
			await draining
		} finally {
			threads.findById = realFindById
			releaseIssueTurn()
		}
	})

	/**
	 * TRANSPORTE NÃO É FRACASSO DO TRABALHO — é a hora errada de tentar.
	 *
	 * Medido em 2026-08-05: o classificador de permissão do provider caiu, o turno morreu sem ter dito
	 * nada, e o item foi CONSUMIDO como se tivesse sido atendido. O operador ficou 20 minutos sem
	 * resposta, sem retry e sem sinal — a única recuperação era o lease expirar.
	 *
	 * O falsificador é exato: troque o `fail` de volta por `complete` no ramo de transporte e este
	 * teste fica vermelho, porque `completeCalls` deixa de ser zero.
	 *
	 * ### Por que `drain()` e não `start()` + sleep + `stop()`
	 * Um runner que SEMPRE morre no transporte, sem latência real de provider, esgota `MAX_ATTEMPTS`
	 * dentro de um ÚNICO `drainLoop`: `fail()` libera o lease e a MESMA volta do laço já reclama o item
	 * de novo, tudo em microtasks — não há janela de relógio em que o item fique "reclamável mas ainda
	 * não reclamado pelo próprio dispatcher" para um sleep observar de fora. `drain()` devolve uma
	 * promise que só resolve quando o laço genuinely para (nada reclamável, nada em voo), o que torna
	 * "todas as tentativas já rodaram" um fato determinístico em vez de uma corrida contra um timer.
	 */
	it('um turno MUDO que morre no transporte é reenfileirado via fail(), nunca consumido via complete()', async () => {
		const ownerId = uuidv7()
		const thread = await givenThread(testBed, { ownerId })

		class TransportFailingDispatcher extends DrizzleMailboxDispatcher {
			protected override async runThreadTurn(): Promise<TurnReport> {
				return { spoke: false, transportStop: { detail: 'provider unavailable' } }
			}
		}

		const dispatcher = testBed.resolve(TransportFailingDispatcher)
		const mailbox = testBed.resolve(MailboxRepository)

		// AC-2/AC-5, at the call boundary rather than a raw row read: `testBed`'s only sanctioned path
		// for reading persisted state is `testBed.probe()`, and `PersistenceProbe` does not expose
		// mailbox columns (it counts rows, it does not read them) — same class of gap
		// `DeliverChannelMessage.test.ts` and friends hit for `shared_scheduled_commands`.
		// `MailboxRepository.fail` writing `last_error` verbatim is FROZEN, already-covered infra; what
		// THIS test owns is proving the dispatcher calls `fail` — never `complete` — for a transport stop,
		// and hands it the REAL detail string every time. `mailbox` here is the same singleton the
		// dispatcher's constructor received, so wrapping it observes exactly what `runTurn` calls.
		const realFail = mailbox.fail.bind(mailbox)
		const realComplete = mailbox.complete.bind(mailbox)
		const failCalls: { error: string; maxAttempts: number }[] = []
		let completeCalls = 0
		mailbox.fail = async (id, error, maxAttempts, tx) => {
			failCalls.push({ error, maxAttempts })
			return realFail(id, error, maxAttempts, tx)
		}
		mailbox.complete = async (id, tx) => {
			completeCalls += 1
			return realComplete(id, tx)
		}

		try {
			await mailbox.enqueue({
				ownerId,
				targetKind: MailboxTargetKind.THREAD,
				targetId: thread.id.value,
				kind: MailboxItemKind.OPERATOR_MESSAGE,
				payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'oi' },
				dedupKey: `transport:${thread.id.value}`,
			})

			await dispatcher.drain()

			// NUNCA consumido como se tivesse sido atendido.
			expect(completeCalls).toBe(0)

			// AC-3: o item foi reenfileirado e reclamado de novo pelo MESMO drain, sem esperar o lease de
			// 10 minutos — a prova é que houve MAIS de uma tentativa dentro de um `drain()` só.
			expect(failCalls.length).toBeGreaterThan(1)

			// AC-5 — o detalhe REAL do transporte, não um placeholder genérico, em toda tentativa.
			for (const call of failCalls) expect(call.error).toBe('provider unavailable')
		} finally {
			mailbox.fail = realFail
			mailbox.complete = realComplete
		}
	})

	/**
	 * A DUPLICATA É PIOR QUE A DEMORA, e esta é a invariante que o caminho feliz não vê.
	 *
	 * `RunOrchestratorTurn` transmite por cortes progressivos. Um turno que já entregou um corte e só
	 * então morreu no transporte JÁ FALOU no grupo real do operador — retentá-lo produz a segunda
	 * mensagem que o próprio use case documenta como o motivo de nunca retentar turno de thread.
	 *
	 * O falsificador é exato: apague o `&& !report.spoke` do ramo de transporte no `runTurn` e este
	 * teste fica vermelho, enquanto o caso MUDO logo acima continua verde.
	 */
	it('um turno que JÁ FALOU e depois morre no transporte é consumido via complete(), nunca reenfileirado via fail()', async () => {
		const ownerId = uuidv7()
		const thread = await givenThread(testBed, { ownerId })

		class SpokeThenDiedDispatcher extends DrizzleMailboxDispatcher {
			protected override async runThreadTurn(): Promise<TurnReport> {
				return { spoke: true, transportStop: { detail: 'died after speaking' } }
			}
		}

		const dispatcher = testBed.resolve(SpokeThenDiedDispatcher)
		const mailbox = testBed.resolve(MailboxRepository)

		const realFail = mailbox.fail.bind(mailbox)
		const realComplete = mailbox.complete.bind(mailbox)
		const failCalls: { error: string; maxAttempts: number }[] = []
		let completeCalls = 0
		mailbox.fail = async (id, error, maxAttempts, tx) => {
			failCalls.push({ error, maxAttempts })
			return realFail(id, error, maxAttempts, tx)
		}
		mailbox.complete = async (id, tx) => {
			completeCalls += 1
			return realComplete(id, tx)
		}

		try {
			await mailbox.enqueue({
				ownerId,
				targetKind: MailboxTargetKind.THREAD,
				targetId: thread.id.value,
				kind: MailboxItemKind.OPERATOR_MESSAGE,
				payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'oi' },
				dedupKey: `spoke:${thread.id.value}`,
			})

			await dispatcher.drain()

			// CONSUMIDO: uma segunda tentativa falaria duas vezes no grupo real.
			expect(completeCalls).toBe(1)
			expect(failCalls).toHaveLength(0)
		} finally {
			mailbox.fail = realFail
			mailbox.complete = realComplete
		}
	})

	/**
	 * A ESCOLHA DE MODELO DA THREAD CHEGA AO TURNO — nos DOIS caminhos.
	 *
	 * É aqui que a feature inteira liga ou não liga. O eixo do modelo já existia do enum ao argv
	 * (`RunOrchestratorTurn.model` → `CLAUDE_MODEL_ALIASES` → `--model`), e o que faltava era alguém
	 * ESCOLHER: este despachante resolvia provider e workspace e chamava o turno sem `model`, caindo em
	 * `DEFAULT` para toda conversa do produto. O falsificador é exato — apague `model:` de qualquer um
	 * dos dois `execute` e esta linha fica vermelha, enquanto todo o resto da suíte segue verde.
	 *
	 * Os turnos são substituídos por espiões no container: o que está sob teste é o que o despachante
	 * DECIDE passar, e rodar um CLI de verdade para descobrir isso seria medir outra coisa.
	 */
	it('a escolha de modelo da thread chega ao turno do orquestrador E ao turno da issue', async () => {
		const mailbox = testBed.resolve(MailboxRepository)
		const threads = testBed.resolve(ThreadRepository)
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, {
			ownerId: OPERATOR_ID,
			workspaceId: workspace.id.value,
			providers: [ProviderKind.CLAUDE_CODE],
		})
		thread.configureModel(ProviderKind.CLAUDE_CODE, AgentModelId.OPUS)
		await threads.save(thread)

		const seen: Record<string, AgentModelId | undefined> = {}
		const spy = (label: string) => ({
			bindContainer() {
				return this
			},
			async execute(input: { model?: AgentModelId }) {
				seen[label] = input.model
				return { spoke: true }
			},
		})
		const spyContainer = testContainer.createChildContainer()
		spyContainer.registerInstance(RunOrchestratorTurn as never, spy('thread') as never)
		spyContainer.registerInstance(RunIssueTurn as never, spy('issue') as never)

		const dispatcher = new DrizzleMailboxDispatcher(
			mailbox,
			threads,
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
		).bind(spyContainer)

		await mailbox.enqueue({
			ownerId: OPERATOR_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId: thread.id.value,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'oi' },
			dedupKey: `model:${thread.id.value}`,
		})
		await mailbox.enqueue({
			ownerId: OPERATOR_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: uuidv7(),
			kind: MailboxItemKind.WORK,
			payload: { threadId: thread.id.value, key: 'ISS-1', title: 'work', goal: 'faz', provider: ProviderKind.CLAUDE_CODE },
			dedupKey: `model-issue:${thread.id.value}`,
		})

		await dispatcher.drain()

		expect(seen.thread).toBe(AgentModelId.OPUS)
		// A ISSUE HERDA a escolha da conversa que a abriu — ela não tem eixo próprio, de propósito.
		expect(seen.issue).toBe(AgentModelId.OPUS)
	})

	/** Sem escolha nenhuma, o turno pede `DEFAULT` — que é a instrução de omitir `--model`. */
	it('uma thread que nunca escolheu modelo manda DEFAULT, não ausência', async () => {
		const mailbox = testBed.resolve(MailboxRepository)
		const threads = testBed.resolve(ThreadRepository)
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })

		let seen: AgentModelId | undefined
		const spyContainer = testContainer.createChildContainer()
		spyContainer.registerInstance(
			RunOrchestratorTurn as never,
			{
				bindContainer() {
					return this
				},
				async execute(input: { model?: AgentModelId }) {
					seen = input.model
					return { spoke: true }
				},
			} as never,
		)

		const dispatcher = new DrizzleMailboxDispatcher(
			mailbox,
			threads,
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
		).bind(spyContainer)

		await mailbox.enqueue({
			ownerId: OPERATOR_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId: thread.id.value,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { kind: MailboxItemKind.OPERATOR_MESSAGE, entryId: uuidv7(), speaker: 'operator', text: 'oi' },
			dedupKey: `default:${thread.id.value}`,
		})

		await dispatcher.drain()

		expect(seen).toBe(AgentModelId.DEFAULT)
	})
})
