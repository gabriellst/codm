import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z, BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { ProviderKind, ProviderStatus } from '@template/contracts-typescript/wire/enums'
import { AgentRunner } from '../services/AgentRunner'
import { ProviderDetector } from '../services/ProviderDetector'
import { TerminalSessionRegistry } from '../services/TerminalSessionRegistry'
import { TerminalOutputAccumulator, type TerminalOutcome } from '../services/TerminalOutputAccumulator'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'
import type { TerminalApplicationErrors } from '../errors'

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
	outcome: z.enum(['COMPLETED', 'STOPPED']),
	replyText: z.string().optional(),
	stopId: z.string().optional(),
})

/**
 * Runs one terminal session for an issue end to end — the engine's write-side entry point. It is
 * INVOKED by the domain flow (BC4's external handler on `integration.message.classified`, phase 6);
 * this phase keeps the seam clean by exposing it as a use case with no thread/routing domain of its
 * own. It realizes the two-stream split:
 *
 *   TRANSPORT — every output line is pushed to the SSE observer via `TerminalSessionRegistry.send`
 *               (`browser.terminal_output_appended`), streamed OUTSIDE any transaction.
 *   FACTS     — the run's outcome is persisted as context-private domain events; the internal bridge
 *               maps each to a FROZEN integration event (issue.opened / agent.reply_drafted /
 *               issue.completed / issue.stop_raised). No event is authored here beyond those.
 *
 * The single-active invariant ("one terminal session per issue") is claimed on `beginSession` and
 * released in a `finally` — a second concurrent run for the same issue throws TERMINAL_ALREADY_RUNNING.
 */
@injectable()
export class RunTerminalSession extends Handler<typeof RunTerminalSessionInputSchema, typeof RunTerminalSessionOutputSchema> {
	readonly name = 'run_terminal_session' as const
	readonly inputSchema = RunTerminalSessionInputSchema
	readonly outputSchema = RunTerminalSessionOutputSchema

	constructor(
		private readonly runner: AgentRunner,
		private readonly providerDetector: ProviderDetector,
		private readonly registry: TerminalSessionRegistry,
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

			// TRANSPORT — stream the subprocess output to the SSE observer, strictly outside any tx.
			const outcome = await this.streamSession(input, binaryPath)

			// FACT — the run's conclusion.
			const stopId = outcome.kind === 'STOPPED' ? uuidv7() : undefined
			await this.withTransaction(tx, async tx => {
				await this.persistOutcome(input, outcome, stopId, tx)
			})

			return {
				issueId: input.issueId,
				outcome: outcome.kind,
				replyText: outcome.kind === 'COMPLETED' ? outcome.replyText : undefined,
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

	private async streamSession(input: this['input'], binaryPath: string | undefined): Promise<TerminalOutcome> {
		const accumulator = new TerminalOutputAccumulator({ issueId: input.issueId })
		for await (const event of this.runner.stream({
			provider: input.provider,
			issueId: input.issueId,
			cwd: input.workspacePath,
			prompt: input.prompt,
			binaryPath,
		})) {
			const frame = accumulator.feed(event)
			if (frame) await this.registry.send(input.issueId, frame)
		}
		return accumulator.outcome()
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
}
