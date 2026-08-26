import { testId } from '@test/support'
import { describe, expect, it } from 'bun:test'
import { AgentModelId, ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { ResumeInvalidationReason } from '../enums'
import { AgentSession } from './AgentSession'

const CURSOR = testId('agent-session-entity', 'entry-1')

const base = {
	ownerId: testId('agent-session-entity', 'owner'),
	issueId: testId('agent-session-entity', 'issue'),
	threadId: testId('agent-session-entity', 'thread'),
	provider: ProviderKind.CLAUDE_CODE,
	cwd: '/tmp/workspace',
	agentSessionId: testId('agent-session-entity', 'agent-session'),
	model: AgentModelId.SONNET,
	lastMessageId: CURSOR,
}

/** The premises that make a resume legal — each test below breaks exactly ONE of them. */
const validCtx = { model: base.model, cwd: base.cwd, cursor: CURSOR }

describe('AgentSession entity', () => {
	it('create() stamps lastTurnAt and carries the session identity (issueId per Fork B)', () => {
		const s = AgentSession.create(base)
		expect(s.issueId).toBe(base.issueId)
		expect(s.agentSessionId).toBe(base.agentSessionId)
		expect(s.model).toBe(AgentModelId.SONNET)
		expect(s.lastMessageId).toBe(CURSOR)
		expect(s.lastTurnAt).toBeInstanceOf(Date)
	})

	it('recordTurn() advances lastTurnAt and folds in the new session id, model and cursor', () => {
		const s = AgentSession.create(base)
		const later = new Date(Date.now() + 60_000)
		s.recordTurn({
			agentSessionId: testId('agent-session-entity', 'agent-session-2'),
			model: AgentModelId.OPUS,
			cwd: base.cwd,
			lastMessageId: testId('agent-session-entity', 'entry-2'),
			at: later,
		})
		expect(s.agentSessionId).toBe(testId('agent-session-entity', 'agent-session-2'))
		expect(s.model).toBe(AgentModelId.OPUS)
		expect(s.lastMessageId).toBe(testId('agent-session-entity', 'entry-2'))
		expect(s.lastTurnAt).toBe(later)
	})

	it('recordTurn() folds cwd — the row adopts the NEW cwd as the reference point for the next resume comparison', () => {
		const s = AgentSession.create(base)
		s.recordTurn({ agentSessionId: 'sid-2', model: base.model, cwd: '/tmp/other-workspace' })
		expect(s.cwd).toBe('/tmp/other-workspace')

		// This is the convergence property itself: comparing the SAME cwd again now resumes instead
		// of invalidating a second time.
		expect(s.resumeDecision({ model: base.model, cwd: '/tmp/other-workspace', cursor: s.lastMessageId })).toEqual({
			resume: true,
			id: 'sid-2',
		})
	})

	describe('resumeDecision() — the four invalidation guards (AC-4.2, one test per reason)', () => {
		it('resumes when every premise still holds', () => {
			const decision = AgentSession.create(base).resumeDecision(validCtx)
			expect(decision).toEqual({ resume: true, id: base.agentSessionId })
		})

		it('model_changed — the run asks for a different model than the session was created under', () => {
			const decision = AgentSession.create(base).resumeDecision({ ...validCtx, model: AgentModelId.OPUS })
			expect(decision).toEqual({ resume: false, reason: ResumeInvalidationReason.MODEL_CHANGED })
		})

		it('cwd_changed — the workspace path moved out from under the session', () => {
			const decision = AgentSession.create(base).resumeDecision({ ...validCtx, cwd: '/tmp/other-workspace' })
			expect(decision).toEqual({ resume: false, reason: ResumeInvalidationReason.CWD_CHANGED })
		})

		it('missing_cursor — the row never recorded where the conversation stood', () => {
			const decision = AgentSession.create({ ...base, lastMessageId: undefined }).resumeDecision(validCtx)
			expect(decision).toEqual({ resume: false, reason: ResumeInvalidationReason.MISSING_CURSOR })
		})

		it('conversation_advanced — the transcript moved past what this CLI session consumed', () => {
			const decision = AgentSession.create(base).resumeDecision({ ...validCtx, cursor: testId('agent-session-entity', 'entry-9') })
			expect(decision).toEqual({ resume: false, reason: ResumeInvalidationReason.CONVERSATION_ADVANCED })
		})

		it('conversation_advanced — a caller that observed NO cursor also fails closed, never silently resumes', () => {
			const decision = AgentSession.create(base).resumeDecision({ model: base.model, cwd: base.cwd })
			expect(decision).toEqual({ resume: false, reason: ResumeInvalidationReason.CONVERSATION_ADVANCED })
		})

		it('reports the most structural reason first when several premises broke at once', () => {
			const decision = AgentSession.create(base).resumeDecision({ model: AgentModelId.HAIKU, cwd: '/tmp/elsewhere', cursor: 'nope' })
			expect(decision).toEqual({ resume: false, reason: ResumeInvalidationReason.MODEL_CHANGED })
		})
	})
})
