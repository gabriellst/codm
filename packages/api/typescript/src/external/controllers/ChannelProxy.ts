import { injectable } from 'tsyringe-neo'
import { Controller, MimeTypes, z, BaseError } from '@codedm/core-typescript'
import type { HttpMethod } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { forwardToChannel } from '../utils/forwardToChannel'
import type { ApplicationErrors } from '../errors'

const ChannelProxyInputSchema = z.object({
	ctx: z.object({ ownerId: z.uuid() }),
})

const ChannelProxyOutputSchema = z.any()

/**
 * Catch-all reverse proxy — forwards every request under `/v1/external/channel/**` to the Go
 * channel gateway (medscall's `external` ChannelProxy pattern, founder-ratified 22-jul). The
 * browser NEVER talks to the gateway directly: the gateway SDK (`@codedm/client-typescript/go`)
 * is pointed at this route, so pairing (resolve → connect → QR), channel reads and the gateway
 * SSE `/events` stream all ride the api-ts origin — no gateway CORS, no identity in the browser.
 *
 * Identity: `OperatorMiddleware` stamps the constant operator session on `ctx`; the proxy injects
 * it upstream as `X-Owner-Id` (the header every owner-scoped gateway controller binds). The Go
 * service needs no auth of its own on this hop.
 *
 * Streaming: `forwardRequest` pipes bodies unbuffered (`duplex: 'half'`) and propagates the
 * client's abort via `signal` — without that, every proxied SSE leaks a zombie upstream
 * connection. `contentType = MimeTypes['.stream']` marks the endpoint long-lived (the SSE
 * convention ListenEvents also uses; on Bun-served stacks it disables the per-request timeout).
 *
 * Failure: a dead gateway (connection refused / socket error) surfaces as the typed
 * {@link ApplicationErrors} `GATEWAY_UNAVAILABLE` (502) — the console translates it via
 * `errors.GATEWAY_UNAVAILABLE`, never a 500 soup. Upstream HTTP errors (4xx/5xx responses) pass
 * through verbatim: the gateway already speaks `{ code, message }`.
 *
 * OpenAPI/SDK: this wildcard is deliberately NOT emitted — the external context mounts zero
 * controllers under EMIT_OPENAPI (see external/index.ts), so the SDK keeps only the real,
 * per-operation gateway surface generated from the Go spec.
 */
@injectable()
export class ChannelProxy extends Controller<typeof ChannelProxyInputSchema, typeof ChannelProxyOutputSchema> {
	readonly path = '/external/channel/*' as const
	readonly method: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch']
	readonly description = 'Channel gateway proxy (browser-facing door to the Go service)'
	readonly inputSchema = ChannelProxyInputSchema
	readonly outputSchema = ChannelProxyOutputSchema
	override readonly contentType: MimeTypes = MimeTypes['.stream']

	override middlewares = [OperatorMiddleware]

	async handle(request: this['input']): Promise<this['output']> {
		const { ownerId } = request.ctx
		try {
			return this.rawResponse(await forwardToChannel(request.raw, ownerId))
		} catch (error) {
			// Client-initiated aborts (browser closed the SSE/navigated away) are not a gateway
			// failure — rethrow so the transport just drops the connection.
			if (error instanceof DOMException && error.name === 'AbortError') throw error
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', 'the channel gateway is unreachable')
		}
	}
}
