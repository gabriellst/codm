import { injectable } from 'tsyringe-neo'
import type { DependencyContainer } from 'tsyringe-neo'
import { LoggingService, type PollingService } from '@codedm/core-typescript'
import { MailboxItemKind, MailboxTargetKind } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories'
import { WorkspaceRepository } from '@workspace/repositories'
import { MailboxRepository, type ClaimedMailboxItem } from '../../repositories'
import { RunOrchestratorTurn } from '../../usecases/RunOrchestratorTurn'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { MailboxDispatcher } from './MailboxDispatcher'

/** How long a claimed item stays leased before a crashed worker's item becomes claimable again. */
const LEASE_MS = 10 * 60 * 1000
/** Past this many failed turns an item is POISONED rather than retried — it is blocking its target. */
const MAX_ATTEMPTS = 3
const POLL_MIN_MS = 250
/**
 * The idle ceiling — deliberately LOW for a conversational product.
 *
 * This is the worst-case wait between an item being queued and a turn starting, and a human is on the
 * other end of it. The outbox dispatcher next door backs off to 30s because nobody is watching a
 * projection catch up; here, 15s of silence after "@agente ..." reads as the product being broken.
 * Measured, not guessed: at 15s an e2e spec that polls for 20s went to 24s and timed out under
 * contention — the turn was correct and simply late.
 */
const POLL_MAX_MS = 2_000
const POLL_BACKOFF_FACTOR = 2
/**
 * How many turns may be in flight AT ONCE, across DIFFERENT targets.
 *
 * Per-target exclusion is the queue's job (`claimNext` skips a target that already has a lease), so
 * this only bounds how many CONVERSATIONS advance simultaneously — each one spawns a provider CLI,
 * which is the real resource.
 */
const MAX_CONCURRENT_TURNS = 4

/**
 * The concrete scheduler (§7.4). See `MailboxDispatcher` for WHY each property exists.
 *
 * ### Why `drain()` loops instead of claiming once per tick
 * A tick that handled one item would make throughput a function of the poll interval, and the
 * end-of-turn re-poll would be indistinguishable from "wait for the next tick". Looping until
 * `claimNext` comes back empty means a target with three queued messages answers all three in one
 * pass, in order — and the loop IS the re-poll, which is why it needs no separate mechanism.
 */
@injectable()
export class DrizzleMailboxDispatcher extends MailboxDispatcher implements PollingService {
	private timer: ReturnType<typeof setTimeout> | null = null
	private stopping = false
	private draining: Promise<number> | null = null
	private pollIntervalMs = POLL_MIN_MS
	private readonly workerId = `mailbox-${crypto.randomUUID()}`

	/**
	 * "Meu timer de poll está armado" — e aqui `timer` SOZINHO mentiria.
	 *
	 * `start()` termina em `void this.tick()`, e o timer só é setado DEPOIS do primeiro `drain()` —
	 * que é a varredura de boot (a que reclama itens deixados leased por um processo morto no meio de
	 * um turno). Só `timer` reportaria NOT-READY durante toda essa varredura, que é exatamente a
	 * janela em que o probe de readiness pergunta. `draining` é setado por `drain()` e anulado no
	 * `.finally`, cobrindo precisamente essa janela.
	 */
	get running(): boolean {
		return this.timer !== null || this.draining !== null
	}

	constructor(
		private readonly mailbox: MailboxRepository,
		private readonly threads: ThreadRepository,
		private readonly workspaces: WorkspaceRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	private container: DependencyContainer | null = null

	bind(container: DependencyContainer): this {
		this.container = container
		return this
	}

	/**
	 * Resolve a use case AND BIND ITS CONTAINER — the shape `CommandQueue.registerCommandHandler` uses.
	 *
	 * A `Handler` needs `_container` to open transactions and reach the domain-event repository, and it
	 * gets one in exactly two ways: the bounded-context pipeline binds registered handlers, or a caller
	 * binds explicitly. `bindContainer` also CASCADES to child handlers — which is why the old
	 * `RunIssueTurnOnClassification` could constructor-inject `RunIssueTurn` and have it work: the
	 * event-handler pipeline bound the parent, and the parent bound the child.
	 *
	 * This dispatcher is NOT a handler, so nothing binds it and nothing cascades. Constructor-injecting
	 * the use cases therefore produced instances that threw on their first transaction — every turn,
	 * with the item retried to poison. Caught by a flow test; `tsc` and every unit test were green,
	 * because a unit test constructs the use case itself and binds it.
	 */
	private handlerFor<T>(HandlerClass: new (...args: never[]) => T): T {
		if (!this.container) throw new Error('MailboxDispatcher.bind(container) was never called — no turn can be resolved')
		const c = this.container
		return (c.resolve(HandlerClass as never) as { bindContainer: (x: DependencyContainer) => T }).bindContainer(c)
	}

	start(): void {
		if (this.timer) return
		this.stopping = false
		// THE BOOT SWEEP. Not a special code path — the ordinary drain already claims anything whose
		// lease has expired, and a process that died mid-turn left exactly that. Saying it out loud
		// because "recover orphaned work on startup" reads like a missing feature otherwise.
		// Logged for the same reason the OutboxDispatcher logs its own start: the ONLY symptom of this
		// never being called is a product that queues turns and answers nothing. A boot line makes "is
		// the consumer alive?" answerable from a log rather than from a debugger. Via `LoggingService`
		// and not `console` — the sibling gets away with the latter only because it lives in `core/`,
		// outside the reach of the console-discipline rail, which is a quirk of scope rather than a
		// licence.
		this.logging.info({
			content: {
				message: 'MailboxDispatcher started',
				pollMinMs: POLL_MIN_MS,
				pollMaxMs: POLL_MAX_MS,
				leaseMs: LEASE_MS,
				maxAttempts: MAX_ATTEMPTS,
			},
		})
		void this.tick()
	}

	async stop(): Promise<void> {
		this.stopping = true
		if (this.timer) clearTimeout(this.timer)
		this.timer = null
		// Let an in-flight turn finish rather than abandoning it leased: the operator is waiting for
		// that reply, and killing it here would strand the item until the lease expired.
		await this.draining
	}

	async drain(): Promise<number> {
		// Re-entrancy guard: a tick that fired while a drain was still running would claim items the
		// running drain is about to claim, and both would run turns for different targets — legal, but
		// it makes the concurrency unbounded and the logs unreadable.
		if (this.draining) return this.draining
		this.draining = this.drainLoop().finally(() => {
			this.draining = null
		})
		return this.draining
	}

	/**
	 * Claim and run until nothing is claimable and nothing is in flight.
	 *
	 * ### Turns for DIFFERENT targets overlap — and getting this wrong re-created the bug the pivot exists to fix
	 * The first version awaited each turn before claiming the next. Per-target exclusion still held, so
	 * every test passed and the property looked satisfied — but it serialized ALL targets behind one
	 * another, which is precisely what §3 says the old outbox dispatcher did wrong and what the mailbox
	 * was introduced to stop. Two conversations could not advance at once; the second waited for the
	 * first CLI to finish. It surfaced as two e2e specs passing alone and failing together.
	 *
	 * `claimNext` already refuses a target that holds a lease, so overlapping claims can only ever
	 * return DIFFERENT targets — the exclusion is the queue's, not this loop's.
	 *
	 * ### The end-of-turn re-poll (AC-T5.3) is the `continue` after a completion
	 * When a turn settles, its target is free and the loop immediately tries to claim again — so a
	 * second message that arrived mid-turn is answered at once rather than at the next tick.
	 */
	private async drainLoop(): Promise<number> {
		let handled = 0
		const inflight = new Set<Promise<void>>()

		for (;;) {
			const item = inflight.size < MAX_CONCURRENT_TURNS ? await this.mailbox.claimNext(this.workerId, LEASE_MS) : undefined

			if (item) {
				handled++
				const turn = this.runTurn(item).finally(() => inflight.delete(turn))
				inflight.add(turn)
				continue
			}

			// Nothing claimable. If nothing is running either, the queue is drained.
			if (inflight.size === 0) return handled
			// Otherwise wait for ONE turn to settle — which frees its target and may unblock its own
			// next item — then try again. This is both the concurrency cap and the re-poll.
			await Promise.race(inflight)
		}
	}

	private async runTurn(item: ClaimedMailboxItem): Promise<void> {
		try {
			if (item.targetKind === MailboxTargetKind.THREAD) await this.runThreadTurn(item)
			else await this.runIssueWork(item)
			await this.mailbox.complete(item.id)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.logging.error({
				content: {
					message: 'mailbox turn failed',
					itemId: item.id,
					targetKind: item.targetKind,
					targetId: item.targetId,
					attempts: item.attempts,
					error: message,
				},
			})
			// attempts++ and the lease released. Past MAX_ATTEMPTS the row is poisoned — it is ordered
			// AHEAD of everything else for its target, so retrying forever would silence that thread.
			await this.mailbox.fail(item.id, message, MAX_ATTEMPTS)
		}
	}

	/**
	 * A THREAD item is a turn of the orchestrator (§7.4). The run context — which CLI, which directory —
	 * is resolved HERE rather than carried in the payload, because it is a property of the thread NOW
	 * and an item may have been queued minutes ago; a workspace rebound in between should take effect.
	 */
	private async runThreadTurn(item: ClaimedMailboxItem): Promise<void> {
		const thread = await this.threads.findById(item.targetId)
		if (!thread) return this.dropSilently(item, 'thread no longer exists')

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) return this.dropSilently(item, 'workspace no longer bound')

		const provider = thread.providers[0]
		if (!provider) return this.dropSilently(item, 'thread has no provider')

		const payload = item.payload as { entryId?: string; originEntryId?: string }
		await this.handlerFor(RunOrchestratorTurn).execute({
			ownerId: item.ownerId,
			threadId: item.targetId,
			workspacePath: workspace.path,
			provider,
			item: item.payload as Parameters<RunOrchestratorTurn['execute']>[0]['item'],
			// Only an OPERATOR_MESSAGE has an originating entry; an ISSUE_RESULT turn is triggered by a
			// subagent finishing, and the entry it will CITE is carried on the item, not on the token.
			entryId: item.kind === MailboxItemKind.OPERATOR_MESSAGE ? payload.entryId : undefined,
			// The entry the finished issue must QUOTE (§7.6). It rides the ISSUE_RESULT item rather than
			// the run-token claims, because this turn was triggered by a subagent finishing, not by a
			// message — there is no entry to mint a claim from.
			originEntryId: item.kind === MailboxItemKind.ISSUE_RESULT ? payload.originEntryId : undefined,
		})
	}

	/**
	 * An ISSUE item is a subagent turn. `WORK` is the first one; `STEER` is a MID-FLIGHT redirection.
	 *
	 * Both run the same use case — what differs is only the PROMPT, because a steer continues an
	 * existing CLI session (`--resume` keeps the work context) and just tells it something new. Modelling
	 * steer as its own use case would have duplicated provider resolution, the session plan and the
	 * outcome persistence to change one string.
	 *
	 * The per-target lease is what makes a steer safe with a turn already in flight: the item simply
	 * waits for the lease rather than racing the running turn — no retry-throw, no interleaving.
	 */
	private async runIssueWork(item: ClaimedMailboxItem): Promise<void> {
		const payload = item.payload as {
			threadId: string
			key: string
			title: string
			goal?: string
			text?: string
			provider: string
			originEntryId?: string
		}
		const thread = await this.threads.findById(payload.threadId)
		if (!thread) return this.dropSilently(item, 'thread no longer exists')

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) return this.dropSilently(item, 'workspace no longer bound')

		await this.handlerFor(RunIssueTurn).execute({
			ownerId: item.ownerId,
			issueId: item.targetId,
			threadId: payload.threadId,
			key: payload.key,
			title: payload.title,
			provider: thread.providers[0] ?? (payload.provider as never),
			workspacePath: workspace.path,
			// The issue OWNS its goal since the pivot — the prompt is what the operator asked for, not
			// the raw inbound text re-read from a transcript. A STEER carries its own text instead: the
			// session is resumed, so the turn needs the NEW instruction, not the original brief again.
			prompt: item.kind === MailboxItemKind.STEER ? (payload.text ?? '') : (payload.goal ?? ''),
			messageId: item.id,
			// Carried through so `persistOutcome` can put it on the ISSUE_RESULT it queues.
			originEntryId: payload.originEntryId,
		})
	}

	/**
	 * A precondition that will never become true again — the thread was detached, the workspace
	 * unbound. Completed rather than failed: `fail` would retry three times and then poison, which
	 * spends three CLI spawns and leaves a dead row implying something is wrong. Logged at `warn`
	 * because a vanished target IS worth noticing, just not worth retrying.
	 */
	private async dropSilently(item: ClaimedMailboxItem, why: string): Promise<void> {
		this.logging.warn({
			content: { message: `mailbox item dropped — ${why}`, itemId: item.id, targetKind: item.targetKind, targetId: item.targetId },
		})
		await this.mailbox.complete(item.id)
	}

	private async tick(): Promise<void> {
		if (this.stopping) return
		let handled = 0
		try {
			handled = await this.drain()
		} catch (error) {
			this.logging.error({ content: { message: 'mailbox drain failed', error: error instanceof Error ? error.message : String(error) } })
		}
		// Busy → poll fast; idle → back off. A conversation is bursty, so the floor matters more than
		// the ceiling: the first message after a quiet hour should not wait 15 seconds for a tick.
		this.pollIntervalMs = handled > 0 ? POLL_MIN_MS : Math.min(this.pollIntervalMs * POLL_BACKOFF_FACTOR, POLL_MAX_MS)
		if (this.stopping) return
		this.timer = setTimeout(() => void this.tick(), this.pollIntervalMs)
	}
}
