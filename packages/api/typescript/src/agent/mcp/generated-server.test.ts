import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { withMcpRunContext, MCP_RUN_TOKEN_HEADER } from '@codm/client-typescript/typescript/mcp/context'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { loadGeneratedServer } from './door'

/**
 * THE GENERATED SERVER RUNS — and `tsc` being green is not evidence of that (AC-6.16).
 *
 * The defect this suite exists for was MEASURED, not imagined: `@kubb/plugin-mcp` emits
 * `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp"` with NO `.js`. The SDK's exports
 * map is `"./*": { types: "./dist/esm/*.d.ts", import: "./dist/esm/*" }`, so `tsc` resolves it through
 * `types` (`server/mcp.d.ts` exists) while the RUNTIME resolver looks for `dist/esm/server/mcp`, which
 * does not. The file typechecks and then dies with `Cannot find module` on first import. A gate made
 * only of `tsc` would have shipped it green — which is why our generator rewrites those two imports
 * and why this file drives the result through a REAL MCP `Client` instead of just importing it.
 *
 * It also pins the two properties that make the allowlist meaningful at RUNTIME rather than only at
 * codegen time: the tool list is exactly the declared surface's, and a tool from outside the scope is
 * genuinely not there.
 *
 * ### The expected surface is read from the EMITTED SPEC, not from the class-side scan
 * This file proves that the GENERATED SERVER lists exactly the declared surface, and the generated
 * server descends from `openapi.json`. Comparing the generated output against
 * `agent/mcp/exposure.ts` would close the circle on the wrong side and leave a spec↔class divergence
 * invisible here. That comparison exists and has its own home:
 * `tests/architecture/mcp-exposure.test.ts`.
 */

/** The path param the `CreateIssue` tool inherits from its controller — used by two tests below. */
const THREAD_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

const SPEC_PATH = join(import.meta.dir, '..', '..', '..', 'public', 'docs', 'openapi.json')

/** `scope → operationIds`, as PUBLISHED by the committed spec the generated servers were built from. */
function publishedOperationIds(scope: McpScope): readonly string[] {
	const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as { 'x-mcp-scopes'?: Record<string, string[]> }
	return spec['x-mcp-scopes']?.[scope] ?? []
}

async function connectTo(scope: McpScope): Promise<Client> {
	const server = await loadGeneratedServer(scope)
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	const client = new Client({ name: `test-${scope}`, version: '0.0.0' })
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
	return client
}

describe('the generated MCP server', () => {
	// Every declared scope, driven from the enum — a scope added tomorrow is covered the day it is
	// added, with no list here to keep in step.
	for (const scope of Object.values(McpScope)) {
		it(`'${scope}' loads at RUNTIME and lists exactly the published operations`, async () => {
			const client = await connectTo(scope)
			const { tools } = await client.listTools()

			// Sorted set equality, both directions: a tool the spec does not publish is an accidental
			// exposure, and a published tool that is missing is a silently empty surface. Both are the
			// failure modes the count assertion in the generator throws on, re-checked here against the
			// thing an MCP client actually sees.
			expect(tools.map(tool => tool.name).sort()).toEqual([...publishedOperationIds(scope)].sort())
			await client.close()
		})
	}

	it('a tool OUTSIDE the scope is not found — the include filter is a runtime boundary', async () => {
		const client = await connectTo(McpScope.ISSUE_HANDLING)
		// `ArchiveIssue` is a real operation of the api and is deliberately in NEITHER scope. If the
		// allowlist were only a codegen convenience this call would reach a handler.
		const result = await client.callTool({ name: 'ArchiveIssue', arguments: {} })
		expect(result.isError).toBe(true)
		expect(JSON.stringify(result.content)).toContain('ArchiveIssue')
		await client.close()
	})

	it('a handler invoked WITHOUT a run-token context refuses to issue an anonymous request', async () => {
		const client = await connectTo(McpScope.ISSUE_HANDLING)
		// No `withMcpRunContext` around this call. The `_http` shim must throw rather than let the
		// request through — a request the daemon would serve as ITSELF, with full operator authority and
		// no issue confinement. This is the confused-deputy clause (AC-6.19(c)).
		const result = await client.callTool({
			name: 'CreateIssue',
			arguments: { threadId: THREAD_ID, data: { title: 'x', provider: 'CLAUDE_CODE' } },
		})
		expect(result.isError).toBe(true)
		expect(JSON.stringify(result.content)).toContain('outside a run-token context')
		await client.close()
	})

	/**
	 * The mirror of the test above, and it is what stops that one from passing for the wrong reason: if
	 * the shim threw unconditionally, "refuses without a context" would be green while the tool was
	 * simply broken.
	 *
	 * ### It OBSERVES the request instead of reading an error string, and that is D6-13's lesson
	 * `McpRunContext` carries `token` AND `baseUrl`, because the generated `_http.ts` makes ONE context
	 * read for both — a handler must never end up authenticated against one daemon and addressed at
	 * another. An earlier version of this test passed `{ token }` alone and stayed green: the call died
	 * in URL construction, BEFORE the transport, so "it got past the guard" was true for a reason that
	 * had nothing to do with the guard. It was invisible because `tsconfig.build.json` excludes
	 * `src/**\/*.test.ts`, so no gate typechecks this file and the missing REQUIRED field was not an
	 * error anywhere.
	 *
	 * Catching a request on a real socket removes the whole class of problem: no error wording is
	 * asserted (that wording is runtime-specific — Bun says `Failed to construct 'Request'` where Node
	 * says `Failed to parse URL`, and MEASURED, the old assertion would have keyed on the wrong one),
	 * and the three things AC-6.19 actually contracts are read off the wire — the origin came from the
	 * context, the path is the controller's, and the run token is attached.
	 */
	it('WITH a run-token context the shim issues the request AT the context origin, carrying the token', async () => {
		const received: { pathname: string; token: string | null }[] = []
		const daemon = Bun.serve({
			port: 0,
			fetch(request) {
				received.push({ pathname: new URL(request.url).pathname, token: request.headers.get(MCP_RUN_TOKEN_HEADER) })
				return Response.json({ issueId: THREAD_ID, status: 'WORKING' })
			},
		})

		try {
			const client = await connectTo(McpScope.ISSUE_HANDLING)
			await withMcpRunContext({ token: 'test-token', baseUrl: daemon.url.origin }, () =>
				client.callTool({
					name: 'CreateIssue',
					arguments: { threadId: THREAD_ID, data: { title: 'x', provider: 'CLAUDE_CODE' } },
				}),
			)
			await client.close()

			expect(received).toHaveLength(1)
			// The PATH the controller declares, rendered from the tool's own arguments — proof the
			// generated handler is a client of the real endpoint and not of some parallel mechanism.
			expect(received[0]?.pathname).toBe(`/threads/${THREAD_ID}/issues`)
			// AC-6.19(a): the per-scope `_http` shim is the ONE auth seam, and it attached the credential
			// the router established. No generated handler takes a config argument, so there is nowhere
			// else this could have come from.
			expect(received[0]?.token).toBe('test-token')
		} finally {
			await daemon.stop(true)
		}
	})
})
