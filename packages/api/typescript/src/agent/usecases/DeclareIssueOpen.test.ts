import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { IssuePriority, IssueWorkKind, PriorityReason, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'
import { ForkedIssueReader } from '../services/ForkedIssueReader'
import { DeclareIssueOpen } from './DeclareIssueOpen'

/**
 * EVERY BIRTH RECORDS THE ATTRIBUTES (fase 4, S0c — revisão 2). `ForkIssue` is not the only door: a worker that
 * separates work mid-turn declares an issue here, and nothing declares a priority on this path — so the row is
 * born with the defaults, in the same transaction as the fact, and the queue, the batch receipt and the janitor
 * see the task like any other.
 *
 * Falsifier: drop `attributes.record` from `DeclareIssueOpen` and the row is missing.
 */
describe('DeclareIssueOpen — the declared issue is born with the default attributes', () => {
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

	it('writes NORMAL / DEFAULT / CHANGE for the new issue, on its thread', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const out = await testBed.resolve(DeclareIssueOpen).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			title: 'Corrigir o rodapé',
			provider: ProviderKind.CLAUDE_CODE,
		})

		const row = await testBed.resolve(IssueAttributesRepository).findByIssueId(out.issueId)
		expect(row).toEqual(
			expect.objectContaining({
				threadId: thread.id.value,
				priority: IssuePriority.NORMAL,
				priorityReason: PriorityReason.DEFAULT,
				workKind: IssueWorkKind.CHANGE,
			}),
		)
		// …which is what lets the batch receipt accept it in the very turn it was declared.
		expect(await testBed.resolve(ForkedIssueReader).isOfThread(out.issueId, thread.id.value)).toBe(true)
	})
})
