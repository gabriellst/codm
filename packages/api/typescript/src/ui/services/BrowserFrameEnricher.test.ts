import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread, givenIssue } from '@test/support'
import { StopKind, ThreadStatus } from '@template/contracts-typescript/wire/enums'
import { IssueOpenedEvent, IssueStopRaisedEvent, IssueCompletedEvent } from '@template/contracts-typescript/wire/events'
import { OPERATOR_ID } from '@auth/operator'
import { BrowserFrameEnricher } from './BrowserFrameEnricher'

/**
 * The SSE enricher synthesizing the two declared `browser.*` frames from integration facts, against
 * REAL read tables (denormalized display fields + derived status).
 */
describe('BrowserFrameEnricher', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: OPERATOR_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('stop_raised → browser.stop_raised (display fields) + browser.thread_status_changed(NEEDS_ATTENTION)', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID, contactDisplayName: 'Ada' })
		const issue = await givenIssue(testBed, { ownerId: OPERATOR_ID, threadId: thread.id.value, key: 'coupon-focus' })

		const frames = await testBed.resolve(BrowserFrameEnricher).enrich(
			new IssueStopRaisedEvent({
				ownerId: OPERATOR_ID,
				payload: { stopId: 'stop-1', issueId: issue.id.value, threadId: thread.id.value, kind: StopKind.HUMAN_REQUESTED },
			}) as never,
		)

		const stopFrame = frames.find(f => f.name === 'browser.stop_raised')
		expect(stopFrame).toMatchObject({
			threadId: thread.id.value,
			threadDisplayName: 'Ada',
			issueId: issue.id.value,
			issueKey: 'coupon-focus',
			stopKind: StopKind.HUMAN_REQUESTED,
		})
		const statusFrame = frames.find(f => f.name === 'browser.thread_status_changed')
		expect(statusFrame).toMatchObject({ threadId: thread.id.value, status: ThreadStatus.NEEDS_ATTENTION })
	})

	it('opened → browser.thread_status_changed(RUNNING) with a live agent count', async () => {
		const thread = await givenThread(testBed, { ownerId: OPERATOR_ID })

		const frames = await testBed.resolve(BrowserFrameEnricher).enrich(
			new IssueOpenedEvent({
				ownerId: OPERATOR_ID,
				payload: { issueId: '019e4d24-0000-7041-9e1c-000000000010', threadId: thread.id.value, key: 'k', title: 't', provider: thread.providers[0] },
			}) as never,
		)

		expect(frames).toHaveLength(1)
		expect(frames[0]).toMatchObject({ name: 'browser.thread_status_changed', threadId: thread.id.value, status: ThreadStatus.RUNNING })
		expect((frames[0] as { agentsRunningNow: number }).agentsRunningNow).toBeGreaterThanOrEqual(1)
	})

	it('a non-mapped fact yields no enriched frames', async () => {
		const frames = await testBed.resolve(BrowserFrameEnricher).enrich(
			new IssueCompletedEvent({
				ownerId: '',
				payload: { issueId: 'i', threadId: 't', key: 'k', completedAt: new Date() },
			}) as never,
		)
		// Empty ownerId short-circuits (envelope tenancy) → nothing synthesized.
		expect(frames).toHaveLength(0)
	})
})
