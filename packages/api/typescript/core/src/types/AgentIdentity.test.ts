import 'reflect-metadata'
import { describe, expect, it } from 'bun:test'
import { AGENT_RUN_TOKEN_HEADER, compareIdentity, readAgentRunToken, type AgentIdentity } from './AgentIdentity'
import { InMemoryAgentIdentityService } from '../services/AgentIdentityService'

const IN_AN_HOUR = () => new Date(Date.now() + 3_600_000)

const issueWorkIdentity = (): AgentIdentity => ({
	scope: 'issue-handling',
	ownerId: 'owner-a',
	issueId: 'issue-a',
	threadId: 'thread-a',
	expiresAt: IN_AN_HOUR(),
})

/** The orchestrator shape: thread-confined, structurally without an issue. */
const orchestratorIdentity = (): AgentIdentity => ({
	scope: 'orchestration',
	ownerId: 'owner-a',
	threadId: 'thread-a',
	entryId: 'entry-a',
	expiresAt: IN_AN_HOUR(),
})

describe('compareIdentity — the identity is the list, not a hardcoded deny-list', () => {
	it('FALSEADOR — a path param naming another thread is a mismatch', () => {
		const found = compareIdentity(issueWorkIdentity(), { threadId: 'ATTACKER-CHOSEN-THREAD' })
		expect(found).toHaveLength(1)
		expect(found[0]).toMatchObject({ key: 'threadId', claimed: 'thread-a', supplied: 'ATTACKER-CHOSEN-THREAD' })
	})

	it('FALSEADOR — a BODY field naming another issue is a mismatch, on the same footing as a param', () => {
		// The regression the predecessor's deep walk existed for: `RecordArtifact` composes its body
		// with `.omit({ ownerId, threadId })`, so `issueId` survives INTO the payload. At this layer the
		// payload is `request.body`, which the caller merges flat with `params` — same three axes.
		const found = compareIdentity(issueWorkIdentity(), { threadId: 'thread-a', issueId: 'issue-B' })
		expect(found.map(m => m.key)).toEqual(['issueId'])
	})

	it('reports EVERY axis, not the first — a log should show the whole shape of an attempt', () => {
		const found = compareIdentity(issueWorkIdentity(), { threadId: 'thread-B', issueId: 'issue-B' })
		expect(found.map(m => m.key).sort()).toEqual(['issueId', 'threadId'])
	})

	it('an identity that does NOT carry a key compares nothing for it — no skip branch, just absence', () => {
		// The orchestrator case. `issueId` is not in the identity, so a call naming one is not rejected
		// here; the controller that accepts it checks ownership itself (spec decision 4).
		expect(compareIdentity(orchestratorIdentity(), { threadId: 'thread-a', issueId: 'anything' })).toEqual([])
	})

	it('agreement is silence, and `scope` is never compared as an axis', () => {
		expect(compareIdentity(issueWorkIdentity(), { threadId: 'thread-a', issueId: 'issue-a', scope: 'system' })).toEqual([])
	})

	it('a non-string on either side is ignored rather than coerced', () => {
		expect(compareIdentity({ ...issueWorkIdentity(), issueId: 7 }, { issueId: '7' })).toEqual([])
		expect(compareIdentity(issueWorkIdentity(), { issueId: 7 })).toEqual([])
	})
})

describe('readAgentRunToken — both spellings, because the two callers differ', () => {
	it('reads the dedicated header the generated shim sets', () => {
		expect(readAgentRunToken({ [AGENT_RUN_TOKEN_HEADER]: 'tok' })).toBe('tok')
	})

	it('reads `Authorization: Bearer` for a client that can only set that', () => {
		expect(readAgentRunToken({ authorization: 'Bearer tok' })).toBe('tok')
	})

	it('absent is EMPTY, not an error — the operator flow has no token and is not a failure', () => {
		expect(readAgentRunToken(undefined)).toBe('')
		expect(readAgentRunToken({})).toBe('')
	})
})

describe('InMemoryAgentIdentityService — issue / resolve / revoke', () => {
	it('resolves what it issued, and the token carries nothing readable', () => {
		const service = new InMemoryAgentIdentityService()
		const identity = issueWorkIdentity()
		const token = service.issue(identity)

		expect(service.resolve(token)).toEqual(identity)
		expect(token).not.toContain('issue-a')
		expect(token).not.toContain('thread-a')
	})

	it('FALSEADOR — an EXPIRED identity resolves to null and is dropped on read', () => {
		const service = new InMemoryAgentIdentityService()
		const token = service.issue({ scope: 'issue-handling', threadId: 'thread-a', expiresAt: new Date(Date.now() - 1) })
		expect(service.resolve(token)).toBeNull()
		expect(service.resolve(token)).toBeNull()
	})

	it('FALSEADOR — revoke is immediate and idempotent: a late call from a dead run resolves to null', () => {
		const service = new InMemoryAgentIdentityService()
		const token = service.issue(issueWorkIdentity())
		service.revoke(token)
		service.revoke(token)
		expect(service.resolve(token)).toBeNull()
	})

	it('an unknown token is null — fails closed on a value nobody issued', () => {
		expect(new InMemoryAgentIdentityService().resolve('made-up')).toBeNull()
	})
})
