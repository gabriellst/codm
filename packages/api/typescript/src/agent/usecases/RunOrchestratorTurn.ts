import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { BaseError, CommandQueue, Handler, LoggingService, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import {
	AgentModelId,
	type BufferSize,
	ContactKind,
	ProviderKind,
	ProviderStatus,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { modelsFor } from '@codm/contracts/catalog'
import { ThreadRepository } from '@thread/repositories'
import { ReplyStreamer, beginTypingPresence } from '@thread/services'
import { INITIAL_CUT_STATE, advanceCutState, decideCut, type ReplyCutState } from '@thread/objects'
import { OrchestratorAgent, OrchestratorInputSchema } from '../agents/OrchestratorAgent'
import { parseReply } from '../agents/OrchestratorAgent/citation'
import { AgentRunnerFactory } from '../services/AgentRunnerFactory'
import { ProviderDetector, type ProviderDetection } from '../services/ProviderDetector'
import { TerminalOutputAccumulator } from '../services/TerminalOutputAccumulator'
import { AgentSessionRepository } from '../repositories'
import { AgentSession } from '../entities/AgentSession'
import { OrchestratorRepliedEvent } from '../events/OrchestratorRepliedEvent'
import { GetOpenStops } from './GetOpenStops'
import type { AgentApplicationErrors } from '../errors'
import { isTransportStopKind } from '../enums/TransportStopKind'

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
	/**
	 * Whether this turn already put a message in the operator's real chat — the dispatcher's retry gate
	 * (`TurnReport.spoke`). True as soon as a progressive cut streamed (`streamed.cut`), because that
	 * cut already landed in WhatsApp; a turn that never streamed one and then ended without completing
	 * has said nothing yet.
	 */
	spoke: z.boolean(),
	/** Present only when the ending was a TRANSPORT stop kind — the dispatcher's cue to retry via `fail()` instead of consuming the item with `complete()`. */
	transportStop: z.object({ detail: z.string() }).optional(),
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
 * ### 2. There is no SSE fan-out — but there IS a channel one
 * `RunIssueTurn` pushes every frame to `AgentStreamRegistry`; this does not. The SSE frame schemas are
 * issue-keyed, so a conversational turn would need a new observable surface — out of scope for v1
 * (§7.3), and the conversation is already observable where it matters: in WhatsApp and the transcript.
 * Frames are still drained, because the accumulator is what turns them into the reply.
 *
 * Since the streaming spec they are drained for a SECOND reason: the reply is pushed to WhatsApp while
 * it is still being written. That fan-out goes to `ReplyStreamer` and not to the SSE registry, and the
 * distinction is the point — the console already has its own live view, while the channel, which is
 * the product's main surface, had nothing but silence until the answer was complete.
 *
 * The DOMAIN is untouched by it (decision 3): this use case still saves exactly ONE
 * `OrchestratorRepliedEvent`, at the end, carrying the whole text. Modelling partial replies as facts
 * would put fragments in the transcript and hand them back to the model as its own conversation
 * history. Streaming lives in the delivery layer, and nowhere else.
 *
 * ### 3. The reply is PARSED before it is persisted
 * The model signals a citation with a trailing sentinel, which `parseReply` strips. The event carries
 * the text the operator will actually see — a sentinel that reached `DeliverOrchestratorReply` would
 * be delivered verbatim into somebody's chat.
 *
 * ### What it does NOT do, said out loud
 * No single-active guard. O lease por alvo do dispatcher é o mutex (§3), aqui e em `RunIssueTurn` —
 * que até 2026-08-05 carregava um segundo guard em memória, exatamente a "segunda fonte de verdade"
 * que este parágrafo já advertia contra, e que divergiu do lease em produção.
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
		/**
		 * AC-4's read, injected as a child Handler — the shape the pipeline supports and the dispatcher
		 * documents (`DrizzleMailboxDispatcher.handlerFor`: "the parent bound the child"). It opens no
		 * transaction of its own; it is a read, and it belongs to this context.
		 */
		private readonly openStops: GetOpenStops,
		private readonly streams: ReplyStreamer,
		/**
		 * Held for ONE reason: `beginTypingPresence` is a stateless seam and takes the queue it enqueues
		 * on. The thread context still owns the command, its payload, its ceiling and its job id — this
		 * use case never names any of them.
		 */
		private readonly commands: CommandQueue,
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

		// THE UNANSWERED QUESTIONS (issue-resume spec, AC-4). Read on EVERY turn, resumed sessions
		// included, and unlike the window that is not an inconsistency: the window is CONVERSATION, which
		// the CLI's own session already holds, while this is STATE — a stop the operator answered two turns
		// ago must be gone from the next prompt, and one raised since must appear in it. Same reason
		// `customPrompt` is read fresh off the aggregate below; the runner folds the system prompt into
		// every run, resumed ones included, which is what makes both possible.
		const { stops } = await this.openStops.execute({ threadId: input.threadId })

		// "digitando…" ON (streaming spec, AC-10 — `SustainTypingPresence` names this call site as "WHO
		// TURNS IT ON"). Here and not earlier: the indicator claims the agent is WRITING, and the two
		// resolutions above can still refuse the turn — a provider that is not installed would light an
		// indicator for an answer that is never coming. "I saw it" is already covered, at ingest, by the
		// 👀 (AC-9), which is why nothing is lost by waiting for the run to actually be about to start.
		//
		// Nobody turns it OFF from here, and that is the design: the platform expires the signal in ~10s
		// if a beat is missed, the ceiling in the payload ends the loop even on a healthy process, and
		// `DeliverChannelMessage` cancels it as an optimisation once the words are on the wire.
		await beginTypingPresence({
			commands: this.commands,
			logging: this.logging,
			ownerId: input.ownerId,
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
		})

		// THE STREAMED REPLY (streaming spec). The turn is the only place that holds the answer while it
		// is still growing, so it is the only place the cadence can be fed from — but it stays ignorant of
		// the channel: `cut` mints a sequence and enqueues a durable command, and that is all.
		const streamed = this.streams.begin({
			ownerId: input.ownerId,
			channelId: thread.channelId,
			remoteId: thread.contactRef.externalId,
			// THE ANCHOR, HANDED OVER BEFORE THE MODEL HAS SAID ANYTHING (founder: "ao finalizar uma tarefa,
			// deve responder a mensagem que a criou").
			//
			// Only `originEntryId` can ride this, and that is precisely the case the ask is about. D6's two
			// halves split right here: the ISSUE_RESULT anchor is a MANDATE that arrives as INPUT, so it
			// already exists at `begin`; the conversational citation is the model's own sentinel and is not
			// parsed until the run ends — by which time the first balloon is long sent, and an edit cannot
			// add a quote. Those replies still get their citation from the final `deliver_channel_message`,
			// which is the unstreamed path whenever no cut ever landed.
			replyToEntryId: input.originEntryId,
		})
		let cutState: ReplyCutState = INITIAL_CUT_STATE
		// The reply as the FRAMES have it so far: blocks the decoder has already consolidated, plus the one
		// still arriving token by token. An APPROXIMATION on purpose — the canonical text is the CLI's own
		// terminal frame, read below — and decision 7 is what makes the approximation safe: the final edit
		// carries the canonical string, so anything the frames got slightly wrong is overwritten at the end.
		let settledText = ''
		let pendingDelta = ''
		// TRUE the moment a cut is streamed — this turn has then already put words in the real WhatsApp
		// group, and `TurnReport.spoke` is read straight off this variable on every return path below.
		let spoke = false

		const accumulator = new TerminalOutputAccumulator({ issueId: input.threadId })
		for await (const event of this.agent.run(runner, {
			ownerId: input.ownerId,
			threadId: input.threadId,
			entryId: input.entryId,
			cwd: input.workspacePath,
			item: input.item,
			window: { seeded: !session.resumed, entries },
			openStops: stops,
			contactKind: thread.contactRef.kind as ContactKind,
			mentionTag: thread.mentionGate.enabled ? thread.mentionGate.tag : undefined,
			// Read fresh off the aggregate on EVERY turn, not captured when the CLI session opened — which
			// is what makes editing the prompt in the console take effect on the next message instead of
			// after the session happens to be invalidated. It works because the runner folds `systemPrompt`
			// into the first stdin line of every run, resumed ones included.
			customPrompt: thread.customPrompt,
			// The machine's zone, read here rather than stored anywhere: CODM runs on the operator's own
			// machine, which is the same equivalence the console relies on for this very field when it
			// fills the loop form. Read per turn, like `customPrompt` above — a daemon that outlives a
			// timezone change should not keep scheduling in the old one.
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			model: input.model ?? AgentModelId.DEFAULT,
			// WHAT THE CLI DRIVING THIS TURN OFFERS — a lookup in the declared relation, resolved here
			// because this is the layer that holds the provider and the agent deliberately does not (see
			// `availableModels` on the input schema, and `AgentRunRequest`'s note on why there is no
			// `provider` field). Empty for a CLI nothing has ever driven, and the section then stays out.
			availableModels: [...modelsFor(input.provider)],
			session: session.resumed ? { resumeId: session.id } : { newId: session.id },
			binaryPath: detection.binaryPath,
			caps: detection.caps,
		})) {
			accumulator.feed(event)

			// `text_delta` is what the SSE panel deliberately drops (rendering deltas AND the consolidated
			// block would print every token twice) — and it is exactly what streaming needs, because it is
			// the only frame that arrives WHILE a sentence is still being written. `assistant_text` closes a
			// block, so it settles what the deltas were building.
			if (event.type === 'frame') {
				if (event.frame.kind === 'text_delta') pendingDelta += event.frame.delta
				else if (event.frame.kind === 'assistant_text') {
					settledText = settledText.length > 0 ? `${settledText}\n${event.frame.text}` : event.frame.text
					pendingDelta = ''
				}

				const nowMs = Date.now()
				const decision = decideCut({ text: settledText + pendingDelta, nowMs, state: cutState })
				if (decision.cut) {
					cutState = advanceCutState(decision, nowMs)
					await streamed.cut(decision.text)
					spoke = true
				}
			}
		}

		const outcome = accumulator.outcome()
		// A stopped turn said nothing worth delivering. Logged rather than thrown: the dispatcher would
		// treat a throw as a failed turn and retry it, and re-running a conversational turn produces a
		// SECOND message in a real group — which is exactly why the dispatcher's retry for a transport
		// stop now requires `spoke === false` rather than applying to every stop: a turn that already
		// streamed a cut has already spoken in that same group, and retrying it would reproduce the very
		// duplicate this comment has warned about since before retries existed.
		if (outcome.kind !== 'COMPLETED') {
			this.logging.warn({
				content: {
					message: 'orchestrator turn ended without a reply',
					threadId: input.threadId,
					stopKind: outcome.stopKind,
					detail: outcome.detail,
				},
			})
			return {
				text: '',
				spoke,
				...(isTransportStopKind(outcome.stopKind) ? { transportStop: { detail: outcome.detail ?? outcome.stopKind } } : {}),
			}
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

		return { text: reply.text, replyToEntryId, spoke }
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
			// Already stripped of the tag — it is noise to the model, and leaving it in put `@codm` at
			// the head of every rendered line.
			text: thread.textWithoutMention(row.text),
			// `addressedToAgent` and NOT `mentionsTag`: a muted participant's tagged message produced no
			// turn, so rendering it as addressed would invite the model to answer something the system
			// ignored.
			//
			// And NOT `canInvoke` either, which is the same predicate PLUS the freshness window. Every row
			// in this window is history — by the time a turn renders it, it is older than the window
			// almost by definition — so judging it by `canInvoke` would mark all but the newest line
			// unaddressed and rewrite what the model reads. "Was this for the agent" is a property of the
			// message; "may it start a turn now" is a property of the moment, and only the ingest asks it.
			addressed:
				row.kind === TranscriptKind.SYSTEM
					? false
					: thread.addressedToAgent({ senderExternalId: row.senderExternalId ?? '', text: row.text }),
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
