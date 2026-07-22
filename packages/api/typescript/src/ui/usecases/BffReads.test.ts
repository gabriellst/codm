import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenWorkspace, givenThread } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { GetSetupChecklist } from './GetSetupChecklist'
import { GetSettings } from './GetSettings'
import { GetAttachThreadWizard } from './GetAttachThreadWizard'

/** The phase-6b BFF reads (T08 Settings / T15 Attach wizard / onboarding checklist) against real reads. */
describe('UI BFF reads', () => {
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

	it('GetSetupChecklist reflects workspace/thread done, channel not connected', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value })

		const out = await testBed.resolve(GetSetupChecklist).execute({ ownerId: OPERATOR_ID })
		expect(out).toMatchObject({ workspaceDone: true, threadDone: true, channelDone: false })
	})

	it('GetSettings composes providers + stop criteria + general + appVersion', async () => {
		const out = await testBed.resolve(GetSettings).execute({ ownerId: OPERATOR_ID })
		expect(out.providers.length).toBeGreaterThan(0)
		expect(out.stopCriteria).toMatchObject({ serverErrors: expect.any(Boolean), humanRequested: expect.any(Boolean) })
		expect(out.general).toHaveProperty('dataDir')
		expect(out.appVersion).toBe('0.0.1')
	})

	it('GetAttachThreadWizard composes contacts + workspaces + providers with the flags', async () => {
		const workspace = await givenWorkspace(testBed, { ownerId: OPERATOR_ID })
		await givenThread(testBed, { ownerId: OPERATOR_ID, workspaceId: workspace.id.value, contactDisplayName: 'Ada' })

		const out = await testBed.resolve(GetAttachThreadWizard).execute({ ownerId: OPERATOR_ID })
		expect(out.workspaces.length).toBeGreaterThanOrEqual(1)
		expect(out.providers.length).toBeGreaterThan(0)
		expect(out.noChannelConnected).toBe(true)
		// Contacts source from the gateway remotes directory; with NO channel connected there are no
		// owner channels to read remotes for — empty is the CORRECT new semantics (was thread-derived).
		expect(out.contacts).toHaveLength(0)
	})
})
