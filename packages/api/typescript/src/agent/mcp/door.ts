import { injectable } from 'tsyringe-neo'
import { Config, McpAdapter, BaseError, AgentIdentityService, type McpRefusal } from '@codedm/core-typescript'
import { withMcpRunContext } from '@codedm/client-typescript/typescript/mcp/context'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import type { AgentInterfaceErrors } from '../errors'

import { MCP_ROUTE_PREFIX } from './route'

export { MCP_ROUTE_PREFIX }

/**
 * THE PRODUCT'S MCP DOOR — everything `McpAdapter` left abstract, and nothing else.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * IT IS A REAL ROUTE THAT IS DELIBERATELY NOT IN THE SPEC
 * Mounted only when `EMIT_OPENAPI !== 'true'` (see `agent/index.ts`), exactly like `ChannelProxy` and
 * `TestIngressController`. A JSON-RPC tool endpoint rendered into the SDK would become React Query
 * hooks with no consumer — noise in the surface the console imports. "Not emitted" is not "not
 * mounted", which is why AC-6.8(d) pairs the grep with an actual `initialize` round trip.
 *
 * THE TOOLS ARE GENERATED, SO THIS FILE REGISTERS NOTHING
 * `getServer()` comes from `@kubb/plugin-mcp` output, built from the same OpenAPI that builds the SDK.
 * There is no hand-written tool, no hand-written tool schema, and no second mechanism: a tool IS a
 * controller, reached over HTTP, dispatching a use case (AC-6.18). The generated stdio bootstrap
 * function is deliberately unused — it hardcodes a stdio transport; we bind the transport ourselves.
 * (Its NAME is deliberately not written anywhere under `src/`: AC-6.16(e) greps for exactly that
 * string and a comment mentioning it is indistinguishable from a call site to a grep.)
 *
 * WHAT SHRANK. This file used to be ~270 lines and carried, besides the three below, a generic
 * identity walk over the JSON-RPC body against a hardcoded list of three key names. That walk is
 * `AgentIdentityMiddleware` now, at the destination controller, comparing the keys the identity
 * actually carries. What remains here is the part that could not move, because `tools/list` never
 * reaches a controller.
 *
 * AUTHORIZATION IS PER CALL, NOT PER RUN
 * Every request carries the opaque run token, and `McpAdapter.handle` resolves it on every message.
 * `resolve` is a map lookup that fails closed on unknown, expired and revoked, so a late tool call
 * from a run that already died gets 401 and writes nothing — the property §4.11 promises when a run is
 * cancelled.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 */
@injectable()
export class McpDoorController extends McpAdapter {
	readonly path = `${MCP_ROUTE_PREFIX}/:scope` as const
	readonly description = 'CodeDM MCP server (JSON-RPC) — not emitted to the OpenAPI/SDK'

	protected readonly scopes: readonly string[] = Object.values(McpScope)

	/**
	 * NOT a useless constructor, and the suppression below is load-bearing rather than cosmetic.
	 *
	 * MEASURED: with this constructor removed — which `biome check --write --unsafe` did on its own
	 * during pre-commit, since `noUselessConstructor` is an UNSAFE autofix that applies even though the
	 * rule never reports at error level — `container.resolve(McpDoorController)` returns an instance
	 * whose `identities` is `undefined`. tsyringe reads `design:paramtypes`, TypeScript emits that
	 * metadata only for a class that DECLARES a constructor, and `@injectable()` on a subclass without
	 * one records a zero-argument signature. Every tool call would then die on
	 * `this.identities.resolve(...)`, IN PRODUCTION ONLY: every test builds this door with `new`, and
	 * the door sits deliberately outside the controllers barrel, so no rail constructs it through the
	 * container. Same silent shape as the defaulted-parameter defect that
	 * `tests/architecture/real-di-resolution.test.ts` was written for.
	 *
	 * It also narrows the service's generic to this product's identity, which is what makes `resolve()`
	 * hand back an `AgentRunIdentity` rather than the bare core format.
	 */
	// biome-ignore lint/complexity/noUselessConstructor: carries design:paramtypes for tsyringe — see above
	constructor(identities: AgentIdentityService<AgentRunIdentity>) {
		super(identities)
	}

	/** 401 for a credential that is absent or dead, 403 for one aimed at the wrong surface. */
	protected refuse(reason: McpRefusal, detail: string): never {
		if (reason === 'scope-mismatch') throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', detail)
		throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', detail)
	}

	protected async serve(scope: string, token: string, request: Request): Promise<Response> {
		const transport = await this.buildTransport(scope)
		// The context the generated `_http.ts` shims read to address AND authenticate their outbound
		// call. Established AROUND the whole dispatch, so it covers every async continuation the
		// transport spawns — a per-tool wrapper would miss the ones the SDK schedules itself.
		//
		// The origin is THIS daemon: a tool is the loopback face of a controller we are already serving,
		// so the request has exactly one correct destination and it is the process holding this stack
		// frame. Carrying it per-call rather than configuring the SDK client globally keeps the api's
		// standing rule intact (the api does not use the SDK's HTTP client) and keeps the value a
		// runtime fact instead of a literal frozen into every generated call site (AC-6.19(b)).
		const baseUrl = `http://127.0.0.1:${Config.env.API_PORT}`
		return withMcpRunContext({ token, baseUrl }, () => transport.handleRequest(request))
	}

	/**
	 * A FRESH server + transport for EVERY request. Not an oversight and not a cache waiting to happen.
	 *
	 * ### Measured: the alternative throws
	 * An earlier revision memoized one transport per scope and was killed on the first real tool call
	 * with `Error: Stateless transport cannot be reused across requests. Create a new transport per
	 * request.` — thrown by the SDK's own `handleRequest` guard, surfacing as a 500 that reached the
	 * agent as an opaque `Streamable HTTP error`. Stateless mode (`sessionIdGenerator: undefined`) is
	 * a deliberate choice here — an agent CLI spawns per turn and never resumes an MCP session, so
	 * session bookkeeping would be a table nothing reads and one more thing to leak when a run is
	 * killed — and per-request construction is the shape that mode REQUIRES.
	 *
	 * The server has to be fresh too: `connect()` binds a `Server` to exactly one transport, so
	 * reusing one across concurrent requests would have two in-flight calls overwriting each other's
	 * reply channel. Re-registering ~29 tools per call is plain object construction against schemas
	 * that are already resident — the cost is not on the same scale as the correctness.
	 *
	 * ### `protected`, and the visibility is load-bearing
	 * AC-6.6 requires "no write happened" to be proved by COUNTING rows and outbox events across a
	 * rejected call — not by the absence of an exception, and not by reading the code and observing
	 * that the reject returns early. Counting needs a dispatch that WOULD have written, so a test
	 * substitutes a transport that performs the real write through the real use case: the concordant
	 * call moves every counter, the rejected one moves none, and the asymmetry is the measurement.
	 * A `private` method would leave that claim argued in a comment, which is what this AC forbids.
	 */
	protected async buildTransport(scope: string): Promise<WebStandardStreamableHTTPServerTransport> {
		const server = await loadGeneratedServer(scope as McpScope)
		const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
		await server.connect(transport)
		return transport
	}
}

/**
 * The generated per-scope servers, one STATIC specifier each.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY NOT ONE TEMPLATE-LITERAL IMPORT, which is what this was. MEASURED: the daemon ships as a Node
 * bundle (`scripts/build.ts` → `dist/server.js`, which is what the Playwright harness and the Docker
 * image both boot), and a bundler cannot resolve `import(\`…/mcp/scopes/${scope}/server\`)` — the specifier
 * survives into the output verbatim and is resolved by Node AT RUNTIME, from `dist/`, against a
 * workspace package whose export map points at TypeScript SOURCE. The literal failure:
 *
 *     ERR_UNSUPPORTED_DIR_IMPORT — Directory import '…/client/dist/typescript/src/http' is not
 *     supported resolving ES modules imported from '…/mcp/scopes/issue-handling/_http.ts'
 *
 * So `getServer()` could never load in the artifact we ship, and every tool call would have failed
 * with a 500 the moment a real agent made one. `bun test` hid it completely: it resolves TypeScript
 * and directory imports natively, so the in-memory MCP smoke was green against a path production
 * cannot take. This is the SAME lesson as AC-6.16's extensionless-import defect, one layer out —
 * "it loads under the test runner" is not evidence that it loads.
 *
 * A `Record<McpScope, …>` rather than a lookup by string: adding a member to the `McpScope` enum breaks
 * THIS FILE at `tsc` until its module is named, which is the only way a bundler-visible list can be kept
 * honest. The specifiers are static, so the generated servers are compiled INTO the bundle and no
 * resolution happens at runtime at all.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
const GENERATED_SERVERS: Record<McpScope, () => Promise<{ getServer: () => McpServer }>> = {
	'issue-handling': () => import('@codedm/client-typescript/typescript/mcp/scopes/issue-handling/server'),
	orchestration: () => import('@codedm/client-typescript/typescript/mcp/scopes/orchestration/server'),
	system: () => import('@codedm/client-typescript/typescript/mcp/scopes/system/server'),
}

/**
 * Load the generated server for a scope. Isolated in a function so a test can assert the emitted
 * module actually LOADS — `tsc` resolving it proves nothing about runtime, which is the whole lesson
 * of AC-6.16 (the generator emits extensionless `@modelcontextprotocol/sdk/server/mcp` imports that
 * typecheck and then fail to resolve at runtime; our generator rewrites them, and only a runtime smoke
 * can tell you it worked).
 */
export async function loadGeneratedServer(scope: McpScope): Promise<McpServer> {
	const module = await GENERATED_SERVERS[scope]()
	return module.getServer()
}
