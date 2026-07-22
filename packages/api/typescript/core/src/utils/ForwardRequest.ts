const HOP_BY_HOP_HEADERS = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection']

export interface ForwardRequestOptions {
	/** Base URL of the upstream service (e.g. `http://localhost:3031`). */
	baseUrl: string
	/** Original incoming request to forward. */
	request: Request
	/**
	 * Number of leading pathname segments to strip before forwarding.
	 * The stripped portion is the TS API routing prefix that the upstream
	 * service doesn't know about.
	 *
	 * Example: if the incoming path is `/v1/external/channel/channels`
	 * and `stripPrefix` is `'/v1/external'`, the upstream receives
	 * `/channel/channels`.
	 */
	stripPrefix: string
	/** Extra headers to inject on the forwarded request. */
	headers?: Record<string, string>
}

/**
 * Generic HTTP reverse-proxy utility. Forwards a request to an upstream
 * service, streaming both the request body and the response body without
 * buffering. Safe for large payloads, file uploads, and long-lived SSE
 * connections.
 *
 * - Hop-by-hop headers are stripped in both directions per RFC 7230 §6.1.
 * - `Host` is rewritten to the upstream's host for virtual-host routing.
 * - Query string is forwarded verbatim.
 * - Redirect responses from the upstream are returned as-is (`redirect:
 *   'manual'`) so the caller can handle them.
 *
 * Reusable across any upstream service — not coupled to the Go channel
 * backend specifically. Callers pass the `baseUrl`, `stripPrefix`, and
 * optional extra headers per call.
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

	const response = await fetch(upstreamUrl, {
		method: request.method,
		headers,
		body: hasBody ? request.body : undefined,
		duplex: hasBody ? 'half' : undefined,
		redirect: 'manual',
	})

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
