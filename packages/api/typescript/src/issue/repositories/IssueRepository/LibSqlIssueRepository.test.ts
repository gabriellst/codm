import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { Issue } from '../../entities/Issue'
import { IssueRepository } from './IssueRepository'

/**
 * PROVENANCE IS WRITE-ONCE, and the guarantee lives in an OMISSION — which is exactly the kind of
 * thing that regresses silently (orchestrator pivot §6.2).
 *
 * An issue has two birth paths that reconcile on the same row. The `issue/create` tool INSERTS it
 * knowing `originEntryId` and `goal`; `RunIssueTurn` independently raises
 * `integration.issue.opened`, whose idempotent `MaterializeIssueFromExecution` re-opens the SAME
 * issue knowing NEITHER. The repository protects the first writer by leaving both columns out of
 * `onConflictDoUpdate`'s `set`.
 *
 * Nothing about that omission announces itself. Adding the two fields to the `set` — the obvious
 * thing to do while adding any OTHER column — compiles, passes every existing test, and breaks the
 * product in a place nobody would connect to it: the finished issue's result has no entry to quote,
 * so the reply arrives attached to nothing, in a real conversation, once.
 *
 * The second test is the falsifier. It exercises the exact sequence the two birth paths produce, and
 * it FAILS if the omission is ever undone.
 */
describe('LibSqlIssueRepository — originEntryId/goal are write-once', () => {
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

	const openIssue = (overrides: { originEntryId?: string; goal?: string } = {}) =>
		Issue.open({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: '019e4d24-6524-7041-9e1c-8108180cddae',
			key: 'dark-mode-toggle',
			title: 'Dark mode toggle',
			provider: ProviderKind.CLAUDE_CODE,
			...overrides,
		})

	it('round-trips both fields through save/find', async () => {
		const repo = testBed.resolve(IssueRepository)
		const entryId = '019e4d24-6524-7041-9e1c-8108180cddaf'
		const created = openIssue({ originEntryId: entryId, goal: 'põe um toggle de dark mode' })
		await repo.save(created)

		const found = await repo.findById(created.id.value)
		expect(found?.originEntryId).toBe(entryId)
		expect(found?.goal).toBe('põe um toggle de dark mode')
	})

	it('a second save that knows NEITHER field does not blank what the first one wrote', async () => {
		const repo = testBed.resolve(IssueRepository)
		const entryId = '019e4d24-6524-7041-9e1c-8108180cddaf'

		// Path 1 — the `issue/create` tool: inserts WITH provenance.
		const created = openIssue({ originEntryId: entryId, goal: 'põe um toggle de dark mode' })
		await repo.save(created)

		// Path 2 — `MaterializeIssueFromExecution`, re-opening the SAME issue id knowing neither field.
		// It reaches `save` with a fresh entity whose provenance is `undefined`, which is precisely the
		// shape that would clobber if the columns were listed in the conflict `set`.
		const rematerialized = openIssue()
		rematerialized.id = created.id
		await repo.save(rematerialized)

		const found = await repo.findById(created.id.value)
		expect(found?.originEntryId).toBe(entryId)
		expect(found?.goal).toBe('põe um toggle de dark mode')
	})
})
