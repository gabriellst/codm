import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { BaseError, CommandQueue, Handler, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PHASE_EDIT_MIN_INTERVAL_MS, THINKING_GLYPHS, describeToolActivity, pickThinkingVerb, thinkingLine } from '@codm/contracts/cues'
import type { ToolVerb } from '@codm/contracts/cues'
import {
	AgentModelId,
	type BufferSize,
	ContactKind,
	ProviderKind,
	ProviderStatus,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import { modelsFor } from '@catalog'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { ConsumedMessageRepository } from '@thread/repositories/ConsumedMessageRepository'
import { ChannelSender } from '@thread/services/ChannelSender'
import { ReplyStreamer, streamKey } from '@thread/services/ReplyStreamer'
import { beginTypingPresence, endTypingPresence } from '@thread/services/TypingPresence'
import { AGENT_SPEAKER, INITIAL_CUT_STATE, advanceCutState, decideCut, type ReplyCutState } from '@thread/objects'
import { OrchestratorAgent, OrchestratorInputSchema } from '../agents/OrchestratorAgent'
import { parseReply } from '../agents/OrchestratorAgent/citation'
import { AgentRunnerFactory } from '../services/AgentRunnerFactory'
import { ProviderDetector, type DetectedProvider, type ProviderDetection } from '../services/ProviderDetector'
import { TerminalOutputAccumulator } from '../services/TerminalOutputAccumulator'
import { AgentSessionRepository } from '../repositories/AgentSessionRepository'
import { MessageVia } from '../enums'
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
 * The friendly copy a "Pensando" placeholder is edited to when a turn ends WITHOUT delivering an
 * answer (thinking-indicator spec, AC-6) — never left standing as if the agent were still working.
 * Local to this turn: the placeholder is opened and closed here, and nowhere else composes this text.
 */
export const THINKING_ERROR_COPY = 'Tive um problema para terminar essa tarefa. Pode tentar de novo?'

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
		 * documents (`LibSqlMailboxDispatcher.handlerFor`: "the parent bound the child"). It opens no
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
		/**
		 * THE "PENSANDO" PLACEHOLDER (thinking-indicator spec, decision 2). Same precedent as
		 * `ReplyStreamer` two lines up: `services` is the permitted cross-context surface, and this is the
		 * one seam that puts words on the channel BEFORE the model has said anything, so the turn — the
		 * only place that knows a run is about to start — is the only place that can open it.
		 */
		private readonly sender: ChannelSender,
		/**
		 * THE ECHO CLAIM for the "Pensando" placeholder (bug fix, thinking-indicator spec). WhatsApp
		 * bridges every message this account sends back INBOUND (`fromMe: true`) — the same loop
		 * `DeliverChannelMessage`'s docblock names. `DeliverChannelMessage.recordOutbound` defends every
		 * OTHER outbound message by claiming its platform id into this ledger BEFORE the echo can arrive,
		 * which is what makes `ConsumeInboundMessage`'s dedup latch recognise "our own speech" and no-op
		 * before any thread lookup. The placeholder is sent directly, here, before any command exists to
		 * claim through it — so without this same claim its echo used to reach `ConsumeInboundMessage`
		 * UNCLAIMED, get ingested as a brand-new inbound message, and — because `fromMe` alone decides
		 * the sender — attributed to `OPERATOR_PARTICIPANT_ID`: the "✻ …" placeholder showed up in the
		 * transcript as if the channel OWNER had typed it, not the agent.
		 */
		private readonly consumed: ConsumedMessageRepository,
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

		const channelId = thread.channelId
		const remoteId = thread.contactRef.externalId

		// "digitando…" ON (streaming spec, AC-10 — `SustainTypingPresence` names this call site as "WHO
		// TURNS IT ON"). Here and not earlier: the indicator claims the agent is WRITING, and the two
		// resolutions above can still refuse the turn — a provider that is not installed would light an
		// indicator for an answer that is never coming. "I saw it" is already covered, at ingest, by the
		// 👀 (AC-9), which is why nothing is lost by waiting for the run to actually be about to start.
		//
		// Nobody turns it OFF from here, and that is the design: the platform expires the signal in ~10s
		// if a beat is missed, the ceiling in the payload ends the loop even on a healthy process, and
		// `DeliverChannelMessage` cancels it as an optimisation once the words are on the wire.
		await beginTypingPresence({ commands: this.commands, logging: this.logging, ownerId: input.ownerId, channelId, remoteId })

		// THE STREAMED REPLY (streaming spec). The turn is the only place that holds the answer while it
		// is still growing, so it is the only place the cadence can be fed from — but it stays ignorant of
		// the channel: `cut` mints a sequence and enqueues a durable command, and that is all.
		const streamed = this.streams.begin({
			ownerId: input.ownerId,
			channelId,
			remoteId,
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

		// THE "PENSANDO" PLACEHOLDER (thinking-indicator spec, decisions 1-2). Opened BEFORE the model has
		// said anything, on the SAME slot `streamed` just cleared — so the first real cut finds a stream
		// already `opened()` here and edits THIS message instead of sending a second one (AC-3: one
		// messageId for the whole reply, thinking phase included). Capability-gated like every streamed
		// send (`StreamChannelReply`'s own check): a channel that cannot edit must never be handed a
		// message it can only ever leave standing — no placeholder is the silent degradation, exactly
		// today's (pre-indicator) behaviour.
		//
		// PER-THREAD OPT-OUT (thinking-indicator spec, per-thread setting). `thread.thinkingIndicatorEnabled`
		// reuses the SAME degradation: false is treated exactly like "this channel cannot edit" — no
		// placeholder is sent or edited, the final reply lands unstreamed-for-the-thinking-phase, same as
		// it does today for a channel with no edit capability. `beginTypingPresence` above and the console
		// spinner are UNAFFECTED — this gate is scoped to the channel phase-message only.
		const key = streamKey(channelId, remoteId)
		let thinkingMessageId: string | undefined
		let thinkingGlyphIndex = 0
		// TRUE the moment a REAL cut lands (below) — the phase-verb edits above stop firing, and the
		// terminal catch (further down) stops treating the placeholder as "nothing shown yet".
		let firstCutLanded = false

		if (this.sender.capabilities.edit && thread.thinkingIndicatorEnabled) {
			// No tool has run yet at open time, so the OPENING line is the one place that still draws from
			// the random pool (`pickThinkingVerb`) — every PHASE edit below is tool-driven instead
			// (`describeToolActivity`), which is total over every tool name and therefore never falls back
			// to the pool (thinking-indicator spec, decision 4).
			const openingVerb = pickThinkingVerb()
			const opened = await tryCatchAsync(() => this.sender.send({ channelId, remoteId, text: thinkingLine(openingVerb) }, input.ownerId))
			if (opened.success) {
				const messageId = opened.data.messageId
				thinkingMessageId = messageId
				this.streams.opened(key, {
					ownerId: input.ownerId,
					messageId,
					sentAtEpochMs: Date.now(),
					sequence: 0,
					baseOffset: 0,
					deliveredLength: 0,
				})

				// THE CLAIM (see the constructor docblock above). Best-effort like the send it follows — a
				// failed claim costs, at worst, reintroducing the bug this fixes for THIS one placeholder, never
				// the turn. `DeliverChannelMessage.recordOutbound` re-claims (and links) the SAME messageId
				// once the reply is delivered — `claim`'s ON CONFLICT DO NOTHING makes that a safe no-op.
				const claimed = await tryCatchAsync(() => this.consumed.claim({ ownerId: input.ownerId, channelId, platformMessageId: messageId }))
				if (!claimed.success) {
					this.logging.info({
						content: { message: 'thinking placeholder echo not claimed (best-effort)', channelId, reason: claimed.error.message },
					})
				}
			} else {
				this.logging.info({
					content: { message: 'thinking placeholder not opened (best-effort)', channelId, reason: opened.error.message },
				})
			}
		}

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
		// THE TURN'S OWN INSTANT, read ONCE and handed down — the clock the prompt renders as `agora:` and
		// the reference every `hora` attribute is formatted against. Read here rather than in the prompt
		// builder for the reason `Thread.canInvoke` and `LoopSchedule` state for themselves: a renderer
		// that reads a clock is a renderer no test can pin. Once, and not per line, so a long window
		// cannot straddle midnight halfway through and date its own lines inconsistently.
		const now = new Date()
		// The (tool, target) PAIR of the last phase edit actually APPLIED to the channel — the drain's
		// only observable "the run moved to a new phase" signal (thinking-indicator spec, decisions 2 and
		// 4: "muda o par (tool, target) — não só a tool", "a cada MUDANÇA DE FASE real do run, não timer
		// de animação"). Both `undefined` at the start so the FIRST tool call always counts as one.
		let lastPhaseTool: string | undefined
		let lastPhaseTarget: string | undefined
		let lastPhaseEditAtMs: number | undefined
		// A phase change OBSERVED inside the `PHASE_EDIT_MIN_INTERVAL_MS` spacing window — coalesced here
		// instead of firing a second edit right away. Flushed reactively, off the run's OWN event stream
		// (top of the `frame` branch below), the first time a later frame arrives after the window has
		// elapsed — deliberately never a `setTimeout`, so a turn that ends mid-window simply drops the
		// pending phase instead of leaving a timer dangling past the turn's own lifetime.
		let pendingPhase: { tool: string; target?: string; verb: ToolVerb } | undefined

		/** Sends the edit, advances the glyph, and stamps the pacing clock — the ONE path that talks to the channel. */
		const applyPhaseEdit = async (phase: { tool: string; target?: string; verb: ToolVerb }, nowMs: number) => {
			if (!thinkingMessageId) return
			lastPhaseTool = phase.tool
			lastPhaseTarget = phase.target
			lastPhaseEditAtMs = nowMs
			thinkingGlyphIndex = (thinkingGlyphIndex + 1) % THINKING_GLYPHS.length
			const glyph = THINKING_GLYPHS[thinkingGlyphIndex]
			const messageId = thinkingMessageId
			const phased = await tryCatchAsync(() =>
				this.sender.edit({ channelId, remoteId, messageId, text: thinkingLine(phase.verb, glyph, phase.target) }, input.ownerId),
			)
			if (!phased.success) {
				this.logging.info({
					content: { message: 'thinking phase not updated (best-effort)', channelId, reason: phased.error.message },
				})
			}
		}
		try {
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
				now,
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

				if (event.type === 'frame') {
					const phaseNowMs = Date.now()
					// FLUSH a coalesced phase — the "aplica no próximo evento" half of decision 4. Checked on
					// EVERY frame (not just `tool_use`) so a pending phase from a burst still surfaces once the
					// spacing window opens, even if the run's next event is a `text_delta`.
					if (
						pendingPhase &&
						thinkingMessageId &&
						!firstCutLanded &&
						(lastPhaseEditAtMs === undefined || phaseNowMs - lastPhaseEditAtMs >= PHASE_EDIT_MIN_INTERVAL_MS)
					) {
						const phase = pendingPhase
						pendingPhase = undefined
						await applyPhaseEdit(phase, phaseNowMs)
					}

					// THE PHASE EDIT (thinking-indicator spec, decisions 2 and 4). Silenced once a REAL cut has
					// landed (`!firstCutLanded`) — from that instant the placeholder IS the growing answer, not
					// the wait, and a phase edit would overwrite text the contact is already reading. Triggers on
					// a change to the PAIR (tool, target), not just the tool name, so re-reading a DIFFERENT file
					// with the SAME tool still moves the line (e.g. two `Read` calls on different paths).
					if (event.frame.kind === 'tool_use' && thinkingMessageId && !firstCutLanded) {
						const { tool, target } = event.frame
						const changedFromApplied = tool !== lastPhaseTool || target !== lastPhaseTarget
						const changedFromPending = !pendingPhase || pendingPhase.tool !== tool || pendingPhase.target !== target
						if (changedFromApplied && changedFromPending) {
							// TOOL-DRIVEN verb (decision 4) — `describeToolActivity` is total over every tool name
							// (an unmapped one still resolves to "Trabalhando"), so the random pool never enters here;
							// it stays reserved for the opening line, which has no tool to key off yet.
							const { verb } = describeToolActivity(tool)
							if (lastPhaseEditAtMs === undefined || phaseNowMs - lastPhaseEditAtMs >= PHASE_EDIT_MIN_INTERVAL_MS) {
								await applyPhaseEdit({ tool, target, verb }, phaseNowMs)
							} else {
								pendingPhase = { tool, target, verb }
							}
						}
					}

					// `text_delta` is what the SSE panel deliberately drops (rendering deltas AND the consolidated
					// block would print every token twice) — and it is exactly what streaming needs, because it is
					// the only frame that arrives WHILE a sentence is still being written. `assistant_text` closes a
					// block, so it settles what the deltas were building.
					if (event.frame.kind === 'text_delta') pendingDelta += event.frame.delta
					else if (event.frame.kind === 'assistant_text') {
						settledText = settledText.length > 0 ? `${settledText}\n${event.frame.text}` : event.frame.text
						pendingDelta = ''
					}

					// PER-THREAD OPT-OUT (reactions/streaming spec, per-thread setting). `thread.streamingEnabled
					// === false` means no INTERMEDIATE cut is ever decided or sent — `decideCut` is not even
					// called, so `cutState`/`spoke`/`firstCutLanded` never advance from this branch. Two shapes
					// fall out of that, both already covered elsewhere with no extra code:
					//   - `thinkingIndicatorEnabled` ALSO true: the placeholder opened above keeps receiving
					//     PHASE edits for the whole turn (the `tool_use` branch above only checks
					//     `!firstCutLanded`, which never flips here), and `streamed.opened(key, …)` was already
					//     called when the placeholder opened — so `DeliverChannelMessage.finishStreamedReply` →
					//     `ReplyStreamer.claimFinal` finds the stream OPENED and returns EDIT, turning the
					//     placeholder into the final text. One message, not two.
					//   - `thinkingIndicatorEnabled` ALSO false: no placeholder was ever opened, `streams.opened`
					//     was never called, `claimFinal` finds NONE, and `DeliverChannelMessage.handle` falls
					//     through to its plain `this.sender.send(...)` — a single message, exactly today's
					//     non-streaming/non-indicator behaviour.
					if (thread.streamingEnabled) {
						const nowMs = Date.now()
						const decision = decideCut({ text: settledText + pendingDelta, nowMs, state: cutState })
						if (decision.cut) {
							cutState = advanceCutState(decision, nowMs)
							await streamed.cut(decision.text)
							spoke = true
							firstCutLanded = true
						}
					}
				}
			}
		} catch (error) {
			// CASE 3 OF THE CATCH TERMINAL (T4's audit finding, folded into this task): an unhandled throw
			// around `agent.run()` is a non-delivery exactly like the two below — the typing loop and the
			// placeholder must not be left for the 5-minute ceiling to close. Never swallowed: the dispatcher
			// still decides retry vs. poison off the rethrown error (`LibSqlMailboxDispatcher.runTurn`).
			await this.closeCuesOnNoDelivery(
				{ channelId, remoteId, ownerId: input.ownerId },
				{ messageId: thinkingMessageId, landed: firstCutLanded },
			)
			throw error
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
			// CASE 1 OF THE CATCH TERMINAL (T4's audit finding). A stopped turn is a non-delivery exactly
			// like the throw case above — nothing reaches `deliver_channel_message` on this path either.
			await this.closeCuesOnNoDelivery(
				{ channelId, remoteId, ownerId: input.ownerId },
				{ messageId: thinkingMessageId, landed: firstCutLanded },
			)
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

		// CASE 2 OF THE CATCH TERMINAL (T4's audit finding). A COMPLETED outcome that parsed to an empty
		// reply is STILL a non-delivery: no event was saved above, so nothing will ever call
		// `deliver_channel_message` for this turn. `upsertSession` above is unaffected — the session
		// advanced regardless of whether the model said anything worth sending.
		if (reply.text.length === 0) {
			await this.closeCuesOnNoDelivery(
				{ channelId, remoteId, ownerId: input.ownerId },
				{ messageId: thinkingMessageId, landed: firstCutLanded },
			)
		}

		return { text: reply.text, replyToEntryId, spoke }
	}

	/**
	 * THE CATCH TERMINAL for a turn that ends WITHOUT delivering anything (thinking-indicator spec,
	 * AC-6) — T4's audit named three shapes that all left `SustainTypingPresence`'s five-minute ceiling
	 * as the only off-switch: a non-COMPLETED outcome, a COMPLETED one with an empty reply, and an
	 * unhandled throw around `agent.run()`. All three call this.
	 *
	 * Two best-effort cues (streaming spec decision 12), never a hard failure stacked on whatever
	 * already went wrong:
	 *   1. `endTypingPresence` — stop paying for "digitando…" beats nobody has an answer for, rather
	 *      than leaving the loop to find its own ceiling five minutes later.
	 *   2. IF the "Pensando" placeholder was opened AND no real cut ever grew it: edit it to the
	 *      friendly error copy instead of leaving "✻ {verbo}…" standing. A placeholder that already
	 *      carries a real cut is left untouched — the contact is reading an actual, if incomplete,
	 *      answer, and overwriting it with an error would be worse than leaving it as it stands.
	 */
	private async closeCuesOnNoDelivery(
		conversation: { channelId: string; remoteId: string; ownerId: string },
		placeholder: { messageId: string | undefined; landed: boolean },
	): Promise<void> {
		await endTypingPresence({
			commands: this.commands,
			logging: this.logging,
			channelId: conversation.channelId,
			remoteId: conversation.remoteId,
		})

		if (!placeholder.messageId || placeholder.landed) return
		const messageId = placeholder.messageId
		const edited = await tryCatchAsync(() =>
			this.sender.edit(
				{ channelId: conversation.channelId, remoteId: conversation.remoteId, messageId, text: THINKING_ERROR_COPY },
				conversation.ownerId,
			),
		)
		if (!edited.success) {
			this.logging.info({
				content: {
					message: 'thinking placeholder not closed on error (best-effort)',
					channelId: conversation.channelId,
					reason: edited.error.message,
				},
			})
		}
	}

	private async resolveProvider(provider: ProviderKind): Promise<DetectedProvider> {
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
	 * fewer injection than before, and no direct drizzle handle in an agent use case.
	 */
	private async buildWindow(thread: LoadedThread) {
		const rows = await this.threads.recentEntries(thread.id.value, this.bufferLimit(thread.bufferSize))

		return rows.map(row => ({
			// The `de` attribute, decided here because this is where the row's kind and the roster meet.
			// The agent's OWN past lines are labelled `you`, not by the operator's name: a model reading
			// its own words attributed to somebody else answers them. A whisper the SCHEDULER fired says
			// so — `fired_by_loop` exists precisely so a tick stops arriving as `operator`.
			speaker: this.speakerOf(thread, row),
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
			// The `hora` and the `ref` — the row's own instant, and its address. The address is what makes
			// a citation of an OLD message expressible at all: before the grammar the prompt printed one
			// id (the live item's), so "attach this to what Marina asked an hour ago" had no spelling.
			at: row.at,
			ref: row.entryId,
			// Absent unless the room was excluded. A `WHISPER` is the operator (or their schedule) talking
			// to the agents only, and it used to render exactly like a message the group could see.
			via: row.kind === TranscriptKind.WHISPER ? (row.firedByLoop ? MessageVia.LOOP : MessageVia.STEER) : undefined,
			// The media facts, verbatim from the row — the grammar renders them as `midia` + `arquivo`.
			messageType: row.messageType,
			mediaPath: row.mediaPath,
		}))
	}

	/**
	 * WHO a transcript row is from, as the `de` attribute spells it.
	 *
	 * Three cases and no fourth: the agent's own line, a scheduled whisper, and everybody else — whom
	 * the roster names (`Thread.displayNameOf`, shared with the ingest so the same person cannot appear
	 * under two identities in one prompt).
	 */
	private speakerOf(thread: LoadedThread, row: { kind: TranscriptKind; senderExternalId?: string; firedByLoop?: string }): string {
		if (row.kind === TranscriptKind.SYSTEM) return AGENT_SPEAKER
		if (row.firedByLoop) return `${MessageVia.LOOP}:${row.firedByLoop}`
		return thread.displayNameOf(row.senderExternalId)
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
