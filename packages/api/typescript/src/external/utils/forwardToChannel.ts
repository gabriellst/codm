import { Config, forwardRequest } from '@codm/core-typescript'

/**
 * Forward a request to the Go channel gateway, injecting the operator identity as `X-Owner-Id`.
 *
 * Thin wrapper around the generic `forwardRequest` utility — strips the api-ts routing prefix
 * (`/external/channel`) so the gateway receives its native path, and prepends the gateway's
 * own `/api` mount (its HttpRouter serves every controller under `/api/{context}{path}` and the
 * SSE broadcaster under `/api/events`; the Go OpenAPI spec omits that mount — the base URL
 * carries it, exactly like the origin channel convention).
 *
 *   browser  GET {api-ts}/external/channel/channel/channels/resolve
 *   gateway  GET {API_GO_URL}/api/channel/channels/resolve
 *
 *   browser  GET {api-ts}/external/channel/events            (SSE)
 *   gateway  GET {API_GO_URL}/api/events
 *
 * No apikey is attached: the gateway's APIKey middleware only engages when CHANNEL_GLOBAL_API_KEY
 * is set, and proxied deployments leave it empty — auth lives on THIS hop (CloudSessionMiddleware),
 * mirroring the origin fork where the TS proxy is the only authenticated door to the Go service.
 */
export function forwardToChannel(request: Request, ownerId: string): Promise<Response> {
	return forwardRequest({
		baseUrl: `${Config.env.API_GO_URL}/api`,
		request,
		stripPrefix: '/external/channel',
		headers: { 'X-Owner-Id': ownerId },
	})
}
