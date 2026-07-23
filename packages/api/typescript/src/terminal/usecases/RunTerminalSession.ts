import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMRunner, type SessionKillReason } from '../services/TerminalLLMRunner'
import { ProviderDetector } from '../services/ProviderDetector'
import { AgentStreamRegistry } from '../services/AgentStreamRegistry'
import { TerminalOutputAccumulator, type TerminalOutcome } from '../services/TerminalOutputAccumulator'
import { TerminalLLMSessionRepository } from '../repositories'
import { TerminalLLMSession } from '../entities/TerminalLLMSession'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'
import { TerminalSessionResumedEvent } from '../events/TerminalSessionResumedEvent'
import { TerminalSessionKilledEvent } from '../events/TerminalSessionKilledEvent'
import type { TerminalApplicationErrors } from '../errors'
import { TerminalRunOutcome, TerminalSessionKillReason } from '../enums'

export const RunTerminalSessionInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	key: z.string().trim().min(1),
	title: z.string().trim().min(1),
	provider: z.enum(ProviderKind),
	workspacePath: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
})

export const RunTerminalSessionOutputSchema = z.object({
	issueId: z.uuid(),
	outcome: z.enum(TerminalRunOutcome),
	replyText: z.string().optional(),
	stopId: z.string().optional(),
})

/** What the stream loop observed beyond transport — the engine's lifecycle facts for this turn. */
interface StreamObservations {
	outcome: TerminalOutcome
	terminalSessionId: string | null
	resumed: boolean
	killedReason: SessionKillReason | null
}

/**
 * Runs one terminal session TURN for an issue end to end — the engine's write-side entry point,
 * invoked by the 6b saga on `integration.message.classified`. Adapted to the WIDE seam (Fork A1):
 * the runner is the full whatscode session engine (persistent claude REPL per issue, Fork B), and
 * this use case realizes the two-stream split over its rich event union:
 *
 *   TRANSPORT — every `output`/`action` event is pushed to the SSE observer via
 *               `AgentStreamRegistry.send`, streamed OUTSIDE any transaction.
 *   FACTS     — the run's outcome + lifecycle are persisted as context-private domain events; the
 *               internal bridge maps outcome facts to the FROZEN integration events
 *               (issue.opened / agent.reply_drafted / issue.completed / issue.stop_raised).
 *               Lifecycle facts (session resumed/killed) stay domain-only (wave-0 amendments).
 *
 * It also upserts the durable `TerminalLLMSession` row (issueId → claudeSessionId, lastTurnAt) so
 * resume identity + prewarm recency survive daemon restarts.
 *
 * The single-active invariant ("one terminal session per issue") is claimed on `beginSession` and
 * released in a `finally` — a second concurrent run for the same issue throws
 * TERMINAL_ALREADY_RUNNING.
 */
@injectable()
export class RunTerminalSession extends Handler<typeof RunTerminalSessionInputSchema, typeof RunTerminalSessionOutputSchema> {
	readonly name = 'run_terminal_session' as const
	readonly inputSchema = RunTerminalSessionInputSchema
	readonly outputSchema = RunTerminalSessionOutputSchema

	constructor(
		private readonly runner: TerminalLLMRunner,
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
			const binaryPath = await this.resolveBinary(input.provider)

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

			// TRANSPORT — stream the session output to the SSE observer, strictly outside any tx.
			const observed = await this.streamSession(input, binaryPath)

			// FACT — the run's conclusion + lifecycle.
			const stopId = observed.outcome.kind === 'STOPPED' ? uuidv7() : undefined
			await this.withTransaction(tx, async tx => {
				await this.persistLifecycle(input, observed, tx)
				await this.persistOutcome(input, observed.outcome, stopId, tx)
				await this.upsertSessionRecord(input, observed.terminalSessionId, tx)
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

	private async resolveBinary(provider: ProviderKind): Promise<string | undefined> {
		const detection = await this.providerDetector.resolve(provider)
		if (!detection || detection.status !== ProviderStatus.DETECTED) {
			throw new BaseError<TerminalApplicationErrors>('PROVIDER_NOT_DETECTED', `provider ${provider} is not installed`)
		}
		return detection.binaryPath
	}

	private async streamSession(input: this['input'], binaryPath: string | undefined): Promise<StreamObservations> {
		const accumulator = new TerminalOutputAccumulator({ issueId: input.issueId })
		let terminalSessionId: string | null = null
		let resumed = false
		let killedReason: SessionKillReason | null = null

		for await (const event of this.runner.stream({
			issueId: input.issueId,
			threadId: input.threadId,
			ownerId: input.ownerId,
			provider: input.provider,
			cwd: input.workspacePath,
			prompt: input.prompt,
			binaryPath,
		})) {
			if (event.type === 'session') {
				terminalSessionId = event.terminalSessionId
				if (event.lifecycle === 'resumed') resumed = true
			}
			if (event.type === 'killed') {
				killedReason = event.reason
				if (event.terminalSessionId) terminalSessionId = event.terminalSessionId
			}
			const frame = accumulator.feed(event)
			if (frame) await this.registry.send(input.issueId, frame)
		}
		return { outcome: accumulator.outcome(), terminalSessionId, resumed, killedReason }
	}

	/** Domain-only lifecycle facts (wave-0 amendments: no wire counterparts). */
	private async persistLifecycle(input: this['input'], observed: StreamObservations, tx: Transaction): Promise<void> {
		if (observed.resumed && observed.terminalSessionId) {
			await this.domainEventRepository.save(
				new TerminalSessionResumedEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						issueId: input.issueId,
						threadId: input.threadId,
						terminalSessionId: observed.terminalSessionId,
						cwd: input.workspacePath,
					},
				}),
				tx,
			)
		}
		if (observed.killedReason) {
			await this.domainEventRepository.save(
				new TerminalSessionKilledEvent({
					entityId: input.issueId,
					ownerId: input.ownerId,
					payload: {
						issueId: input.issueId,
						threadId: input.threadId,
						terminalSessionId: observed.terminalSessionId ?? 'unknown',
						// Value-identical by construction: the engine union derives from the enum (types.ts).
						reason: observed.killedReason as TerminalSessionKillReason,
					},
				}),
				tx,
			)
		}
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

	/** Durable per-issue session record: resume identity + prewarm recency (Fork B). */
	private async upsertSessionRecord(input: this['input'], terminalSessionId: string | null, tx: Transaction): Promise<void> {
		if (!terminalSessionId) return
		const existing = await this.sessions.findByIssueId(input.issueId, tx)
		if (existing) {
			existing.recordTurn(terminalSessionId)
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
				claudeSessionId: terminalSessionId,
			}),
			tx,
		)
	}
}
