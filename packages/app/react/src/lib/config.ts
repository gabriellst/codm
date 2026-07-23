const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3030'

export const Config = {
	baseUrl,
	/**
	 * Base URL for the GATEWAY SDK (`@codedm/client-typescript/go`) — the api-ts
	 * external/ChannelProxy wildcard, NOT the Go service itself. The browser never talks to the
	 * gateway (:3032): every gateway op (pairing resolve/connect, channel reads, the SSE `/events`
	 * stream) rides the api-ts origin, which strips this prefix, stamps the operator identity as
	 * `X-Owner-Id` and forwards to `${API_GO_URL}/api` server-side (medscall pattern — their
	 * `channelBaseUrl = ${VITE_API_URL}/external/channel`). No VITE_GATEWAY_URL exists on purpose.
	 */
	gatewayBaseUrl: `${baseUrl}/v1/external/channel`,
} as const
