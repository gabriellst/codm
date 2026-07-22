import type { ApiSession } from './api'

/**
 * Test-only gateway ingress helpers — the spec-side counterpart of the daemon's `/v1/_test/gateway`
 * controller (mounted only under CODEDM_E2E). The harness boots ONLY the TS daemon; the Go Channel
 * Gateway is simulated at the integration-event seam by these two calls. Not part of the generated
 * SDK, so they go through the operator client's raw request (it adds the Origin header + base URL).
 */

/** Seed a CONNECTED channel row (the Go-owned `gateway.channels` read table has no TS writer). */
export async function seedConnectedChannel(
	session: ApiSession,
	opts: { platform?: string; accountDetail?: string } = {},
): Promise<string> {
	const res = await session.client<{ ok: boolean; channelId: string }>({
		method: 'POST',
		url: '/v1/_test/gateway',
		data: { kind: 'channel-connected', ...opts },
	})
	return res.data.channelId
}

/** Publish a normalized inbound `channel_message.received` into the in-process mediator. */
export async function injectInboundMessage(
	session: ApiSession,
	input: {
		channelId: string
		contactExternalId: string
		text: string
		senderExternalId?: string
		messageId?: string
		contactDisplayName?: string
	},
): Promise<string> {
	const res = await session.client<{ ok: boolean; messageId: string }>({
		method: 'POST',
		url: '/v1/_test/gateway',
		data: { kind: 'inbound-message', ...input },
	})
	return res.data.messageId
}
