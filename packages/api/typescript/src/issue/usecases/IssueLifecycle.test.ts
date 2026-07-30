import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { BaseError, DomainEventRepository } from '@codm/core-typescript'
import { IssueStatus, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ArchiveIssue } from './ArchiveIssue'
import { RestoreIssue } from './RestoreIssue'
import { AutoArchiveCompletedIssues } from './AutoArchiveCompletedIssues'
// The stop control plane lives in `thread/` since B4 (spec decision 4) — the Stop is a child of the
// Thread aggregate. This suite still drives it because the issue-scoped read (`openStopsByIssue`) is
// what the issue lifecycle cares about.
import { RaiseStop } from '@thread/usecases/RaiseStop'
import { ResolveStop } from '@thread/usecases/ResolveStop'
import { UpdateStopCriteriaConfig } from '@thread/usecases/UpdateStopCriteriaConfig'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { IssueRepository } from '../repositories/IssueRepository'
import { IssueArchivedEvent } from '../events'

describe('Issue lifecycle + stop control plane', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('ArchiveIssue → issue.archived (MANUAL) + hides from active', async () => {
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID })
		await testBed.resolve(ArchiveIssue).execute({ ownerId: OPERATOR_ID, issueId: issue.id.value, reason: 'MANUAL' as never })
		const saved = await testBed.resolve(IssueRepository).findById(issue.id.value)
		expect(saved?.archived).toBe(true)
		const events = await testBed.resolve(DomainEventRepository).findByType(IssueArchivedEvent)
		expect(events).toHaveLength(1)
	})

	it('RestoreIssue on a non-archived issue throws', async () => {
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID })
		await expect(testBed.resolve(RestoreIssue).execute({ ownerId: OPERATOR_ID, issueId: issue.id.value })).rejects.toThrow(BaseError)
	})

	it('RaiseStop records a stop, then ResolveStop matches the kind', async () => {
		// The thread is CREATED, not invented: since B4 `RaiseStop` loads it to stamp owner + thread on the
		// Stop, so an issue carrying a dangling `threadId` is a state the product cannot reach.
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		const stopId = '00000000-0000-4000-8000-0000000000f1'
		await testBed
			.resolve(RaiseStop)
			.execute({ stopId, threadId: thread.id.value, issueId: issue.id.value, kind: StopKind.APPROVAL_NEEDED, title: 't', detail: 'd' })

		const threads = testBed.resolve(ThreadRepository)
		expect(await threads.openStopsByIssue(issue.id.value)).toHaveLength(1)

		// APPROVE applies to APPROVAL_NEEDED.
		await testBed.resolve(ResolveStop).execute({ ownerId: OPERATOR_ID, stopId, resolution: StopResolution.APPROVE })
		expect(await threads.openStopsByIssue(issue.id.value)).toHaveLength(0)
	})

	it('ResolveStop rejects an inapplicable resolution (RESOLUTION_NOT_APPLICABLE)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		const stopId = '00000000-0000-4000-8000-0000000000f2'
		await testBed
			.resolve(RaiseStop)
			.execute({ stopId, threadId: thread.id.value, issueId: issue.id.value, kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' })
		// APPROVE does NOT apply to SERVER_ERROR.
		await expect(
			testBed.resolve(ResolveStop).execute({ ownerId: OPERATOR_ID, stopId, resolution: StopResolution.APPROVE }),
		).rejects.toThrow(BaseError)
	})

	it('RaiseStop respects a disabled criterion (STOP_CRITERION_DISABLED)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value })
		await testBed.resolve(UpdateStopCriteriaConfig).execute({
			ownerId: OPERATOR_ID,
			stopCriteria: {
				serverErrors: false,
				blockedByClassification: true,
				humanRequested: true,
				approvalNeeded: true,
				authRequired: true,
			},
		})
		await expect(
			testBed.resolve(RaiseStop).execute({
				stopId: '00000000-0000-4000-8000-0000000000f3',
				threadId: thread.id.value,
				issueId: issue.id.value,
				kind: StopKind.SERVER_ERROR,
				title: 't',
				detail: 'd',
			}),
		).rejects.toThrow(BaseError)
	})

	it('AutoArchiveCompletedIssues sweeps issues completed > 24h ago', async () => {
		const old = new Date(Date.now() - 25 * 60 * 60 * 1000)
		const stale = await givenIssue(testBed, { ownerId: OPERATOR_ID, status: IssueStatus.COMPLETED, completedAt: old })
		const fresh = await givenIssue(testBed, { ownerId: OPERATOR_ID, status: IssueStatus.COMPLETED, completedAt: new Date() })

		const out = await testBed.resolve(AutoArchiveCompletedIssues).execute({})
		expect(out.archivedIssueIds).toContain(stale.id.value)
		expect(out.archivedIssueIds).not.toContain(fresh.id.value)

		const repo = testBed.resolve(IssueRepository)
		expect((await repo.findById(stale.id.value))?.archived).toBe(true)
		expect((await repo.findById(fresh.id.value))?.archived).toBe(false)
	})
})
