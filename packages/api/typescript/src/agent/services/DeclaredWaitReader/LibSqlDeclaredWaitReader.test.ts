import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { TestBed, givenDomainEvent, givenIssue, givenThread } from '@test/support'
import {
	IssueSignalLevel,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
} from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { IssueSpokeEvent, type SpokenLevel } from '../../events/IssueSpokeEvent'
import { DeclaredWaitReader } from './DeclaredWaitReader'

/**
 * The declared wait (fase 5, item 1): a level that declares a wait, said by THIS issue during its LAST turn.
 * Falsifiers: drop the `first_claimed_at` bound and the earlier-turn case waits forever; drop the level filter and every
 * turn waits (each ends with a PROGRESS); drop the entity filter and another issue's feedback holds this one.
 */
describe('LibSqlDeclaredWaitReader', () => {
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

	async function givenWorkingIssue() {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })
		return { issueId: issue.id.value, threadId: thread.id.value }
	}

	const spoke = (issueId: string, threadId: string, level: SpokenLevel) =>
		givenDomainEvent(
			testBed,
			new IssueSpokeEvent({
				entityId: issueId,
				ownerId: MOCK_CLOUD_OWNER_ID,
				payload: { issueId, threadId, level, text: 'texto', artifactIds: [] },
			}),
		)

	/** One turn of the issue: its item claimed, `during` run while it holds it, then consumed. */
	async function turn(issueId: string, threadId: string, during?: () => Promise<unknown>): Promise<void> {
		const mailbox = testBed.resolve(MailboxRepository)
		await mailbox.enqueue({
			ownerId: MOCK_CLOUD_OWNER_ID,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			claimClass: MailboxClaimClass.STEER,
			posture: PermissionPosture.AUTO,
			payload: { issueId, threadId, text: 'segue' },
			dedupKey: uuidv7(),
		})
		const item = await mailbox.claimNext('declared-wait-test', 60_000, [MailboxTargetKind.ISSUE])
		if (!item) throw new Error('no turn claimed')
		await during?.()
		await mailbox.complete([item.id])
	}

	it('a feedback asked in the last turn is a declared wait', async () => {
		const { issueId, threadId } = await givenWorkingIssue()
		await turn(issueId, threadId, () => spoke(issueId, threadId, IssueSignalLevel.FEEDBACK))
		expect(await testBed.resolve(DeclaredWaitReader).waiting([issueId])).toEqual(new Set([issueId]))
	})

	it('a feedback asked in an earlier turn is not — the later turn moved the cursor', async () => {
		const { issueId, threadId } = await givenWorkingIssue()
		await turn(issueId, threadId, () => spoke(issueId, threadId, IssueSignalLevel.FEEDBACK))
		await Bun.sleep(2)
		await turn(issueId, threadId, () => spoke(issueId, threadId, IssueSignalLevel.PROGRESS))
		expect(await testBed.resolve(DeclaredWaitReader).waiting([issueId])).toEqual(new Set())
	})

	it('progress is not a wait', async () => {
		const { issueId, threadId } = await givenWorkingIssue()
		await turn(issueId, threadId, () => spoke(issueId, threadId, IssueSignalLevel.PROGRESS))
		expect(await testBed.resolve(DeclaredWaitReader).waiting([issueId])).toEqual(new Set())
	})

	it("another issue's feedback does not hold this one; an issue that never ran a turn declares nothing", async () => {
		const mine = await givenWorkingIssue()
		const other = await givenWorkingIssue()
		await turn(mine.issueId, mine.threadId, () => spoke(other.issueId, other.threadId, IssueSignalLevel.FEEDBACK))
		expect(await testBed.resolve(DeclaredWaitReader).waiting([mine.issueId, other.issueId])).toEqual(new Set())
	})
})
