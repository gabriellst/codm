import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { IssuePriority, IssueWorkKind, PriorityReason, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'
import { CreateIssueController } from './CreateIssue'

/**
 * THE CONSOLE'S BIRTH OF AN ISSUE ALSO RECORDS ITS ATTRIBUTES (fase 4, S0c — revisão 2). `POST /threads/:id/issues`
 * goes through `DeclareIssueOpen`, so the issue it opens is born with the default attributes like every other one.
 *
 * Falsifier: route the controller around `DeclareIssueOpen` (or drop the record there) and the row is missing.
 */
describe('CreateIssueController — an issue opened from the console has its attributes row', () => {
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

	it('creates the issue and its NORMAL / DEFAULT / CHANGE attributes row', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const response = await testBed.resolve(CreateIssueController).execute({
			ctx: { ownerId: MOCK_CLOUD_OWNER_ID },
			params: { threadId: thread.id.value },
			body: { title: 'Corrigir o rodapé', provider: ProviderKind.CLAUDE_CODE },
		})
		expect(response.status).toBe(201)
		const issueId = response.data?.issueId ?? ''

		expect(await testBed.resolve(IssueAttributesRepository).findByIssueId(issueId)).toEqual(
			expect.objectContaining({
				issueId,
				threadId: thread.id.value,
				priority: IssuePriority.NORMAL,
				priorityReason: PriorityReason.DEFAULT,
				workKind: IssueWorkKind.CHANGE,
			}),
		)
	})
})
