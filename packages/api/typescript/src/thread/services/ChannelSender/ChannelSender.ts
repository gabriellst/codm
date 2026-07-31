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

/** Which conversation a cue is aimed at — the two coordinates every gateway write is scoped by. */
export interface ChannelConversation {
	channelId: string
	/** The conversation — a contact JID or a group JID. */
	remoteId: string
}

/** What the gateway needs to hang a reaction off one already-delivered message. */
export interface ReactToChannelMessageInput extends ChannelConversation {
	/** The PLATFORM id of the message being reacted to (the wamid the inbound event carried). */
	messageId: string
	/**
	 * Whether the target message is one THIS account sent. WhatsApp addresses a reaction by the full
	 * message KEY (remote + fromMe + id), not by the id alone, so a wrong `fromMe` targets nothing.
	 */
	fromMe: boolean
	/**
	 * The emoji. One reaction per sender per message, REPLACED on resend — which is what makes the
	 * cue's lifecycle free (spec decision 11): swapping `👀` for a later signal costs one more call,
	 * not a removal plus an add. An EMPTY string is the platform's "remove my reaction".
	 */
	reaction: string
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
 *
 * ### The three verbs, and why the cues are verbs here rather than flags on `send`
 * `send` delivers WORDS; `react` and `signalTyping` deliver SIGNALS ABOUT words that do not exist
 * yet (streaming spec, decision 10). They are separate gateway endpoints, they carry no transcript
 * consequence, and — decisively — they are BEST-EFFORT while `send` is not: a failed send is retried
 * and eventually dead-lettered, a failed cue is swallowed. Folding them into `send` would put those
 * two failure policies behind one call.
 */
export abstract class ChannelSender {
	/** @returns the platform message id the channel assigned — the handle for quoting and for dedup. */
	abstract send(input: SendChannelMessageInput, ownerId: string): Promise<{ messageId: string }>

	/**
	 * Hang an emoji off a message that is already on the channel.
	 *
	 * The instant cue: it depends on no generation at all, so it lands in ~0s where the first token of
	 * a reply costs 1-2s. Callers treat a failure as nothing happened — see `ReactToChannelMessage`.
	 */
	abstract react(input: ReactToChannelMessageInput, ownerId: string): Promise<void>

	/**
	 * Publish ONE beat of the platform's native "typing…" indicator.
	 *
	 * Deliberately not `startTyping`/`stopTyping`: the platform indicator is a DECAYING signal, not a
	 * latch. It expires on its own in the order of ten seconds, so "keep typing" means calling this
	 * again, and "stop typing" means *not* calling it again. Modelling it as a latch would invent an
	 * off-switch the wire does not have — and an off-switch that a crash can skip is exactly how a
	 * contact ends up staring at a permanent "digitando…". `SustainTypingPresence` owns the cadence.
	 */
	abstract signalTyping(input: ChannelConversation, ownerId: string): Promise<void>
}
