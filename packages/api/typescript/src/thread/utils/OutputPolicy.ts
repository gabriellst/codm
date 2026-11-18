import { BlockCause, GroupOutputMode, IssueSignalLevel, OutputRouting, StopKind } from '@codm/contracts-typescript/wire/enums'

/**
 * THE OUTPUT POLICY (fase 3, "emagrecer o grupo") — where what an issue says goes, by level and by the
 * group's mode. Tables only, every one total over the enums it reads: a level, a mode, a stop kind or a
 * cause added to the contract fails compilation here until somebody decides where it goes. No `if` on a
 * level anywhere — the policy routes the level it is handed; WHICH level a stop is belongs to
 * `LEVEL_OF_STOP`, and the escalation of a question to a decision belongs to the `StopAsk` value object.
 *
 * It lives in `thread` because the policy is a rule of the GROUP (its mode, its people, its link), and
 * the group is this context's aggregate.
 */

/**
 * The matrix level × mode, as the owner decided it (18/11): `DECISIONS_AND_LIVE` is the default;
 * `DECISIONS_ONLY` keeps the questions in the group; `EVERYTHING` brings progress to the group and is the
 * way back for a group that wants every line.
 */
export const ROUTING_BY_MODE: Record<GroupOutputMode, Record<IssueSignalLevel, OutputRouting>> = {
	[GroupOutputMode.DECISIONS_ONLY]: {
		[IssueSignalLevel.DECISION]: OutputRouting.GROUP,
		[IssueSignalLevel.QUESTION]: OutputRouting.DIGEST,
		[IssueSignalLevel.FEEDBACK]: OutputRouting.PANEL,
		[IssueSignalLevel.CLOSING]: OutputRouting.PANEL,
		[IssueSignalLevel.BLOCK_NOTICE]: OutputRouting.GROUP,
		[IssueSignalLevel.PROGRESS]: OutputRouting.PANEL,
	},
	[GroupOutputMode.DECISIONS_AND_LIVE]: {
		[IssueSignalLevel.DECISION]: OutputRouting.GROUP,
		[IssueSignalLevel.QUESTION]: OutputRouting.DIGEST,
		[IssueSignalLevel.FEEDBACK]: OutputRouting.DIGEST,
		[IssueSignalLevel.CLOSING]: OutputRouting.GROUP,
		[IssueSignalLevel.BLOCK_NOTICE]: OutputRouting.GROUP,
		[IssueSignalLevel.PROGRESS]: OutputRouting.PANEL,
	},
	[GroupOutputMode.EVERYTHING]: {
		[IssueSignalLevel.DECISION]: OutputRouting.GROUP,
		[IssueSignalLevel.QUESTION]: OutputRouting.DIGEST,
		[IssueSignalLevel.FEEDBACK]: OutputRouting.DIGEST,
		[IssueSignalLevel.CLOSING]: OutputRouting.GROUP,
		[IssueSignalLevel.BLOCK_NOTICE]: OutputRouting.GROUP,
		[IssueSignalLevel.PROGRESS]: OutputRouting.GROUP,
	},
}

/**
 * How long a person's questions and feedback wait to go out TOGETHER (fase 3, item 2): the signals for the
 * same person within this window leave as one message (`FlushSignalDigest`); a lone one leaves as itself.
 */
export const DIGEST_WINDOW_MS = 60 * 1000

/**
 * Whether a routing puts a message on the channel NOW — `DIGEST` goes later (its person's window), `PANEL`
 * lives only in the timeline/panel.
 */
export const SENDS_NOW: Record<OutputRouting, boolean> = {
	[OutputRouting.GROUP]: true,
	[OutputRouting.DIGEST]: false,
	[OutputRouting.PANEL]: false,
}

/**
 * The level each stop speaks at — replaces `NOTIFIES_ON_CHANNEL` (the criterion is no longer "could the
 * orchestrator have said it" but "what is this, for the group").
 *
 * `null` is a DECLARED value, not a hole: the stop says nothing on the channel by itself. That is the case
 * of the two legacy kinds, `HUMAN_REQUESTED` and `APPROVAL_NEEDED`: they are born of a turn that ran and
 * spoke — its words reach the group through the orchestrator's reply — and a mechanical notice beside it
 * would say the same thing twice. Once the issue's tools raise `DECISION_REQUESTED` instead (slice S5a),
 * they remain only in the history.
 */
export const LEVEL_OF_STOP: Record<StopKind, IssueSignalLevel | null> = {
	[StopKind.SERVER_ERROR]: IssueSignalLevel.BLOCK_NOTICE,
	[StopKind.AUTH_REQUIRED]: IssueSignalLevel.BLOCK_NOTICE,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: IssueSignalLevel.BLOCK_NOTICE,
	[StopKind.STALLED]: IssueSignalLevel.BLOCK_NOTICE,
	// The permission filter barred an action: it asks for an approval, and an irreversible one.
	[StopKind.PERMISSION_DENIED]: IssueSignalLevel.DECISION,
	[StopKind.DECISION_REQUESTED]: IssueSignalLevel.DECISION,
	[StopKind.QUESTION_ASKED]: IssueSignalLevel.QUESTION,
	[StopKind.HUMAN_REQUESTED]: null,
	[StopKind.APPROVAL_NEEDED]: null,
}

/**
 * The cause of a blocking stop — the key of "one notice per cause". `null` for the stops that ask
 * something of a person (they are not blocks of the system). `PROVIDER_LIMIT` is no stop: it stays with
 * `NotifyProviderPaused`, which is already one notice per pause.
 */
export const CAUSE_OF_STOP: Record<StopKind, BlockCause | null> = {
	[StopKind.SERVER_ERROR]: BlockCause.PROVIDER_ERROR,
	[StopKind.AUTH_REQUIRED]: BlockCause.CLI_LOGIN,
	[StopKind.STALLED]: BlockCause.STALLED,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: BlockCause.CLASSIFICATION,
	[StopKind.PERMISSION_DENIED]: null,
	[StopKind.DECISION_REQUESTED]: null,
	[StopKind.QUESTION_ASKED]: null,
	[StopKind.HUMAN_REQUESTED]: null,
	[StopKind.APPROVAL_NEEDED]: null,
}

/**
 * Whether a cause is told ONCE while it lasts. The provider's and the CLI's are one fact for the whole
 * group: while a stop of that cause is open in the group, the first notice went to the group and the
 * following ones only to the panel; the cause closes when its last stop is resolved. `STALLED` and
 * `CLASSIFICATION` do NOT group — the cause is the issue itself, and a second task that stopped without a
 * word has to appear, or it would die in the panel.
 */
export const CAUSE_DEDUPES: Record<BlockCause, boolean> = {
	[BlockCause.PROVIDER_LIMIT]: true,
	[BlockCause.PROVIDER_ERROR]: true,
	[BlockCause.CLI_LOGIN]: true,
	[BlockCause.STALLED]: false,
	[BlockCause.CLASSIFICATION]: false,
}

/** Whether a stop of `kind` is already told by another open stop of the same (grouping) cause. */
export function causeAlreadyTold(kind: StopKind, otherOpenKinds: readonly StopKind[]): boolean {
	const cause = CAUSE_OF_STOP[kind]
	if (cause === null || !CAUSE_DEDUPES[cause]) return false
	return otherOpenKinds.some(other => CAUSE_OF_STOP[other] === cause)
}

/**
 * Where a signal of `level` goes in a group of `mode` — `PANEL` when its cause was already told. A `DIGEST`
 * signal waits for its person's window (`DIGEST_WINDOW_MS`); the flush then records the routing that
 * actually happened (`GROUP` for one that went out alone).
 */
export function routeSignal(mode: GroupOutputMode, level: IssueSignalLevel, alreadyTold = false): OutputRouting {
	return alreadyTold ? OutputRouting.PANEL : ROUTING_BY_MODE[mode][level]
}
