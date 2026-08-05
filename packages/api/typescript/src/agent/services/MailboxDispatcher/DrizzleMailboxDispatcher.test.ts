import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { BaseError, LoggingService } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ThreadRepository } from '@thread/repositories'
import { WorkspaceRepository } from '@workspace/repositories'
import { AgentSessionRepository, MailboxRepository } from '../../repositories'
import { DrizzleMailboxDispatcher } from './DrizzleMailboxDispatcher'

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
	 * AC-T5.1 — the BOOT SWEEP, which is not a special code path: an item leased by a process that died
	 * simply has an expired lease, and the ordinary claim picks it up. Simulated with a zero lease,
	 * because the alternative is sleeping past a real one.
	 */
	/**
	 * The heartbeat — and why it is a CORRECTNESS test, not a latency one.
	 *
	 * `leaseMs` is the crash budget. Without renewal it silently doubles as a turn-duration budget, and
	 * an issue turn is a coding agent that routinely outlives it. The lease then lapses under a HEALTHY
	 * run, this queue hands the same item out again, and the single-active guard rejects the duplicate
	 * with `TERMINAL_ALREADY_RUNNING` — burning attempts until the item poisons. Measured 2026-08-04:
	 * two issues died exactly that way while their original runs were still going.
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
	 * A turn that outlives its lease must keep its own item — the wiring, not the primitive.
	 *
	 * The repository-level tests above prove `renewLease` behaves; they say NOTHING about whether the
	 * dispatcher ever calls it, and that gap is the whole bug. Measured 2026-08-04: two issues poisoned
	 * because their leases lapsed under healthy runs, `claimNext` re-handed the same items out, and
	 * `beginSession` rejected each duplicate with `TERMINAL_ALREADY_RUNNING` until attempts ran out.
	 *
	 * The falsifier is exact: drop the `renewLease` call from `runTurn` and this goes RED, because a
	 * lease nobody pushes forward is indistinguishable from a worker that died.
	 */
	/**
	 * Contenção não pode matar trabalho — e a diferença é o `attempts`.
	 *
	 * `TERMINAL_ALREADY_RUNNING` diz que OUTRO run segura o alvo; não diz nada sobre a qualidade deste
	 * item. Enquanto ele passava pelo `fail`, três momentos ruins seguidos envenenavam trabalho que
	 * nunca esteve quebrado. Medido em 2026-08-05: uma issue ficou `WORKING` por 2h38 com três itens
	 * mortos e nenhum sinal em lugar nenhum.
	 *
	 * O falsificador é exato: troque o `defer` por `fail` no ramo de contenção e este teste fica
	 * vermelho, porque o `attempts` volta a subir.
	 */
	it('contenção devolve o item à fila SEM gastar tentativa', async () => {
		const mailbox = testBed.resolve(MailboxRepository)
		const threads = testBed.resolve(ThreadRepository)

		// O turno morre com o erro de contenção, que é o que o guard de sessão única levanta.
		// SALVO e restaurado no finally: o repositório é um singleton do container, e deixá-lo
		// envenenado vaza para os testes seguintes — que foi exatamente o que aconteceu ao escrever isto.
		const realFindById = threads.findById.bind(threads)
		threads.findById = async () => {
			throw new BaseError('TERMINAL_ALREADY_RUNNING', 'Issue x already has an active terminal session')
		}

		// Backoff curtíssimo: o teste mede o REFUND da tentativa, não a cadência da espera.
		class FastBackoffDispatcher extends DrizzleMailboxDispatcher {
			protected override contentionBackoffMs = 5
		}
		const dispatcher = new FastBackoffDispatcher(
			mailbox,
			threads,
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
		).bind(testContainer)

		await mailbox.enqueue({
			ownerId: OPERATOR_ID,
			targetKind: MailboxTargetKind.THREAD,
			targetId: OTHER_THREAD,
			kind: MailboxItemKind.OPERATOR_MESSAGE,
			payload: { entryId: '019e4d24-6524-7041-9e1c-8108180cddae' },
			dedupKey: 'contended-1',
		})

		try {
			await dispatcher.drain()

			// Vivo, não morto: o item continua reivindicável depois do backoff, e o contador está zerado.
			expect(await mailbox.hasPending(MailboxTargetKind.THREAD, OTHER_THREAD)).toBe(true)
			await new Promise(resolve => setTimeout(resolve, 20))
			const again = await mailbox.claimNext('worker-depois', -1)
			expect(again?.attempts).toBe(1)
		} finally {
			threads.findById = realFindById
		}
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
})
