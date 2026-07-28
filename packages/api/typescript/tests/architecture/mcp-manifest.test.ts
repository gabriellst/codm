import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MCP_SCOPES, MCP_SCOPE_NAMES, ISSUE_HANDLING_OPERATION, operationIdOf, scopeOperationIds } from '@agent/mcp/manifest'

/**
 * AC-6.15(c)/(d) — THE MANIFEST AND THE EMITTED SPEC DESCRIBE THE SAME SURFACE, IN BOTH DIRECTIONS.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS TEST AND NOT THE GENERATOR'S ASSERTION. The SDK generator throws when the emitted tool
 * surface disagrees with what the spec publishes — but from inside a spec, "this service declares no
 * MCP surface" and "this service's MCP declaration never registered" are the SAME BYTES, and service
 * discovery is generic (`lib/discover.ts` walks `packages/api/*`), so the generator cannot special-case
 * one service into "must be non-empty" without inventing a second source of truth for the scope list.
 *
 * MEASURED failure mode this closes: commenting out the single side-effect line `import './mcp/register'`
 * in `agent/registry.ts` drops `x-mcp-scope` to zero occurrences, emits BOTH scope directories with
 * zero `registerTool`, and `bun sdk` still exits 0 — because an empty published manifest means the
 * assertion loop never runs and zero `pluginMcp` instances are constructed. That is precisely the
 * "zero tools, build ok, agent degrades silently onto the INFERRED path" outcome AC-6.14(c) was
 * written to make impossible.
 *
 * This rail reads the TYPED MANIFEST (the declaration, in source) and the COMMITTED `openapi.json`
 * (the artifact everything downstream is generated from) and requires them to agree. It goes red the
 * moment either side drifts: an unregistered manifest, a stale spec, an operation renamed on one side.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const SPEC_PATH = join(import.meta.dir, '..', '..', 'public', 'docs', 'openapi.json')

interface EmittedOperation {
	operationId: string
	tags?: string[]
	'x-mcp-scope'?: string[]
}

function readSpec(): { operations: EmittedOperation[]; manifest: Record<string, string[]> } {
	const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as {
		paths: Record<string, Record<string, EmittedOperation>>
		'x-mcp-scopes'?: Record<string, string[]>
	}
	const operations: EmittedOperation[] = []
	for (const methods of Object.values(spec.paths)) {
		for (const operation of Object.values(methods)) {
			if (operation && typeof operation === 'object' && operation.operationId) operations.push(operation)
		}
	}
	return { operations, manifest: spec['x-mcp-scopes'] ?? {} }
}

const sorted = (values: readonly string[]): string[] => [...values].sort()

describe('AC-6.15(c) — the manifest and the emitted spec are set-equal, both directions', () => {
	const { operations, manifest } = readSpec()

	test('the spec publishes a manifest at all — an unregistered declaration is not "no declaration"', () => {
		// The FALSIFIER'S target. Without this line, dropping `import './mcp/register'` leaves every
		// other assertion here comparing empty to empty and passing.
		expect(Object.keys(manifest).sort()).toEqual(sorted(MCP_SCOPE_NAMES))
		for (const scope of MCP_SCOPE_NAMES) expect(manifest[scope]?.length ?? 0).toBeGreaterThan(0)
	})

	for (const scope of MCP_SCOPE_NAMES) {
		test(`'${scope}': the TYPED manifest and the published root extension agree`, () => {
			expect(sorted(manifest[scope] ?? [])).toEqual(sorted(scopeOperationIds(scope)))
		})

		test(`'${scope}': the operations STAMPED with x-mcp-scope are exactly the manifest's`, () => {
			const stamped = operations.filter(operation => (operation['x-mcp-scope'] ?? []).includes(scope)).map(operation => operation.operationId)
			expect(sorted(stamped)).toEqual(sorted(scopeOperationIds(scope)))
		})

		test(`AC-6.15(d) — '${scope}': the synthetic tag describes the same set as the extension`, () => {
			// If these ever diverge, the DECLARATION OF RECORD and the TRANSPORT have come apart: the
			// spec would say an operation is in the scope while Kubb's tag filter, which reads only tags,
			// would not emit it — a shorter tool surface than the one under review.
			const tagged = operations.filter(operation => (operation.tags ?? []).includes(`mcp:${scope}`)).map(operation => operation.operationId)
			const stamped = operations.filter(operation => (operation['x-mcp-scope'] ?? []).includes(scope)).map(operation => operation.operationId)
			expect(sorted(tagged)).toEqual(sorted(stamped))
		})
	}

	test('THE DEFAULT IS NOT EXPOSED — an unscoped operation carries no mcp: tag either', () => {
		const leaked = operations
			.filter(operation => (operation['x-mcp-scope'] ?? []).length === 0)
			.filter(operation => (operation.tags ?? []).some(tag => tag.startsWith('mcp:')))
			.map(operation => operation.operationId)
		expect(leaked).toEqual([])
	})

	test('the operationId derivation is the EMITTER’s own rule, not a second one', () => {
		// `operationIdOf` is a copy of `buildOperationId`. If it ever drifted, every set-equality above
		// would fail — this asserts the rule directly so the failure names the cause.
		for (const scope of MCP_SCOPE_NAMES) {
			for (const controller of MCP_SCOPES[scope]) {
				expect(operations.map(operation => operation.operationId)).toContain(operationIdOf(controller))
			}
		}
	})
})

describe('the keyed issue-handling operations stay a VIEW of the scope, never a second list', () => {
	test('ISSUE_HANDLING_OPERATION is set-equal to SCOPE_OPS(issue-handling)', () => {
		// `E2eMcpDriver` and `IssueWorkPromptBuilder` name single operations through this map. Without
		// this assertion it would be free to rot into a stale copy of the scope it claims to index.
		expect(sorted(Object.values(ISSUE_HANDLING_OPERATION))).toEqual(sorted(scopeOperationIds('issue-handling')))
	})
})
