import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../services/AgentRunner'
import { ProviderDetector, type ProviderDetection } from '../services/ProviderDetector'
import { AgentStreamRegistry } from '../services/AgentStreamRegistry'
import { TerminalOutputAccumulator, type TerminalOutcome } from '../services/TerminalOutputAccumulator'
import { TerminalLLMSessionRepository } from '../repositories'
import { TerminalLLMSession } from '../entities/TerminalLLMSession'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'
import type { TerminalApplicationErrors } from '../errors'
import { AgentMessageRole, AgentName, TerminalRunOutcome } from '../enums'

export const RunIssueTurnInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	key: z.string().trim().min(1),
	title: z.string().trim().min(1),
	provider: z.enum(ProviderKind),
	workspacePath: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
})

export const RunIssueTurnOutputSchema = z.object({
	issueId: z.uuid(),
	outcome: z.enum(TerminalRunOutcome),
	replyText: z.string().optional(),
	stopId: z.string().optional(),
})

/** What the drain loop observed beyond transport — the run's conclusion and its session identity. */
interface RunObservations {
	outcome: TerminalOutcome
	agentSessionId: string | null
}

/**
 * Runs ONE agent turn for an issue end to end — the write-side entry point, invoked by the 6b saga on
 * `integration.message.classified`. It consumes the ONE-METHOD seam (§4.1): `AgentRunner.run()` over
 * bidirectional stream-json on plain pipes, and its three-category event union (§4.3).
 *
 *   TRANSPORT — every `frame` event becomes at most one SSE line pushed to the observer via
 *               `AgentStreamRegistry.send`, streamed STRICTLY OUTSIDE any transaction.
 *   FACTS     — the run's conclusion is persisted as context-private domain events; the internal
 *               bridge maps them to the FROZEN integration events (issue.opened / agent.reply_drafted
 *               / issue.completed / issue.stop_raised).
 *
 * ### What this use case STOPPED doing in Fase 3, and why each removal is structural
 * - **No `resumed` / `killed` lifecycle facts.** Both were PTY vocabulary: "the live REPL was reused"
 *   and "the pseudo-terminal died". Neither is observable over pipes, where every turn is its own
 *   process and a dead child is simply a run that ended. Native `--resume` makes resumption observable
 *   again on its own terms in Fase 4, which is the phase §5.3 assigns those two event classes to.
 * - **No outcome inference.** The conclusion arrives as ONE `finished` event; the accumulator
 *   translates it rather than re-deriving it from the frames.
 * - **`fact` events are not persisted here** — they arrive unstamped, by seam design (AC-1.11), and
 *   the layer that holds identity is the base `Agent` of Fase 5. Said out loud in the accumulator too.
 *
 * The two-transaction discipline is PRESERVED verbatim: the opened fact commits before the stream
 * starts (so `issue.opened` fires at spawn time), the stream runs outside any transaction, and the
 * conclusion + session row commit together afterwards.
 *
 * The single-active invariant ("one agent run per issue") is claimed on `beginSession` and released in
 * a `finally` — a second concurrent run for the same issue throws TERMINAL_ALREADY_RUNNING.
 */
@injectable()
export class RunIssueTurn extends Handler<typeof RunIssueTurnInputSchema, typeof RunIssueTurnOutputSchema> {
	readonly name = 'run_issue_turn' as const
	readonly inputSchema = RunIssueTurnInputSchema
	readonly outputSchema = RunIssueTurnOutputSchema

	constructor(
		private readonly runner: AgentRunner,
		private readonly providerDetector: ProviderDetector,
		private readonly registry: AgentStreamRegistry,
		private readonly sessions: TerminalLLMSessionRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// Single-active-run guard (independent of whether a browser is observing).
		this.registry.beginSession(input.issueId)
		try {
			const detection = await this.resolveProvider(input.provider)

			// FACT — spawn/opened, persisted before streaming so issue.opened fires at spawn time.
			await this.withTransaction(tx, async tx => {
				await this.domainEventRepository.save(
					new TerminalSessionStartedEvent({
						entityId: input.issueId,
						ownerId: input.ownerId,
						payload: { issueId: input.issueId, threadId: input.threadId, key: input.key, title: input.title, provider: input.provider },
					}),
					tx,
				)
			})

			// TRANSPORT — stream the run's frames to the SSE observer, strictly outside any tx.
			const observed = await this.drainRun(input, detection)

			// FACT — the run's conclusion.
			const stopId = observed.outcome.kind === 'STOPPED' ? uuidv7() : undefined
			await this.withTransaction(tx, async tx => {
				await this.persistOutcome(input, observed.outcome, stopId, tx)
				await this.upsertSessionRecord(input, observed.agentSessionId, tx)
			})

			return {
				issueId: input.issueId,
				outcome: observed.outcome.kind === 'COMPLETED' ? TerminalRunOutcome.COMPLETED : TerminalRunOutcome.STOPPED,
				replyText: observed.outcome.kind === 'COMPLETED' ? observed.outcome.replyText : undefined,
				stopId,
			}
		} finally {
			// Teardown — release the single-active claim whether the run completed or threw.
			this.registry.endSession(input.issueId)
		}
	}

	/**
	 * Resolve the binary AND its probed capabilities in one call.
	 *
	 * `caps` is threaded to `run()` beside `binaryPath` rather than read from an ambient map, which is
	 * the whole point of §4.7: `ProviderDef.buildArgs` stays a pure function of its arguments, so the
	 * argv can never depend on whether detection happened to have run yet.
	 */
	private async resolveProvider(provider: ProviderKind): Promise<ProviderDetection> {
		const detection = await this.providerDetector.resolve(provider)
		if (!detection || detection.status !== ProviderStatus.DETECTED) {
			throw new BaseError<TerminalApplicationErrors>('PROVIDER_NOT_DETECTED', `provider ${provider} is not installed`)
		}
		return detection
	}

	private async drainRun(input: this['input'], detection: ProviderDetection): Promise<RunObservations> {
		const accumulator = new TerminalOutputAccumulator({ issueId: input.issueId })

		for await (const event of this.runner.run({
			agentName: AgentName.ISSUE_WORK,
			provider: input.provider,
			cwd: input.workspacePath,
			messages: [{ role: AgentMessageRole.USER, content: input.prompt }],
			binaryPath: detection.binaryPath,
			caps: detection.caps,
		})) {
			const frame = accumulator.feed(event)
			if (frame) await this.registry.send(input.issueId, frame)
		}

		return { outcome: accumulator.outcome(), agentSessionId: accumulator.sessionId }
	}

	private async persistOutcome(input: this['input'], outcome: TerminalOutcome, stopId: string | undefined, tx: Transaction): Promise<void> {
		if (outcome.kind === 'COMPLETED') {
			if (outcome.replyText.length > 0) {
				await this.domainEventRepository.save(
					new TerminalReplyDraftedEvent({
						entityId: input.issueId,
						ownerId: input.ownerId,
						payload: { issueId: input.issueId, threadId: input.threadId, key: input.key, text: outcome.replyText },
					}),
					tx,
				)
			}
			await this.domainEventRepository.save(
				new TerminalSessionCompletedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: { issueId: input.issueId, threadId: input.threadId, key: input.key, completedAt: new Date() },
				}),
				tx,
			)
			return
		}

		await this.domainEventRepository.save(
			new TerminalStopRaisedEvent({
				entityId: input.issueId,
				ownerId: input.ownerId,
				payload: { stopId: stopId ?? uuidv7(), issueId: input.issueId, threadId: input.threadId, kind: outcome.stopKind },
			}),
			tx,
		)
	}

	/** Durable per-issue session record: resume identity + last-turn recency. */
	private async upsertSessionRecord(input: this['input'], agentSessionId: string | null, tx: Transaction): Promise<void> {
		if (!agentSessionId) return
		const existing = await this.sessions.findByIssueId(input.issueId, tx)
		if (existing) {
			existing.recordTurn(agentSessionId)
			await this.sessions.save(existing, tx)
			return
		}
		await this.sessions.save(
			TerminalLLMSession.create({
				ownerId: input.ownerId,
				issueId: input.issueId,
				threadId: input.threadId,
				provider: input.provider,
				cwd: input.workspacePath,
				claudeSessionId: agentSessionId,
			}),
			tx,
		)
	}
}
