import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { AgentModelId, IssuePriority, IssueWorkKind, PriorityReason } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../../entities/IssueAttributes'
import { IssueAttributesRepository } from './IssueAttributesRepository'
import { MockIssueAttributesRepository } from './MockIssueAttributesRepository'

const THREAD = '00000000-0000-4000-8000-00000000aaaa'

/**
 * `agent_issue_attributes` (fase 4, S0c) — what a task was born with is written once and never changed (a second
 * birth keeps the first; a save never touches the birth columns); the worktree and the closing are stamps moved by
 * `find → behavior → save`. Run against SQLite (`integration`) and against the in-memory twin, same assertions.
 *
 * Falsifier: put `priority` in the upsert's `set` and the "save never rewrites the birth" case goes red.
 */
for (const env of ['libsql', 'mock'] as const) {
	describe(`IssueAttributesRepository (${env}) — the birth is write-once, the stamps move`, () => {
		let testBed: TestBed
		let testContainer: DependencyContainer

		beforeAll(async () => {
			testContainer = container.createChildContainer()
			testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
		})
		beforeEach(async () => {
			await testBed.reset()
		})
		afterAll(async () => {
			await testBed.destroy()
		})

		const repo = (): IssueAttributesRepository =>
			env === 'libsql' ? testBed.resolve(IssueAttributesRepository) : new MockIssueAttributesRepository()
		const born = (issueId: string) =>
			IssueAttributes.born({ issueId, ownerId: MOCK_CLOUD_OWNER_ID, threadId: THREAD, ...ISSUE_ATTRIBUTE_DEFAULTS })

		it('records a birth and reads it back as the entity; the model stays absent when not fixed', async () => {
			const r = repo()
			const issueId = crypto.randomUUID()
			await r.insertIfNew(born(issueId))

			const row = await r.findByIssueId(issueId)
			expect(row).toBeInstanceOf(IssueAttributes)
			expect(row?.issueId).toBe(issueId)
			expect(row?.threadId).toBe(THREAD)
			expect(row?.priority).toBe(IssuePriority.NORMAL)
			expect(row?.priorityReason).toBe(PriorityReason.DEFAULT)
			expect(row?.workKind).toBe(IssueWorkKind.CHANGE)
			expect(row?.model).toBeUndefined()
			expect(row?.worktreePath).toBeUndefined()
			expect(row?.closedAt).toBeUndefined()
		})

		it('a second birth of the same issue keeps the first — a birth never changes', async () => {
			const r = repo()
			const issueId = crypto.randomUUID()
			await r.insertIfNew(
				IssueAttributes.born({
					issueId,
					ownerId: MOCK_CLOUD_OWNER_ID,
					threadId: THREAD,
					priority: IssuePriority.HIGH,
					priorityReason: PriorityReason.CLIENT_BUG,
					workKind: IssueWorkKind.DIAGNOSIS,
					model: AgentModelId.SONNET,
				}),
			)
			await r.insertIfNew(born(issueId))

			const row = await r.findByIssueId(issueId)
			expect([row?.priority, row?.priorityReason, row?.workKind, row?.model]).toEqual([
				IssuePriority.HIGH,
				PriorityReason.CLIENT_BUG,
				IssueWorkKind.DIAGNOSIS,
				AgentModelId.SONNET,
			])
		})

		it('the stamps move through find → behavior → save; a save never rewrites the birth', async () => {
			const r = repo()
			const issueId = crypto.randomUUID()
			await r.insertIfNew(born(issueId))

			const first = await r.findByIssueId(issueId)
			if (!first) throw new Error('no row')
			first.registerWorktree('/w/one', new Date('2026-11-19T10:00:00Z'))
			await r.save(first)
			const second = await r.findByIssueId(issueId)
			if (!second) throw new Error('no row')
			second.registerWorktree('/w/two', new Date('2026-11-19T11:00:00Z'))
			second.close(new Date('2026-11-20T12:00:00Z'))
			// A stale aggregate trying to rewrite what the task was born with.
			second.priority = IssuePriority.LOW
			await r.save(second)

			const row = await r.findByIssueId(issueId)
			expect(row?.worktreePath).toBe('/w/two')
			expect(row?.worktreeSeenAt).toEqual(new Date('2026-11-19T11:00:00Z'))
			expect(row?.closedAt).toEqual(new Date('2026-11-20T12:00:00Z'))
			expect(row?.priority).toBe(IssuePriority.NORMAL)
			expect(await r.findByIssueId(crypto.randomUUID())).toBeUndefined()
		})
	})
}
