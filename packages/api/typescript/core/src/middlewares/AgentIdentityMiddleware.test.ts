import 'reflect-metadata'
import { describe, expect, it } from 'bun:test'
import { BaseError } from '../types/BaseError'
import { AGENT_RUN_TOKEN_HEADER, type AgentIdentity } from '../types/AgentIdentity'
import { InMemoryAgentIdentityService } from '../services/AgentIdentityService'
import { AgentIdentityMiddleware } from './AgentIdentityMiddleware'
import type { HttpControllerRequest } from '../types/Http'

const ISSUE_A = '00000000-0000-4000-8000-0000000000a2'
const ISSUE_B = '00000000-0000-4000-8000-0000000000b2'
const THREAD_A = '00000000-0000-4000-8000-0000000000a3'
const THREAD_B = '00000000-0000-4000-8000-0000000000b3'

const identityForA = (): AgentIdentity => ({
	scope: 'issue-handling',
	ownerId: '00000000-0000-4000-8000-0000000000a1',
	issueId: ISSUE_A,
	threadId: THREAD_A,
	expiresAt: new Date(Date.now() + 60_000),
})

const requestWith = (token: string | undefined, params: Record<string, unknown>, body: Record<string, unknown> = {}) =>
	({
		...(token !== undefined && { headers: { [AGENT_RUN_TOKEN_HEADER]: token } }),
		params,
		body,
		ctx: {},
	}) as unknown as HttpControllerRequest<unknown>

/**
 * THE MANDATORY MITIGATION, AT ITS NEW LAYER (B2 — the property `agent/mcp/identity.ts` used to hold).
 *
 * The attack modelled is not hypothetical: an inbound WhatsApp message is attacker-authored text that
 * reaches a model holding six write tools, and "act on a different issue" is the first thing an
 * injected instruction would try. Three vectors, because a generated tool inherits its controller's
 * parameters AND its body — `RecordArtifact` takes `threadId` as a path parameter and carries an
 * `issueId` inside the payload, so a check that only compared the path would pass a cross-issue test
 * while the body still targeted issue B.
 */
describe('AgentIdentityMiddleware', () => {
	const build = () => {
		const identities = new InMemoryAgentIdentityService()
		const middleware = new AgentIdentityMiddleware(identities)
		return { identities, middleware }
	}

	it('AC-11 — NO token: the request passes untouched, and nothing is stamped', async () => {
		// The console's own reads. 23 of the 32 exposed controllers are served to a human operator with
		// no run anywhere; fail-closed here would take them all down to protect a surface no agent calls.
		const { middleware } = build()
		const request = requestWith(undefined, { threadId: THREAD_B })
		await expect(middleware.execute(request)).resolves.toEqual({})
		expect(request.ctx.agentIdentity).toBeUndefined()
	})

	it('a token that is PRESENT and dead is 401 — a late call from a run that already ended', async () => {
		const { identities, middleware } = build()
		const token = identities.issue(identityForA())
		identities.revoke(token)
		await expect(middleware.execute(requestWith(token, { threadId: THREAD_A }))).rejects.toThrow(
			expect.objectContaining({ name: 'UNAUTHORIZED' }) as BaseError,
		)
	})

	it('FALSEADOR — a PATH PARAM naming another thread is 403 and nothing is stamped', async () => {
		const { identities, middleware } = build()
		const request = requestWith(identities.issue(identityForA()), { threadId: THREAD_B })
		await expect(middleware.execute(request)).rejects.toThrow(expect.objectContaining({ name: 'FORBIDDEN' }) as BaseError)
		expect(request.ctx.agentIdentity).toBeUndefined()
	})

	it('FALSEADOR — a BODY field naming another issue is 403, on the same footing as a param', async () => {
		const { identities, middleware } = build()
		const request = requestWith(identities.issue(identityForA()), { threadId: THREAD_A }, { issueId: ISSUE_B })
		await expect(middleware.execute(request)).rejects.toThrow(expect.objectContaining({ name: 'FORBIDDEN' }) as BaseError)
	})

	it('a concordant call is stamped with the identity the controller then reads', async () => {
		const { identities, middleware } = build()
		const request = requestWith(identities.issue(identityForA()), { threadId: THREAD_A }, { issueId: ISSUE_A })
		await expect(middleware.execute(request)).resolves.toEqual({})
		expect(request.ctx.agentIdentity).toMatchObject({ threadId: THREAD_A, issueId: ISSUE_A })
	})

	it('an identity WITHOUT an axis does not gate that axis — and the controller is told to', async () => {
		// The orchestrator shape. This is the documented gap of spec decision 4, asserted so that a
		// future change which silently started rejecting here would be visible.
		const { identities, middleware } = build()
		const token = identities.issue({ scope: 'orchestration', threadId: THREAD_A, expiresAt: new Date(Date.now() + 60_000) })
		await expect(middleware.execute(requestWith(token, { threadId: THREAD_A, issueId: ISSUE_B }))).resolves.toEqual({})
	})

	it('`Authorization: Bearer` works too — an external MCP client may only be able to set that', async () => {
		const { identities, middleware } = build()
		const token = identities.issue(identityForA())
		const request = {
			headers: { authorization: `Bearer ${token}` },
			params: { threadId: THREAD_A },
			body: {},
			ctx: {},
		} as unknown as HttpControllerRequest<unknown>
		await expect(middleware.execute(request)).resolves.toEqual({})
	})
})
