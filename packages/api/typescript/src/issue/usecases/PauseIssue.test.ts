import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { IssueControlSource, IssueLifeState, IssueStatus, IssueTimelineItemKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { assembleIssueTimeline } from '../utils/issueTimeline'
import { PauseIssue } from './PauseIssue'
import { ResumeIssue } from './ResumeIssue'
import { GetIssueDetail } from './GetIssueDetail'

/**
 * PAUSE / RESUME ARE VISIBLE (fase 2, item 2 — pausa como comando).
 *
 * Measured through the read side a person looks at: after a pause the issue detail says `paused` and
 * its life state is PAUSED (not "waiting on the usage limit", not "stalled"), and the timeline shows
 * the PAUSED and RESUMED moments with who asked and from where. A completed issue cannot be paused.
 *
 * Falsifier: drop `issue.paused` / `issue.resumed` from `EVENT_KINDS` in `issueTimeline` and the
 * timeline assertion finds neither moment; drop the `held` line in `lifeStateOf` and the detail reads
 * STALLED.
 */
describe('PauseIssue / ResumeIssue — the hold, seen from the console', () => {
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

	it('a paused issue reads PAUSED, and the timeline shows the pause and the resume with who and where', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-12', title: 'Prévia' })
		const who = { ownerId: MOCK_CLOUD_OWNER_ID, issueId: issue.id.value }

		await testBed.resolve(PauseIssue).execute({ ...who, source: IssueControlSource.WHATSAPP, requestedBy: 'Operador' })
		const detail = await testBed.resolve(GetIssueDetail).execute(who)
		expect(detail.issue.paused).toBe(true)
		expect(detail.issue.lifeState).toBe(IssueLifeState.PAUSED)
		// The lifecycle is untouched — the hold sits on top of it.
		expect(detail.issue.status).toBe(IssueStatus.WORKING)

		await testBed.resolve(ResumeIssue).execute({ ...who, source: IssueControlSource.CONSOLE })
		expect((await testBed.resolve(GetIssueDetail).execute(who)).issue.paused).toBe(false)

		const timeline = await assembleIssueTimeline(testBed.resolve(LibSqlDatabaseDriver), issue.id.value, issue.title)
		const control = timeline.filter(item => item.kind === IssueTimelineItemKind.PAUSED || item.kind === IssueTimelineItemKind.RESUMED)
		expect(control).toMatchObject([
			{ kind: IssueTimelineItemKind.PAUSED, source: IssueControlSource.WHATSAPP, by: 'Operador' },
			{ kind: IssueTimelineItemKind.RESUMED, source: IssueControlSource.CONSOLE },
		])
	})

	it('a completed issue is not pausable, and resuming what is not paused is refused', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const done = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-13', status: IssueStatus.COMPLETED })
		const running = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-14' })

		await expect(
			testBed.resolve(PauseIssue).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: done.id.value, source: IssueControlSource.CONSOLE }),
		).rejects.toMatchObject({ name: 'ISSUE_NOT_PAUSABLE' })
		await expect(
			testBed.resolve(ResumeIssue).execute({ ownerId: MOCK_CLOUD_OWNER_ID, issueId: running.id.value, source: IssueControlSource.CONSOLE }),
		).rejects.toMatchObject({ name: 'ISSUE_NOT_PAUSED' })
	})
})
