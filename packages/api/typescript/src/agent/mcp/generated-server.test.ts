import { describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { withMcpRunContext } from '@codedm/client-typescript/mcp-run-context'
import { MCP_SCOPE_NAMES, scopeOperationIds, type McpScope } from './manifest'
import { loadGeneratedServer } from './router'

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
 * codegen time: the tool list is exactly the manifest's, and a tool from outside the scope is
 * genuinely not there.
 */

async function connectTo(scope: McpScope): Promise<Client> {
	const server = await loadGeneratedServer(scope)
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
	const client = new Client({ name: `test-${scope}`, version: '0.0.0' })
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
	return client
}

describe('the generated MCP server', () => {
	// Every declared scope, driven from the manifest — a scope added tomorrow is covered the day it is
	// added, with no list here to keep in step.
	for (const scope of MCP_SCOPE_NAMES) {
		it(`'${scope}' loads at RUNTIME and lists exactly the manifest's operations`, async () => {
			const client = await connectTo(scope)
			const { tools } = await client.listTools()

			// Sorted set equality, both directions: a tool the manifest does not declare is an accidental
			// exposure, and a declared tool that is missing is a silently empty surface. Both are the
			// failure modes the count assertion in the generator throws on, re-checked here against the
			// thing an MCP client actually sees.
			expect(tools.map(tool => tool.name).sort()).toEqual([...scopeOperationIds(scope)].sort())
			await client.close()
		})
	}

	it('a tool OUTSIDE the scope is not found — the include filter is a runtime boundary', async () => {
		const client = await connectTo('issue-handling')
		// `ArchiveIssue` is a real operation of the api and is deliberately in NEITHER scope. If the
		// allowlist were only a codegen convenience this call would reach a handler.
		const result = await client.callTool({ name: 'ArchiveIssue', arguments: {} })
		expect(result.isError).toBe(true)
		expect(JSON.stringify(result.content)).toContain('ArchiveIssue')
		await client.close()
	})

	it('a handler invoked WITHOUT a run-token context refuses to issue an anonymous request', async () => {
		const client = await connectTo('issue-handling')
		// No `withMcpRunContext` around this call. The `_http` shim must throw rather than let the
		// request through — a request the daemon would serve as ITSELF, with full operator authority and
		// no issue confinement. This is the confused-deputy clause (AC-6.19(c)).
		const result = await client.callTool({
			name: 'CreateIssue',
			arguments: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', data: { title: 'x', provider: 'CLAUDE_CODE' } },
		})
		expect(result.isError).toBe(true)
		expect(JSON.stringify(result.content)).toContain('outside a run-token context')
		await client.close()
	})

	it('WITH a run-token context the shim gets past the guard and attempts the HTTP call', async () => {
		const client = await connectTo('issue-handling')
		// The mirror of the test above, and it is what stops that one from passing for the wrong reason:
		// if the shim threw unconditionally, "refuses without a context" would be green while the tool
		// was simply broken. Here the guard is satisfied, so the failure that surfaces is a TRANSPORT
		// one (no daemon is listening in a unit test), never the context guard.
		const result = await withMcpRunContext({ token: 'test-token' }, () =>
			client.callTool({
				name: 'CreateIssue',
				arguments: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae', data: { title: 'x', provider: 'CLAUDE_CODE' } },
			}),
		)
		expect(JSON.stringify(result.content)).not.toContain('outside a run-token context')
		await client.close()
	})
})
