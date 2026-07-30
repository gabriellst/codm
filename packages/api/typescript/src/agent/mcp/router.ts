import { injectable } from 'tsyringe-neo'
import { Config, Controller, HttpStatusCode, MimeTypes, z, BaseError } from '@codedm/core-typescript'
import type { HttpMethod } from '@codedm/core-typescript'
import { withMcpRunContext, MCP_RUN_TOKEN_HEADER } from '@codedm/client-typescript/typescript/mcp/context'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AgentIdentityService } from '@codedm/core-typescript'
import type { AgentRunIdentity } from '../types/AgentRunIdentity'
import { MCP_SCOPE_NAMES, type McpScope } from './manifest'
import { assertIdentityMatches } from './identity'
import type { AgentInterfaceErrors } from '../errors'

import { MCP_ROUTE_PREFIX } from './route'

export { MCP_ROUTE_PREFIX }

const McpRouterInputSchema = z.object({ params: z.object({ scope: z.string() }) })
const McpRouterOutputSchema = z.any()

/** JSON-RPC 2.0 error codes we produce ourselves, before the transport ever sees the message. */
const JSONRPC_INVALID_PARAMS = -32602

/**
 * THE MCP DOOR — the JSON-RPC endpoint an agent CLI talks to, and the place the mandatory identity
 * mitigation lives (GOAL-agent-abstraction §4.4, AC-6.6/AC-6.12/AC-6.16).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
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
 * AUTHORIZATION IS PER CALL, NOT PER RUN
 * Every request carries the opaque run token. `resolve` is a map lookup that fails closed on unknown,
 * expired and revoked, so a late tool call from a run that already died gets 401 and writes nothing —
 * the property §4.11 promises when a run is cancelled.
 *
 * IDENTITY IS CHECKED BEFORE THE TRANSPORT DISPATCHES, WHICH IS WHY "NO WRITE HAPPENED" IS PROVABLE
 * The message is parsed here, and a `tools/call` has its arguments walked against the identity BEFORE
 * `handleRequest` runs. Doing it inside a tool wrapper would be too late in a measurable way: the MCP
 * SDK validates `outputSchema` AFTER the handler returns, and the probe caught a rejected call whose
 * HTTP write had already been issued. Rejecting here means the outbound request is never built.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
@injectable()
export class McpRouterController extends Controller<typeof McpRouterInputSchema, typeof McpRouterOutputSchema> {
	readonly path = `${MCP_ROUTE_PREFIX}/:scope` as const
	readonly method: HttpMethod[] = ['post', 'get', 'delete']
	readonly description = 'CodeDM MCP server (JSON-RPC) — not emitted to the OpenAPI/SDK'
	readonly inputSchema = McpRouterInputSchema
	readonly outputSchema = McpRouterOutputSchema
	override readonly contentType: MimeTypes = MimeTypes['.stream']

	// NO middlewares. `OperatorMiddleware` would stamp the daemon's own operator identity onto every
	// call unconditionally — the confused-deputy shape this whole file exists to prevent. Authority
	// here comes from the run token and from nothing else.
	override middlewares = []

	constructor(private readonly identities: AgentIdentityService<AgentRunIdentity>) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const scope = this.resolveScope(request.params.scope)
		const raw = request.raw
		const token = this.readToken(raw)
		const identity = this.identities.resolve(token)
		if (!identity) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', 'missing, unknown, expired or revoked run token')
		}

		// AUTHORIZATION, not authentication — and it is the half that was MISSING when this file first
		// shipped (contract defect D6-8). A valid token proves WHICH RUN is calling; it must also prove
		// which SURFACE that run was granted. Before the claim existed, an `issue-handling` token
		// authenticated a `tools/call` against `/mcp/system` and its twenty-three operations — owner and
		// workspace administration included — none of which carry an identity key for the walk below to
		// compare, so nothing downstream would have objected. The token rides on the child CLI's argv,
		// which the model can read; enforcing the scope only through `--allowedTools` puts the boundary
		// on the attacker's side of the wire.
		if (identity.scope !== scope) {
			throw new BaseError<AgentInterfaceErrors>(
				'AGENT_RUN_SCOPE_MISMATCH',
				`run token was issued for the '${identity.scope}' tool surface and cannot be used against '${scope}'`,
			)
		}

		// The body is consumed here to inspect it, so the transport is handed a fresh Request built
		// from the bytes we already read — a Request body is a one-shot stream and re-reading it would
		// hand the transport an empty message.
		const body = raw.method === 'POST' ? await raw.text() : ''
		const identityError = this.rejectMismatchedIdentity(body, identity)
		if (identityError) return this.rawResponse(identityError)

		const transport = await this.buildTransport(scope)
		const replay = new Request(raw.url, {
			method: raw.method,
			headers: raw.headers,
			...(body.length > 0 && { body }),
		})

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
		return this.rawResponse(await withMcpRunContext({ token, baseUrl }, () => transport.handleRequest(replay)))
	}

	/**
	 * A scope that is not in the manifest is not a typo to be guessed at — it is a request for a tool
	 * surface that was never declared, and answering it with the wrong scope's tools would be exactly
	 * the accidental exposure the allowlist exists to prevent.
	 */
	private resolveScope(candidate: string): McpScope {
		const scope = MCP_SCOPE_NAMES.find(name => name === candidate)
		if (!scope) throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_TOKEN_INVALID', `unknown MCP scope '${candidate}'`)
		return scope
	}

	/** `Authorization: Bearer <token>` or the dedicated header — CLIs differ on which they can set. */
	private readToken(raw: Request): string {
		const dedicated = raw.headers.get(MCP_RUN_TOKEN_HEADER)
		if (dedicated) return dedicated
		const authorization = raw.headers.get('authorization') ?? ''
		return authorization.toLowerCase().startsWith('bearer ') ? authorization.slice('bearer '.length).trim() : ''
	}

	/**
	 * Walk a `tools/call`'s arguments against the identity and, on disagreement, answer with a JSON-RPC
	 * error INSTEAD of dispatching. Returns `null` when there is nothing to reject.
	 *
	 * BOTH LAYERS CARRY THE REFUSAL: HTTP **403** (what AC-6.6(b) contracts, and what an access log,
	 * a proxy and a security review all read) with a JSON-RPC error object as the body (what an MCP
	 * client can actually render, keyed to the request id so a batch member is identifiable). An
	 * earlier revision answered 200 with only the JSON-RPC half, on the theory that a 403 reaches the
	 * model as an uninterpretable transport failure. That theory is not worth a silent deviation from
	 * a contract whose header says the phase does not close without it: the model is not the only
	 * reader, and the body still says exactly what happened.
	 *
	 * A message that does not parse is passed through untouched — the transport owns malformed-input
	 * handling, and duplicating its error vocabulary here would be a second source of truth for it.
	 */
	private rejectMismatchedIdentity(body: string, identity: AgentRunIdentity): Response | null {
		if (body.length === 0) return null
		let message: unknown
		try {
			message = JSON.parse(body)
		} catch {
			return null
		}

		for (const call of this.toolCallsIn(message)) {
			try {
				assertIdentityMatches(call.args, identity)
			} catch (error) {
				const detail = error instanceof BaseError ? error.message : String(error)
				return Response.json(
					{
						jsonrpc: '2.0',
						id: call.id ?? null,
						error: { code: JSONRPC_INVALID_PARAMS, message: `AGENT_RUN_SCOPE_MISMATCH: ${detail}` },
					},
					{ status: HttpStatusCode.FORBIDDEN },
				)
			}
		}
		return null
	}

	/** Every `tools/call` in the message — JSON-RPC allows a BATCH, and one bad member taints the batch. */
	private toolCallsIn(message: unknown): Array<{ id: unknown; args: unknown }> {
		const messages = Array.isArray(message) ? message : [message]
		const calls: Array<{ id: unknown; args: unknown }> = []
		for (const entry of messages) {
			if (!entry || typeof entry !== 'object') continue
			const record = entry as { method?: unknown; id?: unknown; params?: { arguments?: unknown } }
			if (record.method !== 'tools/call') continue
			calls.push({ id: record.id, args: record.params?.arguments })
		}
		return calls
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
	protected async buildTransport(scope: McpScope): Promise<WebStandardStreamableHTTPServerTransport> {
		const server = await loadGeneratedServer(scope)
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
 * A `Record<McpScope, …>` rather than a lookup by string: adding a scope to the manifest breaks THIS
 * FILE at `tsc` until its module is named, which is the only way a bundler-visible list can be kept
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
