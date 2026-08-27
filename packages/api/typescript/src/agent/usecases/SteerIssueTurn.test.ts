import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread, testId } from '@test/support'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { SteerIssueTurn } from './SteerIssueTurn'

/**
 * O caso `COMPLETED` (reabre + enfileira, recusa cega, transação atômica) já é coberto por
 * `tests/flows/steer.flow.test.ts` ("steer direcionado numa issue concluída"). Esta suíte cobre a
 * metade que a spec de 2026-08-26 fechou: `NEEDS_INPUT` é outra origem produzível por `reopen()` (T1),
 * e um steer que só olhasse `completed` deixaria exatamente essas issues paradas presas.
 */
describe('SteerIssueTurn — reabre a issue certa antes de enfileirar', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const ownerId = testId('steer-issue-turn', 'owner')

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('reopens a NEEDS_INPUT issue before enqueueing the steer', async () => {
		const thread = await givenThread(testBed)
		const issue = await givenIssue(testBed, { threadId: thread.id.value })
		const issues = testBed.resolve(IssueRepository)
		issue.needsInput('travou')
		await issues.save(issue)

		await testBed.resolve(SteerIssueTurn).execute({
			ownerId: issue.ownerId,
			threadId: thread.id.value,
			issueId: issue.id.value,
			text: 'segue daqui',
		})

		const reloaded = await issues.findById(issue.id.value)
		expect(reloaded?.status).toBe(IssueStatus.WORKING)
	})

	it('does NOT call reopen on an issue that is already WORKING', async () => {
		const thread = await givenThread(testBed)
		const issue = await givenIssue(testBed, { threadId: thread.id.value })

		// `reopen()` numa issue WORKING lança `ISSUE_NOT_REOPENABLE`; se o steer a chamasse, isto falharia.
		await expect(
			testBed.resolve(SteerIssueTurn).execute({
				ownerId: issue.ownerId,
				threadId: thread.id.value,
				issueId: issue.id.value,
				text: 'segue daqui',
			}),
		).resolves.toBeDefined()
	})
})
