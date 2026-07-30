import { z } from 'zod'
import { Controller } from './Controller'
import type { HttpMethod, MimeTypes as MimeTypesType } from './Http'
import { MimeTypes } from './Http'
import type { AgentIdentity } from './AgentIdentity'
import { readAgentRunToken } from './AgentIdentity'
import { AgentIdentityService } from '../services/AgentIdentityService'

export const McpAdapterInputSchema = z.object({ params: z.object({ scope: z.string() }) })
export const McpAdapterOutputSchema = z.any()

/** Why the adapter refused — the product supplies the vocabulary, core supplies the taxonomy. */
export type McpRefusal = 'unknown-scope' | 'invalid-token' | 'scope-mismatch'

/**
 * THE MCP DOOR, as a template method (B2, spec decision 5/6).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT CORE OWNS: the AUTHORIZATION SHAPE of a JSON-RPC tool endpoint — parse the surface out of the
 * path, resolve the credential, and check that the credential was issued FOR THAT SURFACE. Three
 * steps, no transport, no MCP SDK. `@modelcontextprotocol/sdk` is a dependency of the api package and
 * deliberately not of core, so everything that touches a server or a transport is `abstract` and the
 * product supplies it.
 *
 * ### THE SCOPE MATCH IS THE ONLY CHECK LEFT HERE, AND IT COULD NOT MOVE
 * Every other identity check migrated to `AgentIdentityMiddleware`, which runs at the destination
 * controller. This one cannot, and the reason is mechanical rather than aesthetic: `tools/list` is
 * answered by the MCP SDK itself, from the generated server, with NO round trip back to any HTTP
 * controller. A per-controller middleware structurally never sees it. So this is the only point where
 * "was this credential issued for THIS surface" can be asked of EVERY JSON-RPC message rather than
 * only of the ones that reach a controller — and without it an `issue-handling` token both enumerates
 * and calls the `system` surface, whose operations are account administration.
 *
 * ### NO `OperatorMiddleware`, AND THE OMISSION IS THE DESIGN
 * It would stamp the daemon's own operator identity onto every call unconditionally — the
 * confused-deputy shape this whole file exists to prevent. Authority here comes from the run token and
 * from nothing else.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export abstract class McpAdapter extends Controller<typeof McpAdapterInputSchema, typeof McpAdapterOutputSchema> {
	readonly method: HttpMethod[] = ['post', 'get', 'delete']
	readonly inputSchema = McpAdapterInputSchema
	readonly outputSchema = McpAdapterOutputSchema
	override readonly contentType: MimeTypesType = MimeTypes['.stream']
	override middlewares = []

	constructor(protected readonly identities: AgentIdentityService) {
		super()
	}

	/** The surfaces this product declares. A path segment outside it is refused, never guessed at. */
	protected abstract readonly scopes: readonly string[]

	/**
	 * Hand the request to the generated server for `scope` — the ONE abstract step, and the only one
	 * that touches an MCP transport. The identity is passed so the implementation can establish
	 * whatever ambient context its generated handlers read; it has already been authorized.
	 */
	protected abstract serve(scope: string, token: string, request: Request): Promise<Response>

	/**
	 * Raise the product's OWN error for a refusal. Core has no vocabulary for "this run token is dead"
	 * — that code, its HTTP status and its i18n key belong to the context that owns agent runs.
	 */
	protected abstract refuse(reason: McpRefusal, detail: string): never

	async handle(request: this['input']): Promise<this['output']> {
		// A surface that was never declared is not a typo to be guessed at: answering it with another
		// surface's tools would be exactly the accidental exposure the allowlist exists to prevent.
		const scope = this.scopes.find(name => name === request.params.scope)
		if (!scope) this.refuse('unknown-scope', `unknown MCP scope '${request.params.scope}'`)

		// `forEach` rather than spreading the `Headers` or reading `.entries()`: this workspace compiles
		// against `lib: ES2022` with no DOM, and the ambient `Headers` it resolves declares neither
		// `[Symbol.iterator]` nor `entries()` (both are tsc errors here; `toJSON()` typechecks but is
		// Bun-only, and the daemon ships as a NODE bundle — it would resolve green and die at runtime).
		// `forEach` is the one spelling that is both standard and typed.
		const headers: Record<string, string> = {}
		request.raw.headers.forEach((value, key) => {
			headers[key] = value
		})
		const token = readAgentRunToken(headers)
		const identity: AgentIdentity | null = token ? this.identities.resolve(token) : null
		if (!identity) this.refuse('invalid-token', 'missing, unknown, expired or revoked run token')

		// AUTHORIZATION, not authentication. A valid token proves WHICH RUN is calling; it must also
		// prove which SURFACE that run was granted. The token rides on the child CLI's argv, which the
		// model can read, so enforcing the surface only through `--allowedTools` puts the boundary on
		// the attacker's side of the wire.
		if (identity.scope !== scope) {
			this.refuse(
				'scope-mismatch',
				`this credential was issued for the '${identity.scope}' tool surface and cannot be used against '${scope}'`,
			)
		}

		return this.rawResponse(await this.serve(scope, token, request.raw))
	}
}
