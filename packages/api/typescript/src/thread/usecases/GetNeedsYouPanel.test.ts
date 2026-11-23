import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenStop, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { AskAnswerKind, AskEffect, StopKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { GetNeedsYouPanel } from './GetNeedsYouPanel'

/**
 * B4 AC-9, closed here — flagged as a gap at the B4 closure and not covered by any existing test.
 * `stop-control-plane.flow.test.ts` proves a thread-level stop (no issue) MATERIALIZES and RESOLVES;
 * it never calls `GetNeedsYouPanel`, so nothing proved the `leftJoin` that replaced the `innerJoin`
 * (when `issue_stops.issue_id` went nullable) actually keeps the stop in the panel's output instead of
 * silently dropping it. An `innerJoin` regression here would pass every other suite in the repo.
 */
describe('GetNeedsYouPanel — a thread-level stop is not dropped by the join (B4 AC-9)', () => {
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

	it('FALSIFIER — a stop with NO issueId is listed, with issueId/issueKey UNDEFINED (not dropped by the leftJoin)', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenStop(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, title: 'Approve the campaign?' })

		const panel = await testBed.resolve(GetNeedsYouPanel).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })

		expect(panel.stops).toHaveLength(1)
		expect(panel.stops[0]?.issueId).toBeUndefined()
		expect(panel.stops[0]?.issueKey).toBeUndefined()
		expect(panel.stops[0]?.title).toBe('Approve the campaign?')
	})

	it('a stop WITH an issue still carries issueId + issueKey — the leftJoin resolves the key when there is one', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'ISS-42' })
		await givenStop(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, issueId: issue.id.value })

		const panel = await testBed.resolve(GetNeedsYouPanel).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })

		expect(panel.stops).toHaveLength(1)
		expect(panel.stops[0]?.issueId).toBe(issue.id.value)
		expect(panel.stops[0]?.issueKey).toBe('ISS-42')
	})

	const YES_NO = [
		{ id: 'yes', label: 'Sim' },
		{ id: 'no', label: 'Não' },
	]

	it('an ask carries its view — a decision with an effect needs a releaser and offers its options as buttons', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'APP-12' })
		await givenStop(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			issueId: issue.id.value,
			ask: { question: 'Publico a prévia?', options: YES_NO, effects: [AskEffect.PUBLISH], requested: StopKind.DECISION_REQUESTED },
		})

		const [stop] = (await testBed.resolve(GetNeedsYouPanel).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })).stops

		expect(stop?.ask).toEqual({
			kind: StopKind.DECISION_REQUESTED,
			code: 'APP-12 · D1',
			question: 'Publico a prévia?',
			reply: { kind: AskAnswerKind.OPTION, options: YES_NO },
			releaseRequired: true,
		})
		// The bare buttons never offer ANSWER — an answer needs the answer, through `POST /stops/:stopId/answer`.
		expect(stop?.availableResolutions).toEqual([StopResolution.TAKE_OVER])
	})

	it('a question without options is answered in free text and names its default (no deadline before delivery)', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, key: 'APP-15' })
		await givenStop(testBed, {
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: thread.id.value,
			issueId: issue.id.value,
			ask: {
				question: 'Qual título uso?',
				options: [],
				default: { kind: AskAnswerKind.TEXT, text: 'Novidades de novembro' },
				effects: [],
				requested: StopKind.QUESTION_ASKED,
			},
		})

		const [stop] = (await testBed.resolve(GetNeedsYouPanel).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })).stops

		expect(stop?.ask).toEqual({
			kind: StopKind.QUESTION_ASKED,
			code: 'APP-15 · D1',
			question: 'Qual título uso?',
			reply: { kind: AskAnswerKind.TEXT },
			defaultLabel: 'Novidades de novembro',
			dueAt: undefined,
		})
	})

	it('a stop that asks nothing has no ask view', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenStop(testBed, { ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value, kind: StopKind.SERVER_ERROR })

		const [stop] = (await testBed.resolve(GetNeedsYouPanel).execute({ ownerId: MOCK_CLOUD_OWNER_ID, threadId: thread.id.value })).stops

		expect(stop?.ask).toBeUndefined()
	})
})
