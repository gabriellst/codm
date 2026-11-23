import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { IssueCreatedEvent, IssueOpenedEvent } from '@codm/contracts-typescript/wire/events'
import { IssuePriority, IssueWorkKind, PriorityReason, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueRepository } from '../repositories/IssueRepository'
import { MaterializeIssueFromExecution } from './MaterializeIssueFromExecution'

/**
 * THE READ COPY OF THE TASK'S BIRTH (fase 4, S0c) — `issue.created` carries the priority, its reason and the kind of
 * work the agent recorded at the fork, and the issue row keeps them for the console, the panel and the board. The
 * two births reconcile on one row in either order: when `issue.opened` (which knows none of them) arrives first,
 * `issue.created` still fills them; and a later `issue.opened` never blanks them.
 *
 * Falsifier: drop the fields from `OpenIssue` and the first case reads no priority; drop the `coalesce` from the
 * repository's upsert and the third case blanks them.
 */
describe('MaterializeIssueFromExecution — the issue row keeps a read copy of the birth attributes', () => {
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

	const born = { priority: IssuePriority.HIGH, priorityReason: PriorityReason.CLIENT_BUG, workKind: IssueWorkKind.DIAGNOSIS }
	const created = (issueId: string, threadId: string) =>
		new IssueCreatedEvent({
			ownerId: MOCK_CLOUD_OWNER_ID,
			payload: {
				issueId,
				threadId,
				key: 'APP-7',
				title: 'Checkout quebrado',
				goal: 'o checkout de um cliente quebrou',
				originEntryId: crypto.randomUUID(),
				provider: ProviderKind.CLAUDE_CODE,
				...born,
			},
		})
	const opened = (issueId: string, threadId: string) =>
		new IssueOpenedEvent({
			ownerId: MOCK_CLOUD_OWNER_ID,
			payload: { issueId, threadId, key: 'APP-7', title: 'Checkout quebrado', provider: ProviderKind.CLAUDE_CODE },
		})
	const handle = (event: IssueCreatedEvent | IssueOpenedEvent) => testBed.resolve(MaterializeIssueFromExecution).handle(event)
	const issue = (issueId: string) => testBed.resolve(IssueRepository).findById(issueId)

	it('issue.created writes the priority, its reason and the kind of work', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issueId = crypto.randomUUID()
		await handle(created(issueId, thread.id.value))
		expect(await issue(issueId)).toEqual(expect.objectContaining(born))
	})

	it('issue.opened first, issue.created second — the second still fills the attributes', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issueId = crypto.randomUUID()
		await handle(opened(issueId, thread.id.value))
		expect((await issue(issueId))?.priority).toBeUndefined()

		await handle(created(issueId, thread.id.value))
		expect(await issue(issueId)).toEqual(expect.objectContaining(born))
	})

	it('a later save of an aggregate that knows none of them never blanks them', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issueId = crypto.randomUUID()
		await handle(created(issueId, thread.id.value))
		const loaded = await issue(issueId)
		if (!loaded) throw new Error('issue not materialized')
		// A stale aggregate of the same issue without the attributes, saved over the row.
		loaded.priority = undefined
		loaded.priorityReason = undefined
		loaded.workKind = undefined
		await testBed.resolve(IssueRepository).save(loaded)

		expect(await issue(issueId)).toEqual(expect.objectContaining(born))
	})
})
