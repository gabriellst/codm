import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenIssue, givenThread } from '@test/support'
import { TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { PanelPublisher, type MockPanelPublisher } from '../services/PanelPublisher'
import { PublishPanelSnapshot } from './PublishPanelSnapshot'
import { GetThreadPanelLink } from './GetThreadPanelLink'
import { RotateThreadPanelLink } from './RotateThreadPanelLink'

/**
 * THE PANEL PUSH (fase 1). Every run sends the groups (the daemon's heartbeat) and only the issues that
 * changed; not logged in sends nothing and forgets nothing; the group link is known once a push returns it.
 *
 * Falsifiers: drop the fingerprint check and the second run resends the issue; remember fingerprints
 * before a successful send and the offline run swallows the issue forever.
 */
describe('PublishPanelSnapshot', () => {
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

	it('sends groups every run and only the issues that changed; offline sends and remembers nothing', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const issue = await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-1' })
		const publisher = testBed.resolve(PanelPublisher) as MockPanelPublisher
		const run = () => testBed.resolve(PublishPanelSnapshot).execute({})

		publisher.offline = true
		expect(await run()).toEqual({ sent: false, groups: 1, issues: 0 })

		publisher.offline = false
		expect(await run()).toEqual({ sent: true, groups: 1, issues: 1 })
		const first = publisher.batches.at(-1)
		expect(first?.groups.map(group => group.threadId)).toEqual([thread.id.value])
		expect(first?.issues.map(row => row.key)).toEqual(['APP-1'])
		expect(publisher.linkOf(thread.id.value)).toBe(`https://cloud.test/panel/g/token-${thread.id.value}`)

		// Nothing changed: the groups go (heartbeat), the issue does not.
		expect(await run()).toEqual({ sent: true, groups: 1, issues: 0 })

		// Something happened to the issue: it goes again, with the new moment in its timeline.
		thread.recordEntry({ kind: TranscriptKind.SYSTEM, text: 'prévia pronta', issueId: issue.id.value })
		await testBed.resolve(ThreadRepository).save(thread)
		expect(await run()).toEqual({ sent: true, groups: 1, issues: 1 })
		expect(publisher.batches.at(-1)?.issues[0]?.timeline.some(item => item.kind === 'MESSAGE')).toBe(true)
	})

	it('the console reads a group link once pushed, and rotating replaces it; before any push there is none to rotate', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		await givenIssue(testBed, { threadId: thread.id.value, key: 'APP-2' })
		const fresh = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })

		await testBed.resolve(PublishPanelSnapshot).execute({})
		expect((await testBed.resolve(GetThreadPanelLink).execute({ threadId: thread.id.value })).url).toBe(
			`https://cloud.test/panel/g/token-${thread.id.value}`,
		)
		expect((await testBed.resolve(RotateThreadPanelLink).execute({ threadId: thread.id.value })).url).toBe(
			`https://cloud.test/panel/g/rotated-${thread.id.value}`,
		)

		const refused = await testBed
			.resolve(RotateThreadPanelLink)
			.execute({ threadId: fresh.id.value })
			.then(
				() => undefined,
				(error: unknown) => error,
			)
		expect(refused).toEqual(expect.objectContaining({ name: 'PANEL_LINK_UNAVAILABLE' }))
	})
})
