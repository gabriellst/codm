// Generic HTTP reverse-proxy utility — KERNEL-owned (hoisted from src/shared/utils, itself a
// deterministic port of the origin fork's packages/api/src/shared/utils/ForwardRequest.ts — the proxy
// spine behind the external context's ChannelProxy). Not coupled to the Go channel gateway
// specifically: callers pass `baseUrl`, `stripPrefix`, and optional extra headers per call.
// UPSTREAM CANDIDATE: this abort-propagating version supersedes the template's copy (see BUILD-LOG).
const HOP_BY_HOP_HEADERS = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection']

export interface ForwardRequestOptions {
	/** Base URL of the upstream service (e.g. `http://localhost:3032/api`). */
	baseUrl: string
	/** Original incoming request to forward. */
	request: Request
	/**
	 * Leading pathname prefix to strip before forwarding. The stripped portion is the api-ts
	 * routing prefix that the upstream service doesn't know about.
	 *
	 * Example: if the incoming path is `/external/channel/channels/resolve` and `stripPrefix`
	 * is `'/external/channel'`, the upstream receives `/channels/resolve`.
	 */
	stripPrefix: string
	/** Extra headers to inject on the forwarded request. */
	headers?: Record<string, string>
}

/**
 * Forwards a request to an upstream service, streaming both the request body and the response body
 * without buffering. Safe for large payloads, file uploads, and long-lived SSE connections.
 *
 * - Hop-by-hop headers are stripped in both directions per RFC 7230 §6.1.
 * - `Host` is rewritten to the upstream's host for virtual-host routing.
 * - Query string is forwarded verbatim.
 * - Redirect responses from the upstream are returned as-is (`redirect: 'manual'`) so the caller
 *   can handle them.
 * - The client's abort is propagated via `signal` — MANDATORY: without it, each proxied SSE
 *   (`/events`) becomes a zombie upstream connection when the browser disconnects, until the
 *   runtime's fetch pool is exhausted and EVERY proxied request hangs.
 */
export async function forwardRequest({ baseUrl, request, stripPrefix, headers: extraHeaders }: ForwardRequestOptions): Promise<Response> {
	const url = new URL(request.url)

	const prefixIndex = url.pathname.indexOf(stripPrefix)
	const upstreamPath = prefixIndex !== -1 ? url.pathname.slice(prefixIndex + stripPrefix.length) : url.pathname
	const upstreamUrl = `${baseUrl}${upstreamPath}${url.search}`

	const headers = new Headers(request.headers)

	if (extraHeaders) {
		for (const [key, value] of Object.entries(extraHeaders)) {
			headers.set(key, value)
		}
	}

	for (const hop of HOP_BY_HOP_HEADERS) {
		headers.delete(hop)
	}

	const upstream = new URL(baseUrl)
	headers.set('Host', upstream.host)

	const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

	// `duplex: 'half'` is required by the fetch spec whenever a request body is a stream — it keeps
	// the forward unbuffered (request bytes flow upstream as they arrive). Bun's RequestInit typings
	// don't declare the field yet (the runtime honors it), hence the local widening.
	const init: RequestInit & { duplex?: 'half' } = {
		method: request.method,
		headers,
		body: hasBody ? request.body : undefined,
		duplex: hasBody ? 'half' : undefined,
		redirect: 'manual',
		// Propagate the client's abort (see docblock) — kills the upstream fetch the moment the
		// browser disconnects instead of leaking a zombie connection per proxied SSE.
		signal: request.signal,
	}

	const response = await fetch(upstreamUrl, init)

	const responseHeaders = new Headers(response.headers)
	for (const hop of HOP_BY_HOP_HEADERS) {
		responseHeaders.delete(hop)
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	})
}
