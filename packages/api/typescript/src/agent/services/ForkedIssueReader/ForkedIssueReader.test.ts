import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread, testId } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueAttributesRepository } from '../../repositories/IssueAttributesRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../../entities/IssueAttributes'
import { ForkIssue } from '../../usecases/ForkIssue'
import { ForkedIssueReader } from './ForkedIssueReader'

/**
 * "IS THIS ISSUE OF THIS CONVERSATION?" (fase 4, S0c) — the question the batch receipt (S8) asks in the same turn
 * the orchestrator forked the issue, before `issue_issues` has the row.
 *
 * Falsifier: read `issue_issues` instead of the attributes table and the same-turn case answers false.
 */
describe('ForkedIssueReader — answered from the agent attributes table', () => {
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

	const reader = () => testBed.resolve(ForkedIssueReader)

	it('an issue forked in this very turn is of its conversation — before the issue row exists', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { issueId } = await testBed.resolve(ForkIssue).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			goal: 'item 3 do lote',
			originEntryId: testId('forked-issue-reader', 'entry'),
			posture: PermissionPosture.AUTO,
		})
		expect(await reader().isOfThread(issueId, thread.id.value)).toBe(true)
	})

	it('an issue older than fase 4 is answered by its backfilled row', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issueId = crypto.randomUUID()
		// The shape migration 0037 backfilled for every existing issue.
		await testBed.resolve(IssueAttributesRepository).insertIfNew(
			IssueAttributes.born({
				issueId,
				ownerId: MOCK_CLOUD_OWNER_ID,
				threadId: thread.id.value,
				...ISSUE_ATTRIBUTE_DEFAULTS,
			}),
		)
		expect(await reader().isOfThread(issueId, thread.id.value)).toBe(true)
	})

	it('an issue of ANOTHER conversation is not — nor is an issue nobody knows', async () => {
		const mine = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const other = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const { issueId } = await testBed.resolve(ForkIssue).execute({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: other.id.value,
			goal: 'de outra conversa',
			originEntryId: testId('forked-issue-reader', 'entry-other'),
			posture: PermissionPosture.AUTO,
		})
		expect(await reader().isOfThread(issueId, mine.id.value)).toBe(false)
		expect(await reader().isOfThread(crypto.randomUUID(), mine.id.value)).toBe(false)
	})
})
