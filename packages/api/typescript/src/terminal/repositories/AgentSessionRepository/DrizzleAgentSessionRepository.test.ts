import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { AgentModelId, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { ResumeInvalidationReason } from '../../enums'
import { AgentSession } from '../../entities/AgentSession'
import { AgentSessionRepository } from './AgentSessionRepository'

function makeSession(overrides: Partial<Parameters<typeof AgentSession.create>[0]> = {}) {
	return AgentSession.create({
		ownerId: testId('agent-session-repo', 'owner'),
		issueId: testId(),
		threadId: testId('agent-session-repo', 'thread'),
		provider: ProviderKind.CLAUDE_CODE,
		cwd: '/tmp/workspace',
		agentSessionId: testId('agent-session-repo', 'agent-session'),
		model: AgentModelId.SONNET,
		lastMessageId: testId('agent-session-repo', 'entry-1'),
		...overrides,
	})
}

describe('DrizzleAgentSessionRepository (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: AgentSessionRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(AgentSessionRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('save + findByIssueId round-trips every resume premise (agentSessionId, model, lastMessageId)', async () => {
		const session = makeSession()
		await repo.save(session)

		const found = await repo.findByIssueId(session.issueId)
		expect(found).toBeDefined()
		expect(found?.agentSessionId).toBe(session.agentSessionId)
		expect(found?.model).toBe(AgentModelId.SONNET)
		expect(found?.lastMessageId).toBe(session.lastMessageId)
		expect(found?.provider).toBe(ProviderKind.CLAUDE_CODE)
		expect(found?.cwd).toBe('/tmp/workspace')
	})

	it('findByIssueId returns undefined for an unknown issue', async () => {
		expect(await repo.findByIssueId(testId())).toBeUndefined()
	})

	it('a row saved without a cursor comes back with lastMessageId absent, not null', async () => {
		const session = makeSession({ lastMessageId: undefined })
		await repo.save(session)

		const found = await repo.findByIssueId(session.issueId)
		expect(found?.lastMessageId).toBeUndefined()
		// …and the entity's own guard names that state rather than resuming into it.
		expect(found?.resumeDecision({ model: AgentModelId.SONNET, cwd: '/tmp/workspace' })).toEqual({
			resume: false,
			reason: ResumeInvalidationReason.MISSING_CURSOR,
		})
	})

	it('the round-tripped row is resumable — the guard says so after a real persist/rehydrate', async () => {
		const session = makeSession()
		await repo.save(session)

		const found = await repo.findByIssueId(session.issueId)
		expect(found?.resumeDecision({ model: AgentModelId.SONNET, cwd: '/tmp/workspace', cursor: session.lastMessageId })).toEqual({
			resume: true,
			id: session.agentSessionId,
		})
	})

	it('save UPSERTs — recordTurn + re-save advances the session id, model and cursor, and bumps version', async () => {
		const session = makeSession()
		await repo.save(session)
		session.recordTurn({
			agentSessionId: testId('agent-session-repo', 'agent-session-2'),
			model: AgentModelId.OPUS,
			cwd: '/tmp/workspace',
			lastMessageId: testId('agent-session-repo', 'entry-2'),
		})
		await repo.save(session)

		const found = await repo.findById(session.id.value)
		expect(found?.agentSessionId).toBe(testId('agent-session-repo', 'agent-session-2'))
		expect(found?.model).toBe(AgentModelId.OPUS)
		expect(found?.lastMessageId).toBe(testId('agent-session-repo', 'entry-2'))
		expect(found?.version).toBeGreaterThanOrEqual(2)
	})

	it('save UPSERTs the folded cwd too — recordTurn onto a NEW cwd persists it, converging the guard', async () => {
		const session = makeSession()
		await repo.save(session)
		session.recordTurn({
			agentSessionId: testId('agent-session-repo', 'agent-session-3'),
			model: AgentModelId.SONNET,
			cwd: '/tmp/other-workspace',
			lastMessageId: testId('agent-session-repo', 'entry-3'),
		})
		await repo.save(session)

		const found = await repo.findById(session.id.value)
		expect(found?.cwd).toBe('/tmp/other-workspace')
		expect(found?.resumeDecision({ model: AgentModelId.SONNET, cwd: '/tmp/other-workspace', cursor: session.lastMessageId })).toEqual({
			resume: true,
			id: testId('agent-session-repo', 'agent-session-3'),
		})
	})

	it('the model column accepts DEFAULT — a session that never named a model is still a valid row', async () => {
		const session = makeSession({ model: AgentModelId.DEFAULT })
		await repo.save(session)
		expect((await repo.findByIssueId(session.issueId))?.model).toBe(AgentModelId.DEFAULT)
	})
})
