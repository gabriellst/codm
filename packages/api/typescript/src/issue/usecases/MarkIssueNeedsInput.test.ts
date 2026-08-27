import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue } from '@test/support'
import { IssueArchiveReason, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueRepository } from '../repositories/IssueRepository'
import { MarkIssueNeedsInput } from './MarkIssueNeedsInput'

describe('MarkIssueNeedsInput', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let usecase: MarkIssueNeedsInput

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		usecase = testBed.resolve(MarkIssueNeedsInput)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('moves a WORKING issue to NEEDS_INPUT and stores the reason', async () => {
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await usecase.execute({ issueId: issue.id.value, reason: 'o turno encerrou sem conclusão' })

		const reloaded = await testBed.resolve(IssueRepository).findById(issue.id.value)
		expect(reloaded?.status).toBe(IssueStatus.NEEDS_INPUT)
		expect(reloaded?.meta).toBe('o turno encerrou sem conclusão')
	})

	it('is idempotent — a redelivered fact does not throw and does not change the reason', async () => {
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await usecase.execute({ issueId: issue.id.value, reason: 'primeira' })
		await usecase.execute({ issueId: issue.id.value, reason: 'segunda' })

		const reloaded = await testBed.resolve(IssueRepository).findById(issue.id.value)
		expect(reloaded?.status).toBe(IssueStatus.NEEDS_INPUT)
		expect(reloaded?.meta).toBe('primeira')
	})

	it('does NOT regress a COMPLETED issue', async () => {
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issues = testBed.resolve(IssueRepository)
		issue.complete('entregue')
		await issues.save(issue)

		await usecase.execute({ issueId: issue.id.value, reason: 'stop atrasado' })

		const reloaded = await issues.findById(issue.id.value)
		expect(reloaded?.status).toBe(IssueStatus.COMPLETED)
		expect(reloaded?.meta).toBe('entregue')
	})

	it('is a no-op for an unknown issue id', async () => {
		await expect(usecase.execute({ issueId: '00000000-0000-4000-8000-0000000000ff', reason: 'x' })).resolves.toBeUndefined()
	})

	it('is a no-op for an archived issue', async () => {
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issues = testBed.resolve(IssueRepository)
		issue.archive(IssueArchiveReason.MANUAL)
		await issues.save(issue)

		await expect(usecase.execute({ issueId: issue.id.value, reason: 'x' })).resolves.toBeUndefined()
	})
})
