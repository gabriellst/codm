import { describe, expect, it } from 'bun:test'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMSession } from './TerminalLLMSession'

const base = {
	ownerId: '00000000-0000-4000-8000-000000000001',
	issueId: '00000000-0000-4000-8000-0000000000aa',
	threadId: '00000000-0000-4000-8000-0000000000bb',
	provider: ProviderKind.CLAUDE_CODE,
	cwd: '/tmp/workspace',
	claudeSessionId: 'b9f1c8e2-3f44-4b55-8a66-77d1e2f3a4b5',
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
		s.recordTurn('c0000000-0000-4000-8000-000000000002', later)
		expect(s.claudeSessionId).toBe('c0000000-0000-4000-8000-000000000002')
		expect(s.lastTurnAt).toBe(later)
	})
})
