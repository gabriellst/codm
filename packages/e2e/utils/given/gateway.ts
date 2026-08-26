import type { ApiSession } from './api'

/**
 * Test-only gateway ingress helpers — the spec-side counterpart of the daemon's `/_test/gateway`
 * controller (mounted only under CODM_ENV=e2e). The harness boots ONLY the TS daemon; the Go Channel
 * Gateway is simulated at the integration-event seam by these two calls. Not part of the generated
 * SDK, so they go through the operator client's raw request (it adds the Origin header + base URL).
 */

/** Seed a CONNECTED channel row (the Go-owned `gateway.channels` read table has no TS writer). */
export async function seedConnectedChannel(session: ApiSession, opts: { platform?: string; accountDetail?: string } = {}): Promise<string> {
	const res = await session.client<{ ok: boolean; channelId: string }>({
		method: 'POST',
		url: '/_test/gateway',
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
		/** Simulate this account's OWN echo — see `TestIngressController`'s `fromMe` field doc. */
		fromMe?: boolean
	},
): Promise<string> {
	const res = await session.client<{ ok: boolean; messageId: string }>({
		method: 'POST',
		url: '/_test/gateway',
		data: { kind: 'inbound-message', ...input },
	})
	return res.data.messageId
}

/** One `send()` or `edit()` this conversation saw on the in-process `MockChannelSender` double. */
export interface ChannelSenderMessage {
	messageId: string
	text: string
}

/**
 * One `sendMedia()` this conversation saw — the "envio de artefatos pelo canal" design's own
 * assertion surface (AC-7). `mediaPath` is the STAGED copy `MediaStore.stage()` produced, under the
 * shared media dir — a real gateway would have re-derived and checked this same path
 * (`MEDIA_PATH_NOT_ALLOWED` otherwise); this harness has no Go process behind it to do that check, so
 * observing the path landed here is the closest equivalent this environment can assert.
 */
export interface ChannelSenderMedia {
	messageId: string
	kind: string
	mediaPath: string
	caption?: string
	fileName?: string
}

/** What `thread/controllers/TestReadChannelSender` hands back for one conversation. */
export interface ChannelSenderSnapshot {
	sent: ChannelSenderMessage[]
	edits: ChannelSenderMessage[]
	typingBeatCount: number
	sentMedia: ChannelSenderMedia[]
}

/**
 * Read-only peek at the in-process `ChannelSender` double, scoped to one conversation
 * (thinking-indicator spec, T5; `sentMedia` added for "envio de artefatos pelo canal", T7) — the
 * counterpart of the two write seams above.
 *
 * `ChannelSender` resolves to `MockChannelSender` under `e2e` (`thread/registry.ts`), so the daemon's
 * `send`/`edit`/`signalTyping`/`sendMedia` calls stay IN-PROCESS and never reach the Go gateway's
 * `overlay.go` scenario — this harness boots ONLY the TS daemon (see this file's own docblock), so
 * there is no Go process to observe a `sendImage` call on at all. This is the door onto that same
 * singleton instance, mounted only under `CODM_ENV=e2e` (`thread/controllers/TestReadChannelSender.ts`).
 */
export async function readChannelSender(
	session: ApiSession,
	opts: { channelId: string; remoteId: string },
): Promise<ChannelSenderSnapshot> {
	const res = await session.client<ChannelSenderSnapshot>({
		method: 'GET',
		url: '/_test/channel-sender',
		params: { channelId: opts.channelId, remoteId: opts.remoteId },
	})
	return res.data
}
