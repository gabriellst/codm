import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { BaseError, Handler, LoggingService, z } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import {
	AgentModelId,
	type BufferSize,
	ContactKind,
	ProviderKind,
	ProviderStatus,
	TranscriptKind,
} from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '@thread/repositories'
import { OrchestratorAgent, OrchestratorInputSchema } from '../agents/OrchestratorAgent'
import { parseReply } from '../agents/OrchestratorAgent/citation'
import { AgentRunnerFactory } from '../services/AgentRunnerFactory'
import { ProviderDetector, type ProviderDetection } from '../services/ProviderDetector'
import { TerminalOutputAccumulator } from '../services/TerminalOutputAccumulator'
import { AgentSessionRepository } from '../repositories'
import { AgentSession } from '../entities/AgentSession'
import { OrchestratorRepliedEvent } from '../events/OrchestratorRepliedEvent'
import type { AgentApplicationErrors } from '../errors'

export const RunOrchestratorTurnInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	workspacePath: z.string().trim().min(1),
	provider: z.enum(ProviderKind),
	/**
	 * The mailbox item this turn consumes, already narrowed to the two THREAD-facing kinds.
	 *
	 * Reuses the AGENT's schema rather than restating the union — one declaration, and a kind added
	 * there cannot be silently un-handled here. Read off `OrchestratorInputSchema` and NOT off
	 * `OrchestratorAgent.prototype.inputSchema`: that spelling type-checks and is `undefined` at
	 * module-load, because `inputSchema` is an instance field. It threw on import, and an architecture
	 * rail caught it — `tsc` had nothing to say.
	 */
	item: OrchestratorInputSchema.shape.item,
	/** The entry that triggered the turn, when the item carries one — becomes a run-token claim. */
	entryId: z.uuid().optional(),
	/**
	 * On an ISSUE_RESULT turn: the entry the composed answer MUST quote (§7.6).
	 *
	 * D6 has two halves and only one of them is the model's. In conversation, citing is a permission it
	 * exercises through the sentinel. On an issue return it is a MANDATE, so the use case sets
	 * `replyToEntryId` from this value and the model is never handed it — `OrchestratorInputSchema`
	 * deliberately omits it from the ISSUE_RESULT member. A model that cannot name the anchor cannot
	 * pick the wrong one, and cannot forget it either.
	 */
	originEntryId: z.uuid().optional(),
	model: z.enum(AgentModelId).optional(),
})

export const RunOrchestratorTurnOutputSchema = z.object({
	text: z.string(),
	replyToEntryId: z.uuid().optional(),
})

/**
 * The thread as the REPOSITORY hands it over.
 *
 * Spelled as a DERIVATION rather than by importing the Thread class, because the entity surface is
 * forbidden across contexts (`CROSS_CONTEXT_POLICY` — a write-model leak) while the repository surface
 * is allowed. Every other consumer of `ThreadRepository` here uses the returned instance without
 * naming its class; this only needs a type for a private parameter, so it takes one from the seam it
 * is already permitted to depend on instead of buying a policy exception.
 *
 * (The rail matches on line TEXT, so writing the forbidden specifier even inside a comment trips it —
 * which is how this comment found out.)
 */
type LoadedThread = NonNullable<Awaited<ReturnType<ThreadRepository['findById']>>>

/** How this turn addresses the CLI session: continue the thread's, or open one under an id we mint. */
interface SessionPlan {
	resumed: boolean
	id: string
}

/**
 * Runs ONE conversational turn for a thread (orchestrator pivot §7.3) — the write-side entry point
 * the `MailboxDispatcher` invokes for a `THREAD` target.
 *
 * It is `RunIssueTurn`'s sibling and deliberately keeps its shape: resolve the provider, decide the
 * session BEFORE anything commits, drain the run outside any transaction, persist the conclusion
 * afterwards. Three things differ, and each has a reason.
 *
 * ### 1. The session is keyed by THREAD
 * `findOrchestratorByThreadId` reads the row where `issue_id IS NULL` (§6.1). One orchestrator per
 * conversation is a DB-level fact (a partial unique), not a convention this use case maintains.
 *
 * ### 2. There is no SSE fan-out
 * `RunIssueTurn` pushes every frame to `AgentStreamRegistry`; this does not. The SSE frame schemas are
 * issue-keyed, so a conversational turn would need a new observable surface — out of scope for v1
 * (§7.3), and the conversation is already observable where it matters: in WhatsApp and the transcript.
 * Frames are still drained, because the accumulator is what turns them into the reply.
 *
 * ### 3. The reply is PARSED before it is persisted
 * The model signals a citation with a trailing sentinel, which `parseReply` strips. The event carries
 * the text the operator will actually see — a sentinel that reached `DeliverOrchestratorReply` would
 * be delivered verbatim into somebody's chat.
 *
 * ### What it does NOT do, said out loud
 * No single-active guard (`AgentStreamRegistry.beginSession`). `RunIssueTurn` needs one because two
 * runs could target one issue; here the DISPATCHER's per-target lease is the mutex (§3), and adding a
 * second one keyed by thread would be a second source of truth about whether a turn is in flight.
 */
@injectable()
export class RunOrchestratorTurn extends Handler<typeof RunOrchestratorTurnInputSchema, typeof RunOrchestratorTurnOutputSchema> {
	readonly name = 'run_orchestrator_turn' as const
	readonly inputSchema = RunOrchestratorTurnInputSchema
	readonly outputSchema = RunOrchestratorTurnOutputSchema

	constructor(
		private readonly agent: OrchestratorAgent,
		private readonly runners: AgentRunnerFactory,
		private readonly providerDetector: ProviderDetector,
		private readonly sessions: AgentSessionRepository,
		private readonly threads: ThreadRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<AgentApplicationErrors>('PROVIDER_NOT_DETECTED', `thread ${input.threadId} not found`)

		const detection = await this.resolveProvider(input.provider)
		const runner = this.runners.for(input.provider)
		const session = await this.resolveSession(input, detection)

		// The window is built only for a FRESH session: a resumed one already holds the conversation in
		// the CLI's own session, and re-sending it would both waste context and contradict §7.5.
		const entries = session.resumed ? [] : await this.buildWindow(thread)

		const accumulator = new TerminalOutputAccumulator({ issueId: input.threadId })
		for await (const event of this.agent.run(runner, {
			ownerId: input.ownerId,
			threadId: input.threadId,
			entryId: input.entryId,
			cwd: input.workspacePath,
			item: input.item,
			window: { seeded: !session.resumed, entries },
			contactKind: thread.contactRef.kind as ContactKind,
			mentionTag: thread.mentionGate.enabled ? thread.mentionGate.tag : undefined,
			model: input.model ?? AgentModelId.DEFAULT,
			session: session.resumed ? { resumeId: session.id } : { newId: session.id },
			binaryPath: detection.binaryPath,
			caps: detection.caps,
		})) {
			accumulator.feed(event)
		}

		const outcome = accumulator.outcome()
		// A stopped turn said nothing worth delivering. Logged rather than thrown: the dispatcher would
		// treat a throw as a failed turn and retry it, and re-running a conversational turn produces a
		// SECOND message in a real group.
		if (outcome.kind !== 'COMPLETED') {
			this.logging.warn({
				content: {
					message: 'orchestrator turn ended without a reply',
					threadId: input.threadId,
					stopKind: outcome.stopKind,
					detail: outcome.detail,
				},
			})
			return { text: '' }
		}

		const reply = parseReply(outcome.replyText)

		// THE MANDATORY HALF OF D6. An issue return always quotes the message that asked for the work,
		// so the anchor is imposed here rather than read off a sentinel: it is not a decision, and a
		// turn that forgot to emit one would otherwise arrive attached to nothing.
		const replyToEntryId = input.originEntryId ?? reply.replyToEntryId

		await this.withTransaction(tx, async tx => {
			if (reply.text.length > 0) {
				await this.domainEventRepository.save(
					new OrchestratorRepliedEvent({
						entityId: input.threadId,
						ownerId: input.ownerId,
						payload: { threadId: input.threadId, text: reply.text, replyToEntryId },
					}),
					tx,
				)
			}
			await this.upsertSession(input, accumulator.sessionId ?? session.id, tx)
		})

		return { text: reply.text, replyToEntryId }
	}

	private async resolveProvider(provider: ProviderKind): Promise<ProviderDetection> {
		const detection = await this.providerDetector.resolve(provider)
		if (!detection || detection.status !== ProviderStatus.DETECTED) {
			throw new BaseError<AgentApplicationErrors>('PROVIDER_NOT_DETECTED', `provider ${provider} is not installed`)
		}
		return detection
	}

	/**
	 * Continue the thread's CLI session, or open a new one — the same four guards `RunIssueTurn` applies,
	 * read off the same entity method, against the row keyed by thread instead of by issue.
	 *
	 * The cursor is deliberately NOT passed: `resumeDecision` compares it against the issue transcript's
	 * position, and a conversation has no equivalent notion of "the turn before this one" — every
	 * inbound message is a legitimate continuation. Model and cwd remain the premises worth checking.
	 */
	private async resolveSession(input: this['input'], detection: ProviderDetection): Promise<SessionPlan> {
		const existing = await this.sessions.findOrchestratorByThreadId(input.threadId)
		if (!existing) return { resumed: false, id: uuidv7() }

		if (!detection.caps?.sessionResume) {
			this.logging.warn({
				content: { message: 'provider has no native session resume — starting a fresh orchestrator session', threadId: input.threadId },
			})
			return { resumed: false, id: uuidv7() }
		}

		const decision = existing.resumeDecision({ model: input.model ?? AgentModelId.DEFAULT, cwd: input.workspacePath })
		if (decision.resume) return { resumed: true, id: decision.id }

		this.logging.warn({
			content: {
				message: 'orchestrator session resume invalidated — starting fresh',
				reason: decision.reason,
				threadId: input.threadId,
				abandonedSessionId: existing.agentSessionId,
			},
		})
		return { resumed: false, id: uuidv7() }
	}

	/**
	 * The conversation window a FRESH session is seeded with (§7.5) — the mechanism that would have died
	 * orphaned with `ClassifyMessage`, inherited here rather than reinvented.
	 *
	 * Reads through `ThreadRepository` (B4, decision 3): the window is a READ and stays outside the
	 * aggregate, but it is a read of the thread's OWN rows, so it is the thread repository's surface. One
	 * fewer injection than before, and no `DrizzleClient` in an agent use case.
	 */
	private async buildWindow(thread: LoadedThread) {
		const rows = await this.threads.recentEntries(thread.id.value, this.bufferLimit(thread.bufferSize))
		// Roster lookup by the JID the gateway recorded. A participant the snapshot has since dropped
		// still has their words in the transcript, so the fallback is the raw id rather than a hole —
		// losing WHO said something would make the window unreadable.
		const nameOf = (senderExternalId?: string): string => {
			if (!senderExternalId) return 'operator'
			return thread.participants.find(p => p.participantId === senderExternalId)?.name ?? senderExternalId
		}

		return rows.map(row => ({
			// The agent's OWN past lines are labelled `you`, not by the operator's name: a model reading
			// its own words attributed to somebody else answers them.
			speaker: row.kind === TranscriptKind.SYSTEM ? 'you' : nameOf(row.senderExternalId),
			// Already stripped of the tag — it is noise to the model, and leaving it in put `@codedm` at
			// the head of every rendered line.
			text: thread.textWithoutMention(row.text),
			// `canInvoke` and NOT `mentionsTag`: a muted participant's tagged message produced no turn, so
			// rendering it as addressed would invite the model to answer something the system ignored.
			addressed:
				row.kind === TranscriptKind.SYSTEM ? false : thread.canInvoke({ senderExternalId: row.senderExternalId ?? '', text: row.text }),
		}))
	}

	/** `BufferSize` is a STRING enum of numerals — the same parse `ClassifyMessage` used, inherited with it. */
	private bufferLimit(bufferSize: BufferSize): number {
		const n = Number.parseInt(bufferSize, 10)
		return Number.isFinite(n) && n > 0 ? n : 50
	}

	private async upsertSession(input: this['input'], agentSessionId: string, tx: Transaction): Promise<void> {
		const model = input.model ?? AgentModelId.DEFAULT
		const existing = await this.sessions.findOrchestratorByThreadId(input.threadId, tx)
		if (existing) {
			existing.recordTurn({ agentSessionId, model, cwd: input.workspacePath })
			await this.sessions.save(existing, tx)
			return
		}
		await this.sessions.save(
			AgentSession.create({
				ownerId: input.ownerId,
				// NO issueId — this is the orchestrator's row, and its absence is what identifies it.
				threadId: input.threadId,
				provider: input.provider,
				cwd: input.workspacePath,
				agentSessionId,
				model,
			}),
			tx,
		)
	}
}
