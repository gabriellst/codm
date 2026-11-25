import { IssueLifeStateEnum, type IssueLifeState } from '@codm/client-typescript/typescript'
import { TASK_COLUMN_OF, type TaskColumn } from './issueBoard'

/** What a kanban card knows about its task — the fields the desktop's `GetSessionIssues` and the cloud's
 *  `/board` both carry, plus the open asks and artifact count each surface joins in. */
export interface CardFacts {
	lifeState: IssueLifeState
	paused?: boolean
	retryingAt?: string
	waitingForProviderUntil?: string
	escalatedAt?: string
	openAsks: readonly { code: string; question: string }[]
	artifactCount: number
}

/**
 * The bottom line of a kanban card — what matters in THAT column (the column already says the state, so the
 * card never repeats it): the open decision where someone is needed, when it comes back where it waits, why it
 * stopped, how much it produced while working. `none` when the column has nothing more to say.
 */
export type CardMeta =
	| { kind: 'ask'; code: string; question: string }
	| { kind: 'retryAt'; at: string }
	| { kind: 'backAt'; at: string }
	| { kind: 'state'; lifeState: IssueLifeState }
	| { kind: 'escalated' }
	| { kind: 'paused' }
	| { kind: 'artifacts'; count: number }
	| { kind: 'none' }

const NONE: CardMeta = { kind: 'none' }

/** One rule per column (CMP-P18) — a column added to the board fails to compile until it says what its cards show. */
const BY_COLUMN: Record<TaskColumn, (facts: CardFacts) => CardMeta> = {
	queued: () => NONE,
	working: facts => (facts.artifactCount > 0 ? { kind: 'artifacts', count: facts.artifactCount } : NONE),
	needsYou: facts => {
		const [first] = facts.openAsks
		return first ? { kind: 'ask', code: first.code, question: first.question } : NONE
	},
	waiting: facts => {
		if (facts.retryingAt) return { kind: 'retryAt', at: facts.retryingAt }
		if (facts.waitingForProviderUntil) return { kind: 'backAt', at: facts.waitingForProviderUntil }
		return { kind: 'state', lifeState: facts.lifeState }
	},
	stalled: facts => {
		if (facts.escalatedAt) return { kind: 'escalated' }
		if (facts.paused || facts.lifeState === IssueLifeStateEnum.PAUSED) return { kind: 'paused' }
		return { kind: 'state', lifeState: facts.lifeState }
	},
	done: () => NONE,
}

export function cardMetaOf(facts: CardFacts): CardMeta {
	return BY_COLUMN[TASK_COLUMN_OF[facts.lifeState]](facts)
}
