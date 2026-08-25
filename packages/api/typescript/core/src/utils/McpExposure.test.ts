import { describe, expect, it } from 'bun:test'
import { McpExposure, mcpScopesOf, operationIdOf, type McpExposedControllerClass } from './McpExposure'

/**
 * Class-shaped stand-ins — the scan reads a NAME and a static, and constructs nothing.
 *
 * REAL classes, not object literals: `mcpScopesOf` documents exactly two accepted shapes, an INSTANCE
 * (whose `constructor` carries the static) or a CLASS (which carries it directly), and it branches on
 * `typeof target === 'function'` to tell them apart. An object literal is neither — its `constructor`
 * is `Object`, so the static would read back as absent and every scope assertion below would collapse
 * to `[]` against an implementation that is behaving correctly.
 */
const exposed = (name: string, mcpScopes?: readonly string[]): McpExposedControllerClass => {
	const cls = class {
		static readonly mcpScopes = mcpScopes
	}
	Object.defineProperty(cls, 'name', { value: name })
	return cls as McpExposedControllerClass
}

describe('operationIdOf — one rule, two callers', () => {
	it('strips the `Controller` suffix, which is the whole convention', () => {
		expect(operationIdOf(exposed('RecordArtifactController'))).toBe('RecordArtifact')
	})

	it('appends the method ONLY for a multi-method controller — the emitter half', () => {
		expect(operationIdOf(exposed('ChannelProxyController'), 'post', ['get', 'post'])).toBe('ChannelProxyPost')
		expect(operationIdOf(exposed('CreateIssueController'), 'post', ['post'])).toBe('CreateIssue')
	})

	it('a class-side scan passes no method and gets the base name — the documented limitation', () => {
		expect(operationIdOf(exposed('ChannelProxyController'))).toBe('ChannelProxy')
	})
})

describe('mcpScopesOf — the default is NOT exposed', () => {
	it('a class that declares nothing is exposed nowhere', () => {
		expect(mcpScopesOf(exposed('ArchiveIssueController'))).toEqual([])
	})

	it('reads the static off a class', () => {
		expect(mcpScopesOf(exposed('RaiseStopController', ['issue-handling', 'orchestration']))).toEqual(['issue-handling', 'orchestration'])
	})
})

describe('McpExposure — the scan, both directions', () => {
	const scan = () =>
		McpExposure.fromClasses([
			exposed('CreateIssueController', ['issue-handling']),
			exposed('RaiseStopController', ['issue-handling', 'orchestration']),
			exposed('ForkIssueController', ['orchestration']),
			exposed('ArchiveIssueController'),
		])

	it('operationId → scopes', () => {
		expect(scan().scopesFor('RaiseStop')).toEqual(['issue-handling', 'orchestration'])
	})

	it('scope → operationIds, sorted', () => {
		expect(scan().operationIds('issue-handling')).toEqual(['CreateIssue', 'RaiseStop'])
		expect(scan().operationIds('orchestration')).toEqual(['ForkIssue', 'RaiseStop'])
	})

	it('FALSEADOR — an undeclared controller is in NO scope and in NO manifest entry', () => {
		expect(scan().scopesFor('ArchiveIssue')).toEqual([])
		expect(JSON.stringify(scan().manifest())).not.toContain('ArchiveIssue')
	})

	it('the manifest is exactly what the spec root publishes as x-mcp-scopes', () => {
		expect(scan().manifest()).toEqual({
			'issue-handling': ['CreateIssue', 'RaiseStop'],
			orchestration: ['ForkIssue', 'RaiseStop'],
		})
	})

	it('a service with NO declared surface produces an EMPTY manifest, not a missing one', () => {
		// The generator treats `{}` as "this service declares nothing"; the api-side rail is what turns
		// "declared nothing" into a red test for THIS service. Core stays honest about the difference.
		expect(McpExposure.fromClasses([exposed('ArchiveIssueController')]).manifest()).toEqual({})
		expect(McpExposure.fromClasses([]).scopes()).toEqual([])
	})

	it('fromRouters reads the same static off INSTANCES the DI already resolved', () => {
		class RecordArtifactController {
			static readonly mcpScopes = ['issue-handling'] as const
		}
		const routers = [{ controllers: [new RecordArtifactController()] }] as unknown as Parameters<typeof McpExposure.fromRouters>[0]
		expect(McpExposure.fromRouters(routers).operationIds('issue-handling')).toEqual(['RecordArtifact'])
	})
})
