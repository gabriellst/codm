import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { IssueArchivedEvent, IssueCompletedEvent } from '@codm/contracts-typescript/wire/events'
import { IssueArchiveReason } from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { IssueAttributesRepository } from '../repositories/IssueAttributesRepository'
import { ISSUE_ATTRIBUTE_DEFAULTS, IssueAttributes } from '../entities/IssueAttributes'
import { MarkIssueAttributesClosed } from './MarkIssueAttributesClosed'

const THREAD = '00000000-0000-4000-8000-00000000aaaa'

/**
 * THE TASK CLOSED (fase 4, item 1) — the completion stamps `closed_at` with its declared instant, the archive with
 * its fact's time; a second closing (reopened and closed again) moves the stamp forward.
 *
 * Falsifier: unsubscribe the handler from either fact and its case finds no `closed_at`.
 */
describe('MarkIssueAttributesClosed — the completion and the archive stamp closed_at', () => {
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

	const givenTask = async () => {
		const issueId = crypto.randomUUID()
		await testBed
			.resolve(IssueAttributesRepository)
			.insertIfNew(IssueAttributes.born({ issueId, ownerId: MOCK_CLOUD_OWNER_ID, threadId: THREAD, ...ISSUE_ATTRIBUTE_DEFAULTS }))
		return issueId
	}
	const closedAt = async (issueId: string) => (await testBed.resolve(IssueAttributesRepository).findByIssueId(issueId))?.closedAt
	const completed = (issueId: string, at: string) =>
		new IssueCompletedEvent({
			ownerId: MOCK_CLOUD_OWNER_ID,
			payload: { issueId, threadId: THREAD, key: 'APP-1', completedAt: new Date(at) },
		})

	it('a completion stamps its declared instant; completing again moves it forward', async () => {
		const issueId = await givenTask()
		const handler = testBed.resolve(MarkIssueAttributesClosed)

		await handler.handle(completed(issueId, '2026-11-19T10:00:00.000Z'))
		expect(await closedAt(issueId)).toEqual(new Date('2026-11-19T10:00:00.000Z'))

		await handler.handle(completed(issueId, '2026-11-21T10:00:00.000Z'))
		expect(await closedAt(issueId)).toEqual(new Date('2026-11-21T10:00:00.000Z'))
	})

	it('an archive stamps the archive fact time', async () => {
		const issueId = await givenTask()
		const archived = new IssueArchivedEvent({
			ownerId: MOCK_CLOUD_OWNER_ID,
			payload: { issueId, threadId: THREAD, reason: IssueArchiveReason.MANUAL },
		})

		await testBed.resolve(MarkIssueAttributesClosed).handle(archived)
		expect(await closedAt(issueId)).toEqual(new Date(archived.time))
	})
})
