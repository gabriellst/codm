import { describe, expect, it } from 'bun:test'
import type { HttpControllerRequest } from '@codedm/core-typescript'
import { ProviderKind, ProviderStatus } from '@codedm/contracts-typescript/wire/enums'
import { MockProviderDetector } from '../services/ProviderDetector/MockProviderDetector'
import { DetectProvidersController } from './DetectProviders'

function buildRequest(): HttpControllerRequest<unknown> {
	const raw = new Request('http://localhost/v1/terminal/providers')
	return { url: raw.url, ctx: {}, raw }
}

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
		const controller = new DetectProvidersController(detector)

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const claude = body.providers.find(p => p.name === ProviderKind.CLAUDE_CODE)
		expect(claude).toBeDefined()
		// Exactly the declared OutputSchema keys present on this row — `caps` (and anything else not
		// on the schema) must never appear, since nothing downstream of `handle()` strips it.
		expect(Object.keys(claude!).sort()).toEqual(['binaryPath', 'name', 'status', 'version'])
	})

	it('omits binaryPath/version for a NOT_INSTALLED provider (undefined keys drop out of JSON, matching the .optional() schema)', async () => {
		const detector = MockProviderDetector.with({
			[ProviderKind.CODEX]: { name: ProviderKind.CODEX, status: ProviderStatus.NOT_INSTALLED },
		})
		const controller = new DetectProvidersController(detector)

		const response = await controller.executeController(buildRequest())
		const body = (await response.json()) as { providers: Record<string, unknown>[] }

		const codex = body.providers.find(p => p.name === ProviderKind.CODEX)
		expect(codex).toBeDefined()
		expect(Object.keys(codex!).sort()).toEqual(['name', 'status'])
	})
})
