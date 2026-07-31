import { z } from '@codm/core-typescript'
import { AgentModelId, ContactKind, MailboxItemKind, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentRunOutcome } from '../../enums'
import { ProviderCapabilitiesSchema } from '../../types/ProviderCapabilities'

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
	 * Rendered verbatim as the label: `operator` for the owner (`OPERATOR_PARTICIPANT_ID`), the roster
	 * `name` for other participants, `you` for the agent's own SYSTEM lines. Never a raw JID — the
	 * window is read by a model that will echo what it sees.
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
	/** Not always the owner: any roster participant with `canInvoke` may address the agent (`Thread.ts:115`). */
	speaker: z.string().min(1),
	text: z.string().min(1),
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
	/** Which model to ask the CLI for. Omitted ⇒ `DEFAULT` ⇒ the CLI's own choice. */
	model: z.enum(AgentModelId).optional(),
	/** EXACTLY ONE is set by `RunOrchestratorTurn` — continue the thread's session or open a new one. */
	session: z.object({ resumeId: z.string().optional(), newId: z.string().optional() }).optional(),
	/** Resolved by `ProviderDetector`; absent lets the runner fall back to the bare binary name. */
	binaryPath: z.string().optional(),
	/** What the probe found THIS install supports. Absent = the conservative set. */
	caps: ProviderCapabilitiesSchema.optional(),
})
