import { describe, expect, it } from 'bun:test'
import type { HttpControllerRequest } from '@codm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codm/contracts-typescript/wire/enums'
import { MockProviderDetector } from '../services/ProviderDetector/MockProviderDetector'
import { FixedAgentRunnerFactory } from '../services/AgentRunnerFactory'
import { StubAgentRunner } from '../services/AgentRunner'
import { DetectProvidersController } from './DetectProviders'

function buildRequest(): HttpControllerRequest<unknown> {
	const raw = new Request('http://localhost/v1/terminal/providers')
	return { url: raw.url, ctx: {}, raw }
}

/**
 * The factory the controller reads `supported` from. `FixedAgentRunnerFactory` is the REAL wiring
 * class (its `supported` is the same `STANDS_IN_FOR` the `mock`/`integration` envs bind), not a
 * bespoke double — so widening the wiring layer's idea of what it can drive turns these tests red,
 * which is the whole point of deriving `comingSoon` from it instead of from a literal list.
 */
const runnerFactory = () => new FixedAgentRunnerFactory(new StubAgentRunner())

describe('DetectProvidersController — wire shape (HIGH finding regression)', () => {
	// core's `Controller.serializeBody` is a bare `JSON.stringify` — it never parses/strips the
	// handler's return value against `outputSchema`. So the ONLY thing standing between an internal
	// probe field (`ProviderDetection.caps`, GOAL-agent-abstraction §4.7) and the public response body
	// is `handle()` mapping explicitly to the declared shape. This test proves that mapping holds by
	// asserting the actual serialized body, not just the schema declaration.
	it('never leaks ProviderDetection.caps onto the response body', async () => {
		const detector = MockProviderDetector.with({
			[ProviderKind.CLAUDE_CODE]: {
				name: ProviderKind.CLAUDE_CODE,
				status: ProviderStatus.DETECTED,
				binaryPath: '/usr/local/bin/claude',
				version: '1.0.0',
				caps: { mcpConfig: true, partialMessages: true, sessionResume: true },
			},
		})
		const controller = new DetectProvidersController(detector, runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const claude = body.providers.find(p => p.name === ProviderKind.CLAUDE_CODE)
		expect(claude).toBeDefined()
		// Exactly the declared OutputSchema keys present on this row — `caps` (and anything else not
		// on the schema) must never appear, since nothing downstream of `handle()` strips it.
		expect(Object.keys(claude!).sort()).toEqual(['binaryPath', 'comingSoon', 'name', 'status', 'version'])
	})

	it('omits binaryPath/version for a NOT_INSTALLED provider (undefined keys drop out of JSON, matching the .optional() schema)', async () => {
		const detector = MockProviderDetector.with({
			[ProviderKind.CODEX]: { name: ProviderKind.CODEX, status: ProviderStatus.NOT_INSTALLED },
		})
		const controller = new DetectProvidersController(detector, runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const codex = body.providers.find(p => p.name === ProviderKind.CODEX)
		expect(codex).toBeDefined()
		// `comingSoon` is NOT optional — it is a boolean the UI branches on, so it is always present.
		expect(Object.keys(codex!).sort()).toEqual(['comingSoon', 'name', 'status'])
	})
})

/**
 * `comingSoon` — the second axis, and the one detection alone cannot answer.
 *
 * `status` says whether a BINARY is on this machine. It says nothing about whether this engine has a
 * class that knows how to drive that binary — `PROVIDER_BINARIES` declares real `bin` names for codex
 * and opencode precisely so they are REPORTED honestly, while `AgentRunnerFactory.supported` lists the
 * one CLI a runner exists for. Before this field the two axes were collapsed into `status`, and the
 * collapse was a lie with a consequence: a machine with the codex CLI on PATH reported DETECTED, the
 * attach wizard turned that into `available: true`, the operator picked CODEX, `AttachThread` accepted
 * it (it only checks installation) and the run died at `AgentRunnerFactory.for` with NOT_IMPLEMENTED —
 * one screen too late, on a thread already created.
 */
describe('DetectProvidersController — comingSoon', () => {
	it('flags a DETECTED provider with no runner as comingSoon (the two axes are independent)', async () => {
		// codex INSTALLED and probed — the exact machine on which the old shape lied.
		const detector = MockProviderDetector.with({
			[ProviderKind.CODEX]: {
				name: ProviderKind.CODEX,
				status: ProviderStatus.DETECTED,
				binaryPath: '/usr/local/bin/codex',
				version: '3.1.0',
			},
		})
		const controller = new DetectProvidersController(detector, runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const codex = body.providers.find(p => p.name === ProviderKind.CODEX)
		// Still DETECTED — the binary IS there and saying otherwise would tell the operator to install
		// something they already have. What changed is that the response no longer implies we can drive it.
		expect(codex).toMatchObject({ status: ProviderStatus.DETECTED, comingSoon: true })
	})

	it('does NOT flag the provider the bound factory can drive', async () => {
		const controller = new DetectProvidersController(new MockProviderDetector(), runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const claude = body.providers.find(p => p.name === ProviderKind.CLAUDE_CODE)
		expect(claude).toMatchObject({ status: ProviderStatus.DETECTED, comingSoon: false })
	})

	it('flags every provider the factory does not drive, installed or not', async () => {
		const controller = new DetectProvidersController(new MockProviderDetector(), runnerFactory())

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		expect(body.providers.find(p => p.name === ProviderKind.CODEX)?.comingSoon).toBe(true)
		expect(body.providers.find(p => p.name === ProviderKind.OPENCODE)?.comingSoon).toBe(true)
	})
})
