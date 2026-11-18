import type { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'

/** One issue of a group's board, as the bulletin reads it. */
export interface IssueBoardRow {
	issueId: string
	key: string
	title: string
	status: IssueStatus
	/** Where its work stands, by the rule (`lifeStateOf`) — never stored. */
	lifeState: IssueLifeState
	completedAt?: Date
	/** When the provider lets its next turn run, while it waits for one. */
	waitingForProviderUntil?: Date
}

/**
 * THE BOARD OF ONE GROUP, as another context may read it (fase 3, item 4 — `relatorio`): each live issue's
 * key, title, status and life state, plus those completed in the last `since`. The life state's rule
 * (`lifeStateOf`, `issue/utils`) is this context's — a surface other contexts may not import — so this
 * service is the door to it.
 */
export abstract class IssueBoardReader {
	/** The conversation's issues not archived, and those completed at or after `completedSince`. */
	abstract boardOf(threadId: string, completedSince: Date): Promise<IssueBoardRow[]>
}
