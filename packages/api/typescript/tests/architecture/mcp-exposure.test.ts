import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENT_RUN_TOKEN_HEADER } from '@codm/core-typescript'
import { MCP_RUN_TOKEN_HEADER } from '@codm/client-typescript/typescript/mcp/context'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { mcpExposure, operationIdsInScope, toolsInScope } from '@agent/mcp/exposure'

/**
 * THE GOLDEN SNAPSHOT OF WHAT A MODEL CAN CALL (B2, spec decision 7 / AC-16).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT REPLACES AND WHY THE REPLACEMENT IS NOT A DOWNGRADE
 * `mcp-manifest.test.ts` compared a TYPED MANIFEST (a hand-written `Record<McpScope,
 * ControllerClass[]>`) against the emitted spec. With the manifest gone there is no such object to
 * compare — but the two sides did not disappear, they moved: the DECLARATION is now the
 * `static mcpScopes` on each controller class (read here through the runtime scan), and the ARTIFACT
 * is still the committed `openapi.json` everything downstream is generated from. The set-equality is
 * the same in both directions, over the same two things, minus the intermediate list.
 *
 * IT IS NOT SELF-REFERENTIAL, AND THE TWO SIDES REALLY ARE TWO
 * The left side walks CLASSES through `agent/mcp/exposure.ts` (barrels → `static mcpScopes`); the
 * right side reads a JSON file emitted from INSTANCES the DI resolved, through a completely separate
 * path (`OpenAPI.generateSpecification` → `McpExposure.fromRouters`). A drift between them — a stale
 * spec, an operation renamed on one side, a controller whose class-side operationId cannot reproduce
 * the emitter's multi-method suffix — is a red test rather than a silently empty tool surface.
 *
 * MEASURED FAILURE MODE THE PREDECESSOR CLOSED, AND THIS ONE STILL CLOSES: from inside a spec, "this
 * service declares no MCP surface" and "this service's declaration never made it" are THE SAME BYTES,
 * and the SDK generator's discovery is generic — it cannot special-case one service into "must be
 * non-empty" without inventing a second source of truth. So the first test below asserts the surface
 * is non-empty at all.
 *
 * AND THE SNAPSHOT IS THE POINT, not the equalities: a controller GAINING or LOSING an
 * `static mcpScopes` is exactly the change that used to be reviewable only by reading a diff of a
 * list nobody was required to read. Now it names the tool in a failing assertion.
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
const SCOPES = Object.values(McpScope)

describe('AC-16 — the golden snapshot: scope → the tools a model can call', () => {
	/**
	 * THE ARTIFACT UNDER REVIEW. Adding `static mcpScopes` to a controller, or removing it, changes
	 * these bytes — and a reviewer reads the change as a list of TOOL NAMES rather than as a diff of a
	 * declaration buried in a class. Wire names (not operationIds) on purpose: this is the vocabulary
	 * a model is handed in `--allowedTools`, which is the surface the review is actually about.
	 */
	test('the declared tool surface, by scope', () => {
		expect(Object.fromEntries(SCOPES.map(scope => [scope, [...toolsInScope(scope)]]))).toMatchSnapshot()
	})
})

describe('the scan and the emitted spec describe the same surface, in both directions', () => {
	const { operations, manifest } = readSpec()

	test('the spec publishes a manifest at all — an undeclared surface is not "no surface"', () => {
		// THE FALSIFIER'S TARGET. Without this, a spec that published `{}` would leave every assertion
		// below comparing empty to empty and passing — the exact shape of the failure the predecessor
		// measured when one side-effect import was commented out.
		expect(Object.keys(manifest).sort()).toEqual(sorted(SCOPES))
		for (const scope of SCOPES) expect(manifest[scope]?.length ?? 0).toBeGreaterThan(0)
	})

	for (const scope of SCOPES) {
		test(`'${scope}': the CLASS-side scan and the published root extension agree`, () => {
			expect(sorted(manifest[scope] ?? [])).toEqual(sorted(operationIdsInScope(scope)))
		})

		test(`'${scope}': the operations STAMPED with x-mcp-scope are exactly the scan's`, () => {
			const stamped = operations.filter(o => (o['x-mcp-scope'] ?? []).includes(scope)).map(o => o.operationId)
			expect(sorted(stamped)).toEqual(sorted(operationIdsInScope(scope)))
		})

		test(`'${scope}': the synthetic tag describes the same set as the extension`, () => {
			// If these diverge, the DECLARATION OF RECORD and the TRANSPORT have come apart: the spec
			// would say an operation is in the scope while Kubb's tag filter, which reads ONLY tags,
			// would not emit it — a shorter tool surface than the one under review.
			const tagged = operations.filter(o => (o.tags ?? []).includes(`mcp:${scope}`)).map(o => o.operationId)
			const stamped = operations.filter(o => (o['x-mcp-scope'] ?? []).includes(scope)).map(o => o.operationId)
			expect(sorted(tagged)).toEqual(sorted(stamped))
		})
	}

	test('THE DEFAULT IS NOT EXPOSED — an unscoped operation carries no mcp: tag either', () => {
		const leaked = operations
			.filter(o => (o['x-mcp-scope'] ?? []).length === 0)
			.filter(o => (o.tags ?? []).some(tag => tag.startsWith('mcp:')))
			.map(o => o.operationId)
		expect(leaked).toEqual([])
	})

	test('every operationId the scan derives really exists in the spec', () => {
		// The class-side derivation cannot reproduce the emitter's multi-method suffix (a class does not
		// expose `method`). This is where that limitation becomes a RED TEST instead of a tool nobody
		// can call: a scoped controller that grows a second HTTP method fails here, by name.
		const emitted = new Set(operations.map(o => o.operationId))
		for (const scope of SCOPES) {
			for (const operationId of operationIdsInScope(scope)) expect(emitted.has(operationId)).toBe(true)
		}
	})

	test('AC-3 — RaiseStop is in BOTH surfaces, which is the one exposure change of that frente', () => {
		expect(sorted(mcpExposure().scopesFor('RaiseStop'))).toEqual([McpScope.ISSUE_HANDLING, McpScope.orchestration].sort())
	})

	/**
	 * AC-1 — the one exposure change of the custom-prompt frente, named rather than left to the snapshot.
	 *
	 * BOTH, and each half is load-bearing. Losing `system` would take the console's own write and the
	 * external MCP client's off the surface to serve the orchestrator, which is not a trade anybody
	 * asked for. Losing `orchestration` puts the operator back to opening the console to record a
	 * preference about the conversation they are already having.
	 *
	 * And what is NOT here is the same assertion: `issue-handling` is absent, so the agent that executes
	 * an issue — the one whose input is third-party text — cannot rewrite a conversation's standing
	 * instructions. `IssueWorkAgent.test.ts` proves the same thing from the other end.
	 */
	test('AC-1 — ConfigurePrompt is in system AND orchestration, and in no other surface', () => {
		expect(sorted(mcpExposure().scopesFor('ConfigurePrompt'))).toEqual([McpScope.system, McpScope.orchestration].sort())
	})
})

describe('D-E — the run-token header has one spelling on both sides of the wire', () => {
	test('core (server side) and the SDK (shim side) agree byte for byte', () => {
		// `core` cannot import `@codm/client-typescript` (the api depends on the SDK, so the edge would
		// be a cycle), and the generated `_http.ts` shims send THIS header and no `authorization`
		// fallback. This file is the one place allowed to import both, which makes it the one place the
		// pair can be pinned.
		expect(AGENT_RUN_TOKEN_HEADER).toBe(MCP_RUN_TOKEN_HEADER)
	})
})
