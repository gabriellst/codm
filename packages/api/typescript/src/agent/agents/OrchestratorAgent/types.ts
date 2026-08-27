import { z } from '@codm/core-typescript'
import { AgentModelId, ContactKind, Language, MailboxItemKind, MessageType, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentRunOutcome, MessageVia } from '../../enums'
import { ProviderCapabilitiesSchema } from '../../types/ProviderCapabilities'
import { OpenStopSchema } from '../../usecases/GetOpenStops'

/**
 * One line of the conversation window (§7.5).
 *
 * The fields are the FLAT shape the prompt renders, restated here rather than imported from the
 * thread context. That is the rule `ClassifyIssueAgent/types.ts` wrote down for exactly this
 * situation: an agent input describes what it is handed, and importing a transcript row type across
 * the context boundary would couple the agent runtime to `thread`'s persistence shape.
 */
const WindowEntrySchema = z.object({
	/**
	 * The `de` attribute, rendered VERBATIM: `operator` for the owner (`OPERATOR_PARTICIPANT_ID`), the
	 * roster `name` for other participants, `you` for the agent's own SYSTEM lines, `loop:<label>` for a
	 * scheduled whisper. Never a raw JID — the window is read by a model that will echo what it sees.
	 */
	speaker: z.string().min(1),
	/** Already through `Thread.textWithoutMention` (`Thread.ts:147`) — the tag is noise to the model. */
	text: z.string(),
	/**
	 * Whether this line was ADDRESSED to the agent — `Thread.addressedToAgent`, which weighs paused,
	 * roster and tag together. Not `mentionsTag` alone: a muted participant's tagged message produced
	 * no turn, and rendering it as addressed would invite the model to answer something the system
	 * deliberately ignored. And not `canInvoke`, which adds the freshness window every history row
	 * fails by construction.
	 */
	addressed: z.boolean(),
	/**
	 * WHEN it was said. The `hora` attribute, formatted against the machine's zone at render time.
	 *
	 * A conversation the model reads without timestamps is a conversation it cannot place in time: "de
	 * manhã eu te falei" has no referent, and a message from yesterday reads exactly like one from a
	 * minute ago. It is the transcript row's own `at`, never a re-derivation.
	 */
	at: z.date(),
	/**
	 * The `ref` attribute — this line's transcript entry id, and the reason quoting an OLD message is
	 * possible at all.
	 *
	 * ADDRESS, never identity: the model uses it in `[quote: <ref>]` and is forbidden from putting it in
	 * prose. Before the grammar the only id in the prompt was the live message's own, so "attach this to
	 * what Marina asked an hour ago" was a thing the model could want and could not express.
	 */
	ref: z.uuid(),
	/**
	 * HOW this line reached the conversation, when the room never saw it — absent ⟺ it was said in the
	 * chat, in front of everyone. See `MessageVia`.
	 */
	via: z.enum(MessageVia).optional(),
	/**
	 * The kind of MEDIA behind this line (IMAGE | VIDEO | AUDIO | DOCUMENT | STICKER) — absent for plain
	 * text. Rendered as the `midia` attribute so the model knows the text is a caption or placeholder.
	 */
	messageType: z.enum(MessageType).optional(),
	/**
	 * Absolute path of the downloaded attachment on this machine — the `arquivo` attribute. The agent
	 * analyses it with its own tools; absent when the gateway's download failed.
	 */
	mediaPath: z.string().optional(),
})

/**
 * ONE line this message is a REPLY to, embedded in the block as `responde: <autor>, <hora> — «…»`.
 *
 * ### Why the whole excerpt and not an id
 * The model cannot dereference one, and the window is no substitute: it is capped by `bufferSize`, a
 * RESUMED session only carries the tail since the cursor, and even when the line IS present nothing
 * marks WHICH of forty lines was answered. A reply is typically a FRAGMENT ("depois", "o segundo",
 * "pode") whose meaning lives entirely in the line it lands on.
 *
 * ### Why it is no longer only the AGENT's own line
 * It used to be, and that was the invocation gate's verdict wearing a second hat: quoting the agent
 * lowers the mention gate, so `IngestChannelMessage` had the text in hand exactly when the gate stood
 * down and dropped it in every other case. A reply to somebody ELSE in the room reaches the agent just
 * as often and is exactly as unreadable alone — worse, actually, because a fragment read against the
 * wrong antecedent produces a confident answer to a question nobody asked.
 */
const QuotedMessageSchema = z.object({
	/** `you` for the agent's own line (`AGENT_SPEAKER`), the roster name for anyone else. */
	speaker: z.string().min(1),
	/**
	 * When the quoted line was said.
	 *
	 * `coerce` because this rides the MAILBOX payload, which is a JSON column: a `Date` written by
	 * `IngestChannelMessage` comes back out of SQLite as an ISO string, and a bare `z.date()` would
	 * reject the very turn it was added for. The window's `at` next door needs no coercion — it is built
	 * in-process by `RunOrchestratorTurn` and never serialized.
	 */
	at: z.coerce.date(),
	text: z.string().min(1),
})

/** The operator (or another invoker) said something. The conversational turn. */
const OperatorMessageItemSchema = z.object({
	kind: z.literal(MailboxItemKind.OPERATOR_MESSAGE),
	/**
	 * The ONLY id the model ever sees, and the one §7.6 says a citation reuses. It travels in the
	 * payload because `claimNext` returns neither `dedupKey` nor `createdAt`
	 * (`MailboxRepository.ts:22-30`).
	 */
	entryId: z.uuid(),
	/**
	 * The `de` attribute of the live block, rendered verbatim — the same vocabulary `WindowEntrySchema`
	 * uses above, because the live message is the LAST block of that same list.
	 *
	 * Not always the owner: any roster participant with `canInvoke` may address the agent
	 * (`Thread.ts:115`), and a scheduled whisper arrives as `loop:<label>`.
	 */
	speaker: z.string().min(1),
	text: z.string().min(1),
	/**
	 * HOW it reached the conversation, when the room never saw it — absent ⟺ typed in the chat.
	 *
	 * This is the field that stops the author from lying. A console whisper and a loop tick used to
	 * arrive as `speaker: 'operator'`, byte-identical to something a human had just typed, so the agent
	 * answered a timer with "pronto, respondi" and thanked the room for a message the room never sent.
	 */
	via: z.enum(MessageVia).optional(),
	/**
	 * The line this message is a REPLY to, when it quotes one that resolves.
	 *
	 * It rides the mailbox payload rather than being re-read here because the ingest already resolved the
	 * entry for the invocation gate (`ThreadRepository.findEntry`) and the row it returned carries the
	 * text, the author and the instant. A read in this context would be a second query for a fact the
	 * producer had in hand, and it would have to reach into `thread`'s transcript to get it.
	 */
	quoted: QuotedMessageSchema.optional(),
	/** Same pair as `WindowEntrySchema` — the live message can be a media message too. */
	messageType: z.enum(MessageType).optional(),
	mediaPath: z.string().optional(),
})

/**
 * A subagent finished and its outcome must be composed into a reply (D2).
 *
 * `outcome` mirrors `TerminalOutcome` (`TerminalOutputAccumulator.ts:10`), which carries `replyText`
 * ONLY on the completed branch. A flat `replyText` would be a lie on a stop — where the text is a
 * stop kind plus detail — and a lie in the schema surfaces as an invented summary in a real group.
 *
 * NOTE WHAT IS ABSENT: `originEntryId`. The issue return ALWAYS cites it (§7.6) and that is not the
 * model's decision, so `RunOrchestratorTurn` sets `replyToEntryId` itself. Withholding the id makes
 * "do not write a quote line" structural instead of merely instructed.
 */
const IssueResultItemSchema = z.object({
	kind: z.literal(MailboxItemKind.ISSUE_RESULT),
	issueKey: z.string().min(1),
	outcome: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal(AgentRunOutcome.COMPLETED), replyText: z.string() }),
		z.object({ kind: z.literal(AgentRunOutcome.STOPPED), stopKind: z.enum(StopKind), detail: z.string() }),
	]),
})

/**
 * What the orchestrator is HANDED for one turn (§7.1).
 *
 * Declared with `z.agentInput()`, so the envelope is the spine. Note the envelope's `issueId` is
 * OPTIONAL and is ABSENT on every orchestrator turn — the orchestrator is thread-keyed (§6.1, session
 * with `issue_id IS NULL`). That is the same optionality `ClassifyIssueAgent` relies on, and it is why
 * §7.2.1 has to make the run token's issue claim optional too: `types/Agent.ts:145` currently refuses
 * to mint for a scoped agent without one.
 */
export const OrchestratorInputSchema = z.agentInput({
	/**
	 * The first typed narrowing of the mailbox's `payload: unknown`. Parsed by `RunOrchestratorTurn`,
	 * not here.
	 *
	 * Narrowed to the two THREAD-facing kinds. `WORK` and `STEER` target an ISSUE and reach
	 * `RunIssueTurn` instead, so the prompt builder's switch is total with nothing to throw — the
	 * wrong kind is unrepresentable rather than guarded against.
	 */
	item: z.discriminatedUnion('kind', [OperatorMessageItemSchema, IssueResultItemSchema]),
	/**
	 * §7.5's two seeding modes as ONE total shape. `seeded: true` = FRESH session, the full window;
	 * `false` = RESUMED, only what it has not seen since the cursor.
	 *
	 * A field rather than an inference from `session.resumeId`: that object is all-optional, so
	 * "neither key" is representable (`IssueWorkAgent/types.ts:41`) and a test that omits `session`
	 * would silently render the wrong mode. `RunOrchestratorTurn` decides, mirroring
	 * `RunIssueTurn.resolveSession` but keyed by thread.
	 */
	window: z.object({ seeded: z.boolean(), entries: z.array(WindowEntrySchema) }),
	/**
	 * The thread's UNANSWERED QUESTIONS (issue-resume spec, AC-4) — empty when nothing is pending.
	 *
	 * REUSED from `GetOpenStops` rather than restated, and the difference from `WindowEntrySchema`
	 * above is the whole reason: that one is restated because it crosses a CONTEXT boundary, and an
	 * agent input must not be coupled to `thread`'s persistence shape. This read lives in THIS context
	 * and exists for THIS prompt and nothing else — its own docblock says so ("its only consumer is the
	 * prompt builder"). Two spellings of one fact, ten lines apart, would only ever drift.
	 *
	 * REQUIRED, not optional-with-a-default. The turn always knows the answer (it asks on every turn),
	 * so "absent" would mean nothing except "somebody forgot to wire it" — and that is exactly the
	 * failure this field exists to make impossible to ship silently a second time.
	 */
	openStops: z.array(OpenStopSchema),
	/** §7.6 — it travels for the 1:1-vs-group quote policy, which is the only thing it branches. */
	contactKind: z.enum(ContactKind),
	/**
	 * Absent ⟺ the mention gate is disabled. `MentionGate` is a discriminated union on `enabled` with
	 * no `tag` on the disabled arm, so a flat optional string is the honest restatement of it.
	 */
	mentionTag: z.string().min(1).optional(),
	/**
	 * The operator's own standing instructions for THIS conversation, when they wrote any.
	 *
	 * Optional and `min(1)`, mirroring `mentionTag`: absent ⟺ unset. The empty string is not a state the
	 * agent can be handed — `Thread.configurePrompt` collapses blank into absence at the write — so the
	 * prompt builder branches on presence alone and never has to ask whether a section is "empty enough"
	 * to skip.
	 *
	 * Restated here as a plain string rather than imported from the thread context, for the reason
	 * `WindowEntrySchema` states above: an agent input describes what it is HANDED, and reaching into
	 * `thread`'s schemas would couple the agent runtime to that aggregate's shape.
	 */
	customPrompt: z.string().min(1).optional(),
	/**
	 * The IANA zone this install runs in — the one fact a `DAILY` loop needs and the model cannot derive.
	 *
	 * `DailyLoopSchedule` requires a zone, and a model guessing one from the language of the conversation
	 * writes a wrong hour that reads like a right one. The console never had this problem because it
	 * reads `Intl.DateTimeFormat().resolvedOptions().timeZone` off the browser (`LoopsSection.tsx:99`);
	 * the daemon is the same machine, and this repository already ratified that equivalence when it
	 * dropped the timezone from Settings because "the timezone is the machine's".
	 *
	 * REQUIRED, not optional-with-a-default — the same rule `openStops` above states. The turn always
	 * knows the answer, so "absent" would mean nothing except that somebody forgot to wire it; and a
	 * DEFAULTED zone is precisely the failure this field exists to prevent, not a fallback for it.
	 */
	timezone: z.string().min(1),
	/**
	 * WHICH LANGUAGE TO ANSWER IN — the conversation's own, already resolved.
	 *
	 * It REPLACES a heuristic: the voice section used to say "reply in the language the operator wrote
	 * in", which made the model re-decide, every turn, off whatever the last person happened to type. A
	 * single English line in a Portuguese group flipped it, and nothing tied that decision to the
	 * "thinking" cues the same turn had already put on screen from a different (hardcoded) source. One
	 * declared field now drives both.
	 *
	 * REQUIRED, not optional-with-a-default — the same rule `timezone` above states. `RunOrchestratorTurn`
	 * resolves it once per turn (`Thread.language` → the owner's → the product default), so "absent" would
	 * mean nothing except that somebody forgot to wire it, which is exactly the silent regression this
	 * field exists to prevent.
	 *
	 * The ENUM and not a free BCP-47 string: the prompt renders a NAMED instruction per member, and a tag
	 * the deck has never heard of would render as a locale code the model has to interpret.
	 */
	language: z.enum(Language),
	/**
	 * WHAT TIME IT IS — the turn's own instant, rendered at the top of the prompt as `agora: …`.
	 *
	 * The agent had no clock. Not "an imprecise one" — none: no line of the prompt said what time it
	 * was, and none said when any message had been sent, so "de manhã eu te falei" and "isso foi ontem"
	 * were unanswerable, and a conversation resumed after a night's sleep read as continuous.
	 *
	 * A PARAMETER and not a `new Date()` inside the prompt builder — the same discipline `Loop`,
	 * `LoopSchedule` and `Thread.canInvoke` already hold. A renderer that reads a clock is a renderer no
	 * test can pin, and this one's whole output would move under it.
	 *
	 * REQUIRED, like `timezone` and `openStops`: every turn knows what time it started, so "absent"
	 * would mean nothing except that somebody forgot to wire it.
	 */
	now: z.date(),
	/** Which model to ask the CLI for. Omitted ⇒ `DEFAULT` ⇒ the CLI's own choice. */
	model: z.enum(AgentModelId).optional(),
	/**
	 * The models the CLI driving THIS turn offers — the catalog, so the model can name a real one.
	 *
	 * It is a LIST OF FACTS, never the provider itself, and the distinction is the same one
	 * `AgentRunRequest` makes when it explains why it has no `provider` field: WHICH CLI is settled
	 * before the agent runs, so handing the agent a provider would be handing it a resolution key it
	 * could only branch on. What it actually needs is the answer, and the answer comes from the declared
	 * relation in contracts (`modelsFor`), resolved once by `RunOrchestratorTurn`.
	 *
	 * Without it the tool would be unusable in the way that is hardest to see: `ConfigureModel`'s schema
	 * accepts every `AgentModelId`, so a model that cannot see the catalog picks one of the others and
	 * the domain refuses it. A tool that only ever errors is worse than no tool.
	 *
	 * REQUIRED like `timezone` and for the same reason — the turn always knows — and EMPTY is a real,
	 * meaningful value: a CLI this build has never driven offers nothing, and the prompt section then
	 * does not render at all.
	 */
	availableModels: z.array(z.enum(AgentModelId)),
	/** EXACTLY ONE is set by `RunOrchestratorTurn` — continue the thread's session or open a new one. */
	session: z.object({ resumeId: z.string().optional(), newId: z.string().optional() }).optional(),
	/** ABSOLUTE path resolved by `ProviderDetector`. REQUIRED — the runner spawns exactly this, never a bare name (see `AgentRunRequest.binaryPath`). */
	binaryPath: z.string(),
	/** What the probe found THIS install supports. Absent = the conservative set. */
	caps: ProviderCapabilitiesSchema.optional(),
})
