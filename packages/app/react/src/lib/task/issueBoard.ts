import type { IssueLifeState } from '@codm/client-typescript/typescript'

/**
 * The kanban's columns — the same six the cloud panel has shown since fase 1, in the order a task
 * walks through them. The desktop conversation tab reads THIS map, so a life state
 * added to the contract makes `tsc` demand its column in one place.
 *
 * Ported to the 0.9 line (0.13.x): eight life states, so "Esperando" holds only the provider's wait.
 */
export const TASK_COLUMNS = ['queued', 'working', 'needsYou', 'waiting', 'stalled', 'done'] as const

export type TaskColumn = (typeof TASK_COLUMNS)[number]

export const TASK_COLUMN_OF: Record<IssueLifeState, TaskColumn> = {
	QUEUED: 'queued',
	RUNNING: 'working',
	WAITING_PERSON: 'needsYou',
	WAITING_PROVIDER: 'waiting',
	REMINDED: 'stalled',
	STALLED: 'stalled',
	PAUSED: 'stalled',
	DONE: 'done',
}

/** Groups items into every column (empty columns included, in board order). */
export function groupByTaskColumn<T extends { lifeState: IssueLifeState }>(items: readonly T[]): Map<TaskColumn, T[]> {
	const byColumn = new Map<TaskColumn, T[]>(TASK_COLUMNS.map(column => [column, []]))
	for (const item of items) byColumn.get(TASK_COLUMN_OF[item.lifeState])?.push(item)
	return byColumn
}

/** The catalog key of each column's name — a KEY map, literal per column (bp-25: a template-literal key is
 *  reserved for enum labels, and a column is not a wire enum). */
export const TASK_COLUMN_LABEL_KEY = {
	queued: 'task.columns.queued',
	working: 'task.columns.working',
	needsYou: 'task.columns.needsYou',
	waiting: 'task.columns.waiting',
	stalled: 'task.columns.stalled',
	done: 'task.columns.done',
} as const satisfies Record<TaskColumn, string>
