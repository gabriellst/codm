import { describe, expect, it } from 'bun:test'
import { IssueLifeStateEnum } from '@codm/client-typescript/typescript'
import { TASK_COLUMN_OF, TASK_COLUMNS, groupByTaskColumn } from './issueBoard'

describe('issueBoard', () => {
	it('places every life state in one of the six columns', () => {
		for (const state of Object.values(IssueLifeStateEnum)) expect(TASK_COLUMNS).toContain(TASK_COLUMN_OF[state])
	})

	it('keeps the cloud panel order — queued, working, needs you, waiting, stalled, done', () => {
		expect(TASK_COLUMNS).toEqual(['queued', 'working', 'needsYou', 'waiting', 'stalled', 'done'])
	})

	it('puts the provider wait in its own column and folds pause/remind/stall into another', () => {
		expect(TASK_COLUMN_OF.WAITING_PROVIDER).toBe('waiting')
		expect([TASK_COLUMN_OF.REMINDED, TASK_COLUMN_OF.STALLED, TASK_COLUMN_OF.PAUSED]).toEqual(['stalled', 'stalled', 'stalled'])
	})

	it('groups items keeping every column, empty ones included, in board order', () => {
		const grouped = groupByTaskColumn([
			{ id: 'a', lifeState: IssueLifeStateEnum.RUNNING },
			{ id: 'b', lifeState: IssueLifeStateEnum.WAITING_PROVIDER },
			{ id: 'c', lifeState: IssueLifeStateEnum.RUNNING },
		])
		expect([...grouped.keys()]).toEqual([...TASK_COLUMNS])
		expect(grouped.get('working')?.map(item => item.id)).toEqual(['a', 'c'])
		expect(grouped.get('waiting')?.map(item => item.id)).toEqual(['b'])
		expect(grouped.get('done')).toEqual([])
	})
})
