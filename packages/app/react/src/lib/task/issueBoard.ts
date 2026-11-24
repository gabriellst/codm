import type { IssueLifeState } from '@codm/client-typescript/typescript'

/**
 * The kanban's columns — the same six the cloud panel has shown since fase 1, in the order a task
 * walks through them. The desktop conversation tab and the panel both read THIS map, so a life state
 * added to the contract makes `tsc` demand its column in one place.
 *
 * (The cross-thread `/issues` board keeps its own private map: that screen is frozen by the founder,
 * see `.specs/2026-11-24-tarefa-e-painel-design.md` §2.)
 */
export const TASK_COLUMNS = ['queued', 'working', 'needsYou', 'waiting', 'stalled', 'done'] as const

export type TaskColumn = (typeof TASK_COLUMNS)[number]

export const TASK_COLUMN_OF: Record<IssueLifeState, TaskColumn> = {
	QUEUED: 'queued',
	RUNNING: 'working',
	WAITING_PERSON: 'needsYou',
	WAITING_PROVIDER: 'waiting',
	WAITING_RETRY: 'waiting',
	WAITING_BUDGET: 'waiting',
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
