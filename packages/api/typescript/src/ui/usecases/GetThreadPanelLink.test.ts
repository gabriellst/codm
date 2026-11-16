import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenThread } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { PanelPublisher, type MockPanelPublisher } from '@issue/services/PanelPublisher'
import { GetThreadPanelLink } from './GetThreadPanelLink'

/**
 * O LINK DO PAINEL NO CONSOLE (fase 1). The console copies the group's link from here; it exists only
 * once a push returned the group's token, and a group never pushed has none.
 *
 * Falsifier: return a constant (or nothing) instead of the publisher's link and either case fails.
 */
describe('the console reads a group panel link', () => {
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

	it('is the pushed link for a published group and absent for one never pushed', async () => {
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const fresh = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const publisher = testBed.resolve(PanelPublisher) as MockPanelPublisher

		await publisher.publish({ groups: [{ threadId: thread.id.value, name: 'g' }], issues: [] })

		const read = testBed.resolve(GetThreadPanelLink)
		expect((await read.execute({ threadId: thread.id.value })).url).toBe(`https://cloud.test/panel/g/token-${thread.id.value}`)
		expect((await read.execute({ threadId: fresh.id.value })).url).toBeUndefined()
	})
})
