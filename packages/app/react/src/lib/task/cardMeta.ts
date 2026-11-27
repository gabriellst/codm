import { IssueLifeStateEnum, type IssueLifeState } from '@codm/client-typescript/typescript'
import { TASK_COLUMN_OF, type TaskColumn } from './issueBoard'

/** What a kanban card knows about its task — the facts `GetSessionIssues` carries per item on the 0.9 line. */
export interface CardFacts {
	lifeState: IssueLifeState
	paused?: boolean
	waitingForProviderUntil?: string
}

/**
 * The bottom line of a kanban card — what matters in THAT column: when it comes back where it waits, that it
 * was paused where it stopped, the exact state where the column folds several. `none` when the column has
 * nothing more to say.
 */
export type CardMeta = { kind: 'backAt'; at: string } | { kind: 'state'; lifeState: IssueLifeState } | { kind: 'paused' } | { kind: 'none' }

const NONE: CardMeta = { kind: 'none' }

/** One rule per column (CMP-P18) — a column added to the board fails to compile until it says what its cards show. */
const BY_COLUMN: Record<TaskColumn, (facts: CardFacts) => CardMeta> = {
	queued: () => NONE,
	working: () => NONE,
	needsYou: facts => ({ kind: 'state', lifeState: facts.lifeState }),
	waiting: facts =>
		facts.waitingForProviderUntil ? { kind: 'backAt', at: facts.waitingForProviderUntil } : { kind: 'state', lifeState: facts.lifeState },
	stalled: facts =>
		facts.paused || facts.lifeState === IssueLifeStateEnum.PAUSED ? { kind: 'paused' } : { kind: 'state', lifeState: facts.lifeState },
	done: () => NONE,
}

export function cardMetaOf(facts: CardFacts): CardMeta {
	return BY_COLUMN[TASK_COLUMN_OF[facts.lifeState]](facts)
}
