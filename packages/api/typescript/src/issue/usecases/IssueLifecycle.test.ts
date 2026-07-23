import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue } from '@test/support'
import { BaseError, DomainEventRepository } from '@codedm/core-typescript'
import { IssueStatus, StopKind, StopResolution } from '@codedm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import { ArchiveIssue } from './ArchiveIssue'
import { RestoreIssue } from './RestoreIssue'
import { RaiseStop } from './RaiseStop'
import { ResolveStop } from './ResolveStop'
import { AutoArchiveCompletedIssues } from './AutoArchiveCompletedIssues'
import { UpdateStopCriteriaConfig } from './UpdateStopCriteriaConfig'
import { IssueRepository } from '../repositories/IssueRepository'
import { StopRepository } from '../repositories/StopRepository'
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
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID })
		const stopId = '00000000-0000-4000-8000-0000000000f1'
		await testBed.resolve(RaiseStop).execute({ stopId, issueId: issue.id.value, kind: StopKind.APPROVAL_NEEDED, title: 't', detail: 'd' })

		const stops = testBed.resolve(StopRepository)
		expect(await stops.openByIssue(issue.id.value)).toHaveLength(1)

		// APPROVE applies to APPROVAL_NEEDED.
		await testBed.resolve(ResolveStop).execute({ ownerId: OPERATOR_ID, stopId, resolution: StopResolution.APPROVE })
		expect(await stops.openByIssue(issue.id.value)).toHaveLength(0)
	})

	it('ResolveStop rejects an inapplicable resolution (RESOLUTION_NOT_APPLICABLE)', async () => {
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID })
		const stopId = '00000000-0000-4000-8000-0000000000f2'
		await testBed.resolve(RaiseStop).execute({ stopId, issueId: issue.id.value, kind: StopKind.SERVER_ERROR, title: 't', detail: 'd' })
		// APPROVE does NOT apply to SERVER_ERROR.
		await expect(
			testBed.resolve(ResolveStop).execute({ ownerId: OPERATOR_ID, stopId, resolution: StopResolution.APPROVE }),
		).rejects.toThrow(BaseError)
	})

	it('RaiseStop respects a disabled criterion (STOP_CRITERION_DISABLED)', async () => {
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID })
		await testBed
			.resolve(UpdateStopCriteriaConfig)
			.execute({
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
			testBed
				.resolve(RaiseStop)
				.execute({
					stopId: '00000000-0000-4000-8000-0000000000f3',
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
