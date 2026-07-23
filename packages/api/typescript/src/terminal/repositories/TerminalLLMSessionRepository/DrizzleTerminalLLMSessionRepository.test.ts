import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMSession } from '../../entities/TerminalLLMSession'
import { TerminalLLMSessionRepository } from './TerminalLLMSessionRepository'

function makeSession(overrides: Partial<Parameters<typeof TerminalLLMSession.create>[0]> = {}) {
	return TerminalLLMSession.create({
		ownerId: '00000000-0000-4000-8000-000000000001',
		issueId: testId(),
		threadId: '00000000-0000-4000-8000-0000000000bb',
		provider: ProviderKind.CLAUDE_CODE,
		cwd: '/tmp/workspace',
		claudeSessionId: 'b9f1c8e2-3f44-4b55-8a66-77d1e2f3a4b5',
		...overrides,
	})
}

describe('DrizzleTerminalLLMSessionRepository (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let repo: TerminalLLMSessionRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
		repo = testBed.resolve(TerminalLLMSessionRepository)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('save + findByIssueId round-trips (session identity = issueId, Fork B)', async () => {
		const session = makeSession()
		await repo.save(session)

		const found = await repo.findByIssueId(session.issueId)
		expect(found).toBeDefined()
		expect(found?.claudeSessionId).toBe(session.claudeSessionId)
		expect(found?.provider).toBe(ProviderKind.CLAUDE_CODE)
		expect(found?.cwd).toBe('/tmp/workspace')
	})

	it('findByIssueId returns undefined for an unknown issue', async () => {
		expect(await repo.findByIssueId(testId())).toBeUndefined()
	})

	it('save UPSERTs — recordTurn + re-save mutates the row and bumps version', async () => {
		const session = makeSession()
		await repo.save(session)
		session.recordTurn('c0000000-0000-4000-8000-000000000002')
		await repo.save(session)

		const found = await repo.findById(session.id.value)
		expect(found?.claudeSessionId).toBe('c0000000-0000-4000-8000-000000000002')
		expect(found?.version).toBeGreaterThanOrEqual(2)
	})

	it('listRecentForPrewarm orders by lastTurnAt DESC and honors the limit', async () => {
		const old = makeSession()
		old.recordTurn(old.claudeSessionId, new Date(Date.now() - 60_000))
		const fresh = makeSession()
		fresh.recordTurn(fresh.claudeSessionId, new Date())
		await repo.save(old)
		await repo.save(fresh)

		const top = await repo.listRecentForPrewarm(1)
		expect(top).toHaveLength(1)
		expect(top[0]?.issueId).toBe(fresh.issueId)
	})
})
