import { injectable } from 'tsyringe-neo'
import type { DependencyContainer } from 'tsyringe-neo'
import { LoggingService, type PollingService } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { RaiseStop } from '@thread/usecases/RaiseStop'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { AgentSessionRepository } from '../../repositories/AgentSessionRepository'
import { MailboxRepository, type ClaimedMailboxItem } from '../../repositories/MailboxRepository'
import { RunOrchestratorTurn } from '../../usecases/RunOrchestratorTurn'
import { RunIssueTurn } from '../../usecases/RunIssueTurn'
import { MailboxDispatcher } from './MailboxDispatcher'

/** How long a claimed item stays leased before a crashed worker's item becomes claimable again. */
const LEASE_MS = 10 * 60 * 1000
/**
 * How often a RUNNING turn pushes its own lease forward.
 *
 * A third of the lease, so two consecutive heartbeats can be lost before the item looks abandoned —
 * the point is to survive a hiccup, not to be exact.
 */
const HEARTBEAT_MS = LEASE_MS / 3
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
 * What a turn reports back to `runTurn`, which is the ONLY place that writes to the mailbox.
 *
 * `spoke` exists because retrying is not always safe: `RunOrchestratorTurn` streams via progressive
 * cuts, so a turn that already delivered a cut and only then died has ALREADY SPOKEN in the operator's
 * real chat, and a second attempt would produce a second message. `transportStop` without `spoke` is
 * the only combination that returns the item to the queue.
 *
 * `dropped` distinguishes "the target vanished" (a detached thread, an unbound workspace) from "the
 * turn ran": `dropSilently` no longer writes to the mailbox on its own — the double-write it used to do
 * here was harmless while `complete` was the only outcome, and becomes ambiguous now that there are two.
 */
export interface TurnReport {
	spoke: boolean
	transportStop?: { detail: string }
	dropped?: boolean
}

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
export class LibSqlMailboxDispatcher extends MailboxDispatcher implements PollingService {
	private timer: ReturnType<typeof setTimeout> | null = null
	private stopping = false
	/**
	 * Lease and heartbeat as FIELDS rather than bare constants — so a turn can be driven long enough to
	 * observe a renewal without a test sleeping for ten minutes.
	 *
	 * These are extension points, not test backdoors: production never reassigns them, the defaults are
	 * the only values that ship, and no branch reads them. The alternative is what shipped the bug this
	 * fixes — scheduling wiring nobody could exercise, excused by the comment "the loop is three lines
	 * over `claimNext`". A property that cannot be tested is a property that is not true yet.
	 */
	protected leaseMs = LEASE_MS
	protected heartbeatMs = HEARTBEAT_MS
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
		// Read-only here: the dispatcher never writes a session row (`RunIssueTurn` owns that). It reads
		// the cursor an issue's session is standing on, so the turn it drives can say where it continues
		// from — see `runIssueWork`.
		private readonly sessions: AgentSessionRepository,
		private readonly logging: LoggingService,
		// SP2 T7 — the login gate (AC-4). LAST param, additive: every pre-existing call site keeps its
		// first five positional args unchanged. See the gate itself, at the top of `drainLoop`, for why.
		private readonly cloudSession: CloudSession,
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
	 *
	 * ### …but completion CANNOT be the only wakeup
	 * That re-poll covers the same target. It says nothing about an item for a DIFFERENT target that
	 * arrives while a long turn runs, and for a while this loop answered that case by parking until
	 * the long turn ended — silently serializing the very conversations `MAX_CONCURRENT_TURNS` exists
	 * to overlap. `settleOrPoll` is the second wakeup; see its docblock for the production trace.
	 */
	private async drainLoop(): Promise<number> {
		// THE LOGIN GATE (Task T7, AC-4) — BEFORE `claimNext`, never after, and never on an item already
		// in flight. An item that got claimed and then aborted would still burn one of its
		// MAX_ATTEMPTS via `fail()` — the defer/contention lesson of 2026-08-05: undoing a claim is
		// never free. Checking here instead means an unauthenticated install simply never asks the
		// queue for work — items sit PENDING, untouched, attempts unspent — and the very next drain
		// (after `SetCloudToken` logs the daemon in) resumes exactly where it left off, no restart
		// needed. O gate virou ASSÍNCRONO porque a resposta passou a vir da NUVEM (`GET /session`
		// com a credencial guardada) em vez de um cache em disco — memoizada por 60s dentro do
		// `FileCloudSession`, porque este laço faz poll a cada 250ms–2s e a pergunta não pode sair da
		// máquina nessa cadência. Dev-compat: with no CODM_CLOUD_URL configured, `CloudSession.isEntitled()` always
		// answers true (spec T7.1 rollout note), so this is a no-op for every install that predates SP2.
		if (!(await this.cloudSession.isEntitled())) return 0

		let handled = 0
		const inflight = new Set<Promise<void>>()

		for (;;) {
			const item = inflight.size < MAX_CONCURRENT_TURNS ? await this.mailbox.claimNext(this.workerId, this.leaseMs) : undefined

			if (item) {
				handled++
				const turn = this.runTurn(item).finally(() => inflight.delete(turn))
				inflight.add(turn)
				continue
			}

			// Nothing claimable. If nothing is running either, the queue is drained.
			if (inflight.size === 0) return handled
			// Otherwise wait for ONE turn to settle — which frees its target and may unblock its own
			// next item — OR for the poll floor, whichever lands first. Then try again.
			await this.settleOrPoll(inflight)
		}
	}

	/**
	 * Wait for a turn to finish OR for the poll floor — and the timer is the whole point.
	 *
	 * ### The bug this exists to kill
	 * `await Promise.race(inflight)` alone parks the loop until a turn COMPLETES. An item enqueued
	 * after the last `claimNext` came back empty is then invisible until some unrelated turn ends —
	 * even with free slots and a different target. Measured in production: an issue turn claimed at
	 * 16:34:31 (a coding agent, minutes long) left two orchestrator messages queued at 16:34:55 and
	 * 16:35:51 sitting at `attempts = 0`, unclaimed, while the operator watched a chat go silent and
	 * asked "por que você não me respondeu?". Three of the four turn slots were idle the whole time.
	 *
	 * `tick()` cannot rescue it: `drain()`'s re-entrancy guard hands back the drain that is already
	 * parked, so the timer next door spins without ever reaching `claimNext`.
	 *
	 * The end-of-turn re-poll (AC-T5.3) is still exactly as immediate — a settled turn wins this race
	 * the moment it resolves. What the floor adds is the OTHER wakeup: new work arriving mid-turn.
	 *
	 * The timer is always cleared, including when a turn wins the race. Left dangling it would hold
	 * the event loop open past `stop()` — the difference between a daemon that exits and one that
	 * lingers for a poll interval on every shutdown.
	 */
	private async settleOrPoll(inflight: Set<Promise<void>>): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined
		try {
			await Promise.race([
				...inflight,
				new Promise<void>(resolve => {
					timer = setTimeout(resolve, POLL_MIN_MS)
				}),
			])
		} finally {
			if (timer) clearTimeout(timer)
		}
	}

	/**
	 * Run one turn, holding its lease open for as long as the turn actually takes.
	 *
	 * ### Why the heartbeat is not optional
	 * `LEASE_MS` is documented as the CRASH budget — how long until a dead worker's item returns to the
	 * queue. Without a heartbeat it silently doubles as a TURN-DURATION budget, and an issue turn is a
	 * coding agent that routinely outlives ten minutes. What follows is not a slow turn, it is a
	 * destroyed one: o lease lapsa sob um run saudável, `claimNext` entrega o MESMO item de novo, e o
	 * dispatcher começa um SEGUNDO turno para o mesmo alvo — dois processos escrevendo na mesma issue.
	 * Measured 2026-08-04: two issues died this way three minutes after
	 * a restart, while their original runs were still going and finished normally twelve minutes later.
	 *
	 * The failure was previously MASKED: the old drain loop parked in `Promise.race(inflight)` and never
	 * re-polled mid-turn, so nobody was around to reclaim the lapsed lease. Fixing that park (so new work
	 * is not stranded behind a long turn) removed the accident that was protecting long turns — which is
	 * why the two land together.
	 */
	private async runTurn(item: ClaimedMailboxItem): Promise<void> {
		const heartbeat = setInterval(() => {
			// Fire-and-forget by design: a missed renewal is survivable (the lease still has two beats of
			// slack), and awaiting here would make the turn's progress depend on the queue's write path.
			void this.mailbox.renewLease(item.id, this.workerId, this.leaseMs).catch(error => {
				this.logging.warn({
					content: {
						message: 'mailbox lease renewal failed',
						itemId: item.id,
						error: error instanceof Error ? error.message : String(error),
					},
				})
			})
		}, this.heartbeatMs)

		try {
			const report = item.targetKind === MailboxTargetKind.THREAD ? await this.runThreadTurn(item) : await this.runIssueWork(item)

			// TRANSPORT + MUTE RETURNS TO THE QUEUE. `fail` bumps `attempts`, records the cause in
			// `last_error` and releases the lease NOW — the item is claimable on the next poll (250ms)
			// instead of waiting out the ten-minute lease clock. Past the cap, `raiseStopForPoisoned`
			// turns the exhaustion into a Stop, which is the only warning the operator gets, and only then.
			//
			// The `&& !report.spoke` is not caution, it preserves a prior decision: a turn that already
			// streamed a cut has already spoken in the operator's real chat, and retrying it would
			// reproduce the duplicate-message bug `RunOrchestratorTurn` documents at its own stop branch.
			if (report.transportStop && !report.spoke) {
				await this.mailbox.fail(item.id, report.transportStop.detail, MAX_ATTEMPTS)
				if (item.attempts >= MAX_ATTEMPTS) await this.raiseStopForPoisoned(item, report.transportStop.detail)
				return
			}

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

			// A POISONED ITEM IS A NEEDS-YOU, and until now it was a silent one.
			//
			// `attempts` was already incremented at claim, so reaching MAX here means this failure was the
			// last one and the row is now dead. Before this line the only trace was a log nobody reads:
			// the item stopped existing for the queue, the issue stayed `WORKING` forever, and the
			// operator found out by asking. Raising a stop puts it on the Needs-you panel — and since
			// stops of this kind now reach the channel, on the operator's phone.
			if (item.attempts >= MAX_ATTEMPTS) await this.raiseStopForPoisoned(item, message)
		} finally {
			clearInterval(heartbeat)
		}
	}

	/**
	 * A THREAD item is a turn of the orchestrator (§7.4). The run context — which CLI, which directory —
	 * is resolved HERE rather than carried in the payload, because it is a property of the thread NOW
	 * and an item may have been queued minutes ago; a workspace rebound in between should take effect.
	 */
	protected async runThreadTurn(item: ClaimedMailboxItem): Promise<TurnReport> {
		const thread = await this.threads.findById(item.targetId)
		if (!thread) return this.dropSilently(item, 'thread no longer exists')

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) return this.dropSilently(item, 'workspace no longer bound')

		const provider = thread.providers[0]
		if (!provider) return this.dropSilently(item, 'thread has no provider')

		const payload = item.payload as { entryId?: string; originEntryId?: string }
		const result = await this.handlerFor(RunOrchestratorTurn).execute({
			ownerId: item.ownerId,
			threadId: item.targetId,
			workspacePath: workspace.path,
			provider,
			// WHICH MODEL, resolved here for the same reason the provider and the workspace are: it is a
			// property of the thread NOW, and the item may have been queued minutes ago. `modelFor` always
			// answers — a conversation that chose nothing reads as `DEFAULT`, which is the instruction to
			// omit `--model` — so there is no absence for the use case to interpret.
			model: thread.modelFor(provider),
			item: item.payload as Parameters<RunOrchestratorTurn['execute']>[0]['item'],
			// Only an OPERATOR_MESSAGE has an originating entry; an ISSUE_RESULT turn is triggered by a
			// subagent finishing, and the entry it will CITE is carried on the item, not on the token.
			entryId: item.kind === MailboxItemKind.OPERATOR_MESSAGE ? payload.entryId : undefined,
			// The entry the finished issue must QUOTE (§7.6). It rides the ISSUE_RESULT item rather than
			// the run-token claims, because this turn was triggered by a subagent finishing, not by a
			// message — there is no entry to mint a claim from.
			originEntryId: item.kind === MailboxItemKind.ISSUE_RESULT ? payload.originEntryId : undefined,
		})
		return { spoke: result.spoke, transportStop: result.transportStop }
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
	 *
	 * ### WHY `priorMessageId` IS READ HERE (issue-resume spec, decision 5)
	 * `AgentSession.resumeDecision` refuses to resume when the cursor it is handed disagrees with the
	 * one the row stores (`CONVERSATION_ADVANCED`) — the guard that stops a turn from silently
	 * continuing a session that never consumed part of the conversation. This method used to pass NO
	 * cursor at all, so `undefined !== lastMessageId` was true on every second and later turn and
	 * EVERY mailbox-driven turn ran fresh: the `--resume` machinery existed, was never reached, and the
	 * only trace was a `warn` nobody was reading. That is the "não consigo retomar" the founder hit.
	 *
	 * The cursor a mailbox-driven turn continues FROM is the item the previous turn consumed, which is
	 * exactly what `upsertSessionRecord` stored as `lastMessageId` (`messageId: item.id`, below). So it
	 * is read from the session row rather than reconstructed. The guard is NOT weakened: it still fires
	 * for a session with no cursor yet, a moved cwd or a changed model, and it still fires for callers
	 * that track the conversation themselves (`RunIssueTurn` is unchanged and its transcript-driven
	 * callers keep passing their own). What changes is that this caller now answers the question
	 * instead of leaving it blank.
	 */
	protected async runIssueWork(item: ClaimedMailboxItem): Promise<TurnReport> {
		const payload = item.payload as {
			threadId: string
			key: string
			title: string
			goal?: string
			text?: string
			provider: string
			originEntryId?: string
			firedByLoop?: string
		}
		const thread = await this.threads.findById(payload.threadId)
		if (!thread) return this.dropSilently(item, 'thread no longer exists')

		const workspace = await this.workspaces.findById(thread.workspaceId)
		if (!workspace) return this.dropSilently(item, 'workspace no longer bound')

		const session = await this.sessions.findByIssueId(item.targetId)

		const provider = thread.providers[0] ?? (payload.provider as never)

		const result = await this.handlerFor(RunIssueTurn).execute({
			ownerId: item.ownerId,
			issueId: item.targetId,
			threadId: payload.threadId,
			key: payload.key,
			title: payload.title,
			provider,
			// THE ISSUE INHERITS THE CONVERSATION'S MODEL, and does not have one of its own. An issue is
			// work the operator asked for IN a thread — the choice they made there is the one they meant,
			// and giving the issue a second selector would be a second place to configure one thing, in a
			// screen (the issue detail) where the CLI is not even named.
			model: thread.modelFor(provider),
			workspacePath: workspace.path,
			// The issue OWNS its goal since the pivot — the prompt is what the operator asked for, not
			// the raw inbound text re-read from a transcript. A STEER carries its own text instead: the
			// session is resumed, so the turn needs the NEW instruction, not the original brief again.
			prompt: item.kind === MailboxItemKind.STEER ? (payload.text ?? '') : (payload.goal ?? ''),
			// The same discriminant, handed on instead of being thrown away. Until the prompt grammar it
			// only chose WHICH string to send; the working agent received the two under one shape and had
			// to guess whether it was being briefed or corrected. `WORK` is the widened default because
			// `MailboxTargetKind.ISSUE` admits exactly these two kinds and this method handles both.
			turnKind: item.kind === MailboxItemKind.STEER ? MailboxItemKind.STEER : MailboxItemKind.WORK,
			// Present only on a steer a SCHEDULE produced (`SteerThread`), so the turn is not told a person
			// is standing there when what fired was a timer.
			firedByLoop: payload.firedByLoop,
			customPrompt: thread.customPrompt,
			messageId: item.id,
			// The position this turn continues FROM — the item the previous turn consumed. Absent on the
			// issue's first turn, which is what `resolveSession` reads as "there is nothing to resume".
			priorMessageId: session?.lastMessageId,
			// Carried through so `persistOutcome` can put it on the ISSUE_RESULT it queues.
			originEntryId: payload.originEntryId,
		})
		return { spoke: result.spoke, transportStop: result.transportStop }
	}

	/**
	 * Turn a poisoned item into a Needs-you card — the leg that was missing.
	 *
	 * ### Why `SERVER_ERROR` and not a kind of its own
	 * The frozen `StopKind` set has no member for "the queue gave up on this item", and minting one is a
	 * contract change, not a hotfix. `SERVER_ERROR` is the least-wrong home: its admissible resolutions
	 * are exactly the two that apply here (`RETRY` / `TAKE_OVER`), and its catalog title already reads as
	 * a condition rather than a sentence somebody wrote. The `detail` carries what actually happened, so
	 * nothing is hidden. A dedicated kind is the follow-up, and it belongs in a spec.
	 *
	 * ### Why this is best-effort
	 * The turn already failed. If raising the stop ALSO fails, rethrowing would replace a recorded
	 * failure with an unrecorded one and hand the outbox a second thing to retry. The item is already
	 * dead in the queue either way; the worst case here is the silence we had before, never worse.
	 */
	private async raiseStopForPoisoned(item: ClaimedMailboxItem, cause: string): Promise<void> {
		try {
			// A THREAD item names its thread directly; an ISSUE item carries it on the payload, which is
			// where `runIssueWork` already reads it from.
			const payload = item.payload as { threadId?: string }
			const threadId = item.targetKind === MailboxTargetKind.THREAD ? item.targetId : payload.threadId
			if (!threadId) return

			await this.handlerFor(RaiseStop).execute({
				stopId: crypto.randomUUID(),
				threadId,
				issueId: item.targetKind === MailboxTargetKind.ISSUE ? item.targetId : undefined,
				kind: StopKind.SERVER_ERROR,
				detail: `O trabalho parou depois de ${item.attempts} tentativas: ${cause}`,
			})
		} catch (error) {
			this.logging.error({
				content: {
					message: 'could not raise a stop for a poisoned mailbox item',
					itemId: item.id,
					error: error instanceof Error ? error.message : String(error),
				},
			})
		}
	}

	/**
	 * A precondition that will never become true again — the thread was detached, the workspace
	 * unbound. Reported as COMPLETED rather than failed: `fail` would retry three times and then
	 * poison, which spends three CLI spawns and leaves a dead row implying something is wrong. Logged
	 * at `warn` because a vanished target IS worth noticing, just not worth retrying.
	 *
	 * Does NOT write to the mailbox itself — `runTurn` is the only place that does, and it reads
	 * `dropped`/`spoke` off this report the same way it reads a real turn's outcome. Writing here too
	 * used to be harmless when `complete` was the only possible outcome; now that a report can also
	 * carry a `transportStop`, a second writer would race the first.
	 */
	private dropSilently(item: ClaimedMailboxItem, why: string): TurnReport {
		this.logging.warn({
			content: { message: `mailbox item dropped — ${why}`, itemId: item.id, targetKind: item.targetKind, targetId: item.targetId },
		})
		return { spoke: false, dropped: true }
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
