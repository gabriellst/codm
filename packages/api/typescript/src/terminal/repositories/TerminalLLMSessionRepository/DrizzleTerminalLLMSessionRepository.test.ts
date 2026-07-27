import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, testId } from '@test/support'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMSession } from '../../entities/TerminalLLMSession'
import { TerminalLLMSessionRepository } from './TerminalLLMSessionRepository'

function makeSession(overrides: Partial<Parameters<typeof TerminalLLMSession.create>[0]> = {}) {
	return TerminalLLMSession.create({
		ownerId: testId('terminal-session-repo', 'owner'),
		issueId: testId(),
		threadId: testId('terminal-session-repo', 'thread'),
		provider: ProviderKind.CLAUDE_CODE,
		cwd: '/tmp/workspace',
		claudeSessionId: testId('terminal-session-repo', 'claude-session'),
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
		session.recordTurn(testId('terminal-session-repo', 'claude-session-2'))
		await repo.save(session)

		const found = await repo.findById(session.id.value)
		expect(found?.claudeSessionId).toBe(testId('terminal-session-repo', 'claude-session-2'))
		expect(found?.version).toBeGreaterThanOrEqual(2)
	})
})
