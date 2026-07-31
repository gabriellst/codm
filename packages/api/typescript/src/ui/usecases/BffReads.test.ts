import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenWorkspace, givenThread } from '@test/support'
import { OPERATOR_ID } from '@auth/operator'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
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

	/**
	 * Settings renders the same two axes the attach wizard does, from a different read — so it carries
	 * the same flag rather than re-deriving "can we drive this?" from `status`. The values below come
	 * from the DI-bound `AgentRunnerFactory` (`StubAgentRunnerFactory`, which stands in for claude and
	 * only claude): widen `supported` and this goes red, which is what proves the field is derived from
	 * the wiring layer and not from a list typed out beside it.
	 */
	it('GetSettings flags providers with no AgentRunner as comingSoon', async () => {
		const out = await testBed.resolve(GetSettings).execute({ ownerId: OPERATOR_ID })

		const claude = out.providers.find(p => p.provider === ProviderKind.CLAUDE_CODE)
		expect(claude).toMatchObject({ comingSoon: false, available: true })

		for (const kind of [ProviderKind.CODEX, ProviderKind.OPENCODE]) {
			expect(out.providers.find(p => p.provider === kind)).toMatchObject({ comingSoon: true, available: false })
		}
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
