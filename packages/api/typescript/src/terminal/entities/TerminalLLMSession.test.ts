import { testId } from '@test/support'
import { describe, expect, it } from 'bun:test'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMSession } from './TerminalLLMSession'

const base = {
	ownerId: testId('terminal-session-entity', 'owner'),
	issueId: testId('terminal-session-entity', 'issue'),
	threadId: testId('terminal-session-entity', 'thread'),
	provider: ProviderKind.CLAUDE_CODE,
	cwd: '/tmp/workspace',
	claudeSessionId: testId('terminal-session-entity', 'claude-session'),
}

describe('TerminalLLMSession entity', () => {
	it('create() stamps lastTurnAt and carries the session identity (issueId per Fork B)', () => {
		const s = TerminalLLMSession.create(base)
		expect(s.issueId).toBe(base.issueId)
		expect(s.claudeSessionId).toBe(base.claudeSessionId)
		expect(s.lastTurnAt).toBeInstanceOf(Date)
	})

	it('recordTurn() advances lastTurnAt and swaps the claude session id', () => {
		const s = TerminalLLMSession.create(base)
		const later = new Date(Date.now() + 60_000)
		s.recordTurn(testId('terminal-session-entity', 'claude-session-2'), later)
		expect(s.claudeSessionId).toBe(testId('terminal-session-entity', 'claude-session-2'))
		expect(s.lastTurnAt).toBe(later)
	})
})
