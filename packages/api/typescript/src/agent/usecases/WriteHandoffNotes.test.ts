import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { AgentModelId, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { TestBed, testId } from '@test/support'
import { WriteHandoffNotes } from './WriteHandoffNotes'
import { AgentSessionRepository } from '../repositories/AgentSessionRepository'
import { AgentSession } from '../entities/AgentSession'

/**
 * WriteHandoffNotes (fase 4, item 6a) — the session's notes land on the issue's session row, replacing the previous
 * ones; an issue with no session (or another conversation's) has nowhere to write them.
 */
describe('WriteHandoffNotes use case', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	const ownerId = testId('write-handoff', 'owner')
	const threadId = testId('write-handoff', 'thread')
	const issueId = testId('write-handoff', 'issue')

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('writes the notes on the session row — the latest replaces the earlier', async () => {
		const sessions = testBed.resolve(AgentSessionRepository)
		await sessions.save(
			AgentSession.create({
				ownerId,
				issueId,
				threadId,
				provider: ProviderKind.CLAUDE_CODE,
				cwd: '/tmp/workspace',
				agentSessionId: 'sess-1',
				model: AgentModelId.DEFAULT,
				lastMessageId: testId('write-handoff', 'entry'),
				contextTokens: 110_000,
			}),
		)
		const useCase = testBed.resolve(WriteHandoffNotes)
		await useCase.execute({ ownerId, threadId, issueId, notes: 'first notes' })
		await useCase.execute({ ownerId, threadId, issueId, notes: 'Goal: X. Done: Y. Next: Z.' })

		const row = await sessions.findByIssueId(issueId)
		expect(row?.handoffNotes).toBe('Goal: X. Done: Y. Next: Z.')
		expect(row?.handoffAt).toBeInstanceOf(Date)
		// Nothing else of the session moves.
		expect(row?.agentSessionId).toBe('sess-1')
		expect(row?.lastContextTokens).toBe(110_000)
	})

	it('an issue without a session — or one of another conversation — is NOT_FOUND', async () => {
		const useCase = testBed.resolve(WriteHandoffNotes)
		await expect(useCase.execute({ ownerId, threadId, issueId, notes: 'notes' })).rejects.toMatchObject({ name: 'NOT_FOUND' })

		await testBed.resolve(AgentSessionRepository).save(
			AgentSession.create({
				ownerId,
				issueId,
				threadId,
				provider: ProviderKind.CLAUDE_CODE,
				cwd: '/tmp/workspace',
				agentSessionId: 'sess-1',
				model: AgentModelId.DEFAULT,
			}),
		)
		const otherThread = testId('write-handoff', 'other-thread')
		await expect(useCase.execute({ ownerId, threadId: otherThread, issueId, notes: 'notes' })).rejects.toMatchObject({ name: 'NOT_FOUND' })
	})
})
