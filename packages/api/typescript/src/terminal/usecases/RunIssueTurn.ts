import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z, BaseError, LoggingService } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { AgentModelId, ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../services/AgentRunner'
import { ProviderDetector, type ProviderDetection } from '../services/ProviderDetector'
import { AgentStreamRegistry } from '../services/AgentStreamRegistry'
import { TerminalOutputAccumulator, type TerminalOutcome } from '../services/TerminalOutputAccumulator'
import { AgentSessionRepository } from '../repositories'
import { AgentSession } from '../entities/AgentSession'
import { TerminalSessionStartedEvent } from '../events/TerminalSessionStartedEvent'
import { TerminalReplyDraftedEvent } from '../events/TerminalReplyDraftedEvent'
import { TerminalSessionCompletedEvent } from '../events/TerminalSessionCompletedEvent'
import { TerminalStopRaisedEvent } from '../events/TerminalStopRaisedEvent'
import type { TerminalApplicationErrors } from '../errors'
import { AgentMessageRole, AgentName, ResumeInvalidationReason, TerminalRunOutcome } from '../enums'

export const RunIssueTurnInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	key: z.string().trim().min(1),
	title: z.string().trim().min(1),
	provider: z.enum(ProviderKind),
	workspacePath: z.string().trim().min(1),
	prompt: z.string().trim().min(1),
	/** The transcript entry being fed — becomes the session's cursor once the turn commits. */
	messageId: z.uuid(),
	/**
	 * The conversation position this turn continues FROM: the issue transcript's latest entry BEFORE
	 * `messageId`. Absent on a brand-new issue. Compared against the persisted cursor to catch a
	 * conversation that advanced past what the CLI session actually consumed.
	 */
	priorMessageId: z.uuid().optional(),
	/** Which model to ask the provider CLI for. Omitted ⇒ `DEFAULT` ⇒ the CLI's own choice. */
	model: z.enum(AgentModelId).optional(),
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
 * How this turn will address the provider's session: continue the persisted one (`--resume <id>`) or
 * open a new one under an id we mint (`--session-id <id>`). Never neither — a turn with no session
 * identity at all is a turn whose successor cannot resume it.
 */
interface SessionPlan {
	resumed: boolean
	id: string
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
 *
 * ### What Fase 4 ADDED: multi-turn context, and the four guards on it
 * A second turn on the same issue does NOT re-render the transcript into the prompt. It hands the CLI
 * the session id the previous turn persisted (`--resume`), which is the whole reason the durable row
 * exists. That is only safe while the premises the row was written under still hold, so every turn
 * asks `AgentSession.resumeDecision` first and, when the answer is no, runs FRESH under a minted
 * `--session-id` and LOGS the named reason (`logResumeInvalidated`). No silent reset — AC-4.4. The
 * goal permits either a structured log or an `AGENT_RESUME_INVALIDATED` error code (§5.1) and the log
 * is the honest one: an invalidated resume is not a failure, the turn runs perfectly well.
 *
 * The `session` field is ALWAYS populated — `resumeId` or a freshly minted `newId`, never neither.
 * Letting the CLI mint its own id would leave the row's identity dependent on the stream reporting
 * one (the CLI reporting its session id in the stream), i.e. on a provider capability, for a value the
 * next turn's resume depends on. We mint; a CLI that reports a different id back still wins, because
 * `--resume` must be given whatever the CLI actually stored.
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
		private readonly sessions: AgentSessionRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// Single-active-run guard (independent of whether a browser is observing).
		this.registry.beginSession(input.issueId)
		try {
			const detection = await this.resolveProvider(input.provider)
			// Decided BEFORE the opened fact commits: it is a read of durable state, and the argv it
			// produces has to exist by the time the stream starts.
			const session = await this.resolveSession(input, detection)

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
			const observed = await this.drainRun(input, detection, session)

			// FACT — the run's conclusion.
			const stopId = observed.outcome.kind === 'STOPPED' ? uuidv7() : undefined
			await this.withTransaction(tx, async tx => {
				await this.persistOutcome(input, observed.outcome, stopId, tx)
				await this.upsertSessionRecord(input, observed.agentSessionId ?? session.id, tx)
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
	 * the whole point of §4.7: `ClaudeAgentRunner.buildArgs` stays a pure function of its arguments, so
	 * the argv can never depend on whether detection happened to have run yet.
	 */
	private async resolveProvider(provider: ProviderKind): Promise<ProviderDetection> {
		const detection = await this.providerDetector.resolve(provider)
		if (!detection || detection.status !== ProviderStatus.DETECTED) {
			throw new BaseError<TerminalApplicationErrors>('PROVIDER_NOT_DETECTED', `provider ${provider} is not installed`)
		}
		return detection
	}

	private async drainRun(input: this['input'], detection: ProviderDetection, session: SessionPlan): Promise<RunObservations> {
		const accumulator = new TerminalOutputAccumulator({ issueId: input.issueId })

		for await (const event of this.runner.run({
			agentName: AgentName.ISSUE_WORK,
			cwd: input.workspacePath,
			messages: [{ role: AgentMessageRole.USER, content: input.prompt }],
			model: input.model ?? AgentModelId.DEFAULT,
			// EXACTLY ONE of the two is set. `buildArgs` treats them as mutually exclusive by
			// construction, so handing it both would make the argv version-dependent.
			session: session.resumed ? { resumeId: session.id } : { newId: session.id },
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

	/**
	 * Decide, BEFORE the spawn, whether this turn continues the issue's existing CLI session or opens
	 * a new one — and, when it opens a new one, say why in a structured log.
	 *
	 * The id is minted here in both branches (see the class docblock): the row's identity must not
	 * depend on the provider reporting one back.
	 */
	private async resolveSession(input: this['input'], detection: ProviderDetection): Promise<SessionPlan> {
		const existing = await this.sessions.findByIssueId(input.issueId)
		if (!existing) return { resumed: false, id: uuidv7() }

		// Gate on the PROVIDER's own capability BEFORE ever asking the row to resume — a CLI that
		// cannot natively resume a session (`caps.sessionResume` unset) must never be handed
		// `--resume`, no matter what the row says. Read from `ProviderDetection.caps` — the
		// RUNTIME-PROBED shape (§4.7) — rather than a static per-provider flag, which is exactly why
		// this line survived Fase 4.5 untouched: the per-CLI data literal and its registry died, their static
		// fields moved onto the concrete runner, while `ProviderDetector` stayed and kept returning
		// `caps: ProviderCapabilities` unchanged (AC-5.9).
		if (!detection.caps?.sessionResume) {
			this.logging.warn({
				content: {
					message: 'provider has no native session resume capability — starting a fresh provider session',
					issueId: input.issueId,
					threadId: input.threadId,
					provider: input.provider,
					abandonedSessionId: existing.agentSessionId,
				},
			})
			return { resumed: false, id: uuidv7() }
		}

		const decision = existing.resumeDecision({
			model: input.model ?? AgentModelId.DEFAULT,
			cwd: input.workspacePath,
			cursor: input.priorMessageId,
		})
		if (decision.resume) return { resumed: true, id: decision.id }

		this.logResumeInvalidated(input, existing.agentSessionId, decision.reason)
		return { resumed: false, id: uuidv7() }
	}

	/**
	 * AC-4.4 — the ONE place a resume is dropped, and it is never silent.
	 *
	 * `warn`, not `info`: an invalidated resume means the next turn starts without the conversation
	 * the operator believes it has, which is exactly the class of thing someone reads logs to find
	 * out about after the fact. It is not an error — the turn runs — which is why it is not a
	 * `BaseError` and why §5.1's `AGENT_RESUME_INVALIDATED` code is deliberately NOT created.
	 */
	private logResumeInvalidated(input: this['input'], abandonedSessionId: string, reason: ResumeInvalidationReason): void {
		this.logging.warn({
			content: {
				message: 'agent session resume invalidated — starting a fresh provider session',
				reason,
				issueId: input.issueId,
				threadId: input.threadId,
				provider: input.provider,
				model: input.model ?? AgentModelId.DEFAULT,
				cwd: input.workspacePath,
				abandonedSessionId,
			},
		})
	}

	/**
	 * Durable per-issue session record: resume identity, the premises it holds, and last-turn recency.
	 *
	 * `agentSessionId` is `string`, not `string | null` — the ONE call site passes
	 * `observed.agentSessionId ?? session.id`, and `session.id` is always minted (see the class
	 * docblock), so the fallback never actually falls through to nothing. Typing it as always-present
	 * says so instead of guarding against a case that cannot occur here.
	 */
	private async upsertSessionRecord(input: this['input'], agentSessionId: string, tx: Transaction): Promise<void> {
		const model = input.model ?? AgentModelId.DEFAULT
		const existing = await this.sessions.findByIssueId(input.issueId, tx)
		if (existing) {
			existing.recordTurn({ agentSessionId, model, cwd: input.workspacePath, lastMessageId: input.messageId })
			await this.sessions.save(existing, tx)
			return
		}
		await this.sessions.save(
			AgentSession.create({
				ownerId: input.ownerId,
				issueId: input.issueId,
				threadId: input.threadId,
				provider: input.provider,
				cwd: input.workspacePath,
				agentSessionId,
				model,
				lastMessageId: input.messageId,
			}),
			tx,
		)
	}
}
