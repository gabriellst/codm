import type { Transaction } from '@codm/core-typescript'
import { IssueSignalLevel } from '@codm/contracts-typescript/wire/enums'
import type { SpokenLevel } from '../../events/IssueSpokeEvent'

/**
 * WHICH SPOKEN LEVEL DECLARES A WAIT ON PEOPLE (fase 5, item 1). A preview put in front of the group (`FEEDBACK`) is
 * the task saying "I am waiting for you to look"; what it reported doing (`PROGRESS`) waits on nobody — every turn ends
 * by writing one. Total over `SPOKEN_LEVELS`, so a new level fails compilation here until somebody says which it is.
 */
export const SIGNAL_DECLARES_WAIT: Readonly<Record<SpokenLevel, boolean>> = {
	[IssueSignalLevel.FEEDBACK]: true,
	[IssueSignalLevel.PROGRESS]: false,
}

/** The levels whose fact declares a wait — derived from the table, never listed twice. */
export const WAIT_DECLARING_LEVELS: readonly SpokenLevel[] = (Object.keys(SIGNAL_DECLARES_WAIT) as SpokenLevel[]).filter(
	level => SIGNAL_DECLARES_WAIT[level],
)

/**
 * DID THE ISSUE'S LAST TURN DECLARE IT IS WAITING ON PEOPLE? — the one predicate behind "quem declarou espera não é
 * incomodado" for the waits that are NOT a stop (fase 5, item 1).
 *
 * A stop already takes the issue to `NEEDS_INPUT`; a feedback request does not hold the issue (`RequestFeedback`), so
 * before this a turn that put a preview in front of the group and ended was reminded, and a second quiet turn became a
 * `STALLED` block notice — although the reminder's own text lists "request feedback" as a valid declaration. The owner
 * decided (20/11): a feedback with no answer waits WITHOUT a deadline — never nudged, never blocked for waiting.
 *
 * Declared: a fact of a level that declares a wait (`SIGNAL_DECLARES_WAIT`), recorded by THIS issue (`entity_id`) at or
 * after the instant its last consumed item was first handed to a turn (`first_claimed_at`) — i.e. during the last turn.
 * A later turn (somebody wrote, the task resumed) ends the wait by moving the cursor. No column and no handler: the fact
 * is written in the tool's transaction, before the turn ends, so there is no race with the outbox.
 *
 * Two readers, never disagreeing: the reconciler (excludes the issue) and the issue's life state (`WAITING_PERSON`
 * before `STALLED`). Batch-shaped because the board asks for every open issue at once.
 */
export abstract class DeclaredWaitReader {
	/** The issues among `issueIds` whose last turn declared a wait on people. */
	abstract waiting(issueIds: readonly string[], tx?: Transaction): Promise<Set<string>>
}
