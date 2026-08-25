import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { AgentModelId, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { AgentSession } from '../../entities/AgentSession'
import { AgentSessionRepository } from './AgentSessionRepository'

/**
 * AC-T4.1 — the orchestrator's session is keyed by THREAD, and the two session kinds share a table
 * without colliding (§6.1).
 *
 * The pairing is enforced by two PARTIAL uniques, which is the kind of thing that is correct in a
 * migration and wrong in the query: `findByIssueId` filters on a column that is NULL for every
 * orchestrator row, so a thread lookup that reused it would silently return nothing and every turn
 * would run FRESH — a conversation with no memory, which looks like a model quality problem rather
 * than a persistence bug.
 */
describe('AgentSessionRepository — the orchestrator row is the one with no issue', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	const THREAD = '019e4d24-6524-7041-9e1c-8108180cdd0a'
	const ISSUE = '019e4d24-6524-7041-9e1c-8108180cdd0c'

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

	const session = (overrides: { issueId?: string; agentSessionId: string }) =>
		AgentSession.create({
			ownerId: MOCK_CLOUD_OWNER_ID,
			threadId: THREAD,
			provider: ProviderKind.CLAUDE_CODE,
			cwd: '/Users/dev/project',
			model: AgentModelId.DEFAULT,
			...overrides,
		})

	it('round-trips a session with NO issueId', async () => {
		const repo = testBed.resolve(AgentSessionRepository)
		await repo.save(session({ agentSessionId: 'orch-1' }))

		const found = await repo.findOrchestratorByThreadId(THREAD)
		expect(found?.agentSessionId).toBe('orch-1')
		expect(found?.issueId).toBeUndefined()
	})

	it('a second turn finds the SAME row — which is what makes --resume possible', async () => {
		const repo = testBed.resolve(AgentSessionRepository)
		const first = session({ agentSessionId: 'orch-1' })
		await repo.save(first)

		const loaded = await repo.findOrchestratorByThreadId(THREAD)
		loaded?.recordTurn({ agentSessionId: 'orch-1', model: AgentModelId.DEFAULT, cwd: '/Users/dev/project' })
		if (loaded) await repo.save(loaded)

		const again = await repo.findOrchestratorByThreadId(THREAD)
		expect(again?.id.value).toBe(first.id.value)
		expect(again?.agentSessionId).toBe('orch-1')
	})

	/**
	 * The discrimination test. Both rows belong to the same thread, and each finder must see exactly
	 * one of them — an orchestrator lookup that returned the ISSUE's session would resume the wrong
	 * conversation into the wrong CLI session.
	 */
	it('an issue session on the SAME thread is invisible to the orchestrator lookup, and vice versa', async () => {
		const repo = testBed.resolve(AgentSessionRepository)
		await repo.save(session({ agentSessionId: 'orch-1' }))
		await repo.save(session({ issueId: ISSUE, agentSessionId: 'work-1' }))

		expect((await repo.findOrchestratorByThreadId(THREAD))?.agentSessionId).toBe('orch-1')
		expect((await repo.findByIssueId(ISSUE))?.agentSessionId).toBe('work-1')
	})
})
