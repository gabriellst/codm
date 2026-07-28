/** What the gateway needs to put one message on the channel, plus the id it hands back. */
export interface SendChannelMessageInput {
	channelId: string
	/** The conversation — a contact JID or a group JID. */
	remoteId: string
	text: string
	/**
	 * The PLATFORM id of the message this one replies to, when it is a reply.
	 *
	 * The gateway turns it into a real WhatsApp quote (`waE2E.ContextInfo{StanzaID}`), which is worth
	 * more than presentation: our own inbound path resolves a quote back to the entry that produced it,
	 * so quoting the message that opened an issue lets a human's reply route to that issue with no
	 * model call at all.
	 */
	quotedMessageId?: string
}

/**
 * BC4 → BC1 WRITE seam: put a message on the channel.
 *
 * The counterpart of `ChannelConnectivity`/`GroupMemberReader`, which READ the gateway's tables. A
 * write cannot be a table read, so this one crosses the process boundary — which the S2S rule permits
 * between SERVICES (api-ts ↔ the Go gateway) precisely because there is no cycle: the gateway's SDK
 * is generated from the gateway's own openapi.
 *
 * ABSTRACT ON PURPOSE, and bound per env: this is the one seam in the thread context that opens a
 * socket, so `mock`/`integration` bind a double and no test can depend on the gateway being up.
 */
export abstract class ChannelSender {
	/** @returns the platform message id the channel assigned — the handle for quoting and for dedup. */
	abstract send(input: SendChannelMessageInput, ownerId: string): Promise<{ messageId: string }>
}
