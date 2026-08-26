import type { ArtifactKind } from '@codm/contracts-typescript/wire/enums'

/**
 * Which `ArtifactKind`s can go out as native channel media — every one EXCEPT `LINK`.
 *
 * `LINK` has no local bytes (`ref` is a URL, not a path — `Artifact.ts`), so it is never a candidate
 * for `sendMedia`: the "envio de artefatos pelo canal" design routes it through the existing
 * `deliver_channel_message` text path instead (decision 5). Modelled as `Exclude` rather than a
 * hand-rolled union so the two lists cannot drift the day a sixth `ArtifactKind` is added.
 */
export type SendableArtifactKind = Exclude<ArtifactKind, ArtifactKind.LINK>

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
 * What the gateway needs to put one piece of media on the channel as a native message — the send
 * counterpart of `SendChannelMessageInput`, for the "envio de artefatos pelo canal" design.
 *
 * `mediaPath` is a LOCAL FILE PATH, not a URL: the caller (`SendArtifact`) stages the artifact under
 * the same content-addressed media dir the gateway already owns for INBOUND downloads (decision 3),
 * and the gateway accepts it only when it canonicalizes under that dir (`MEDIA_PATH_NOT_ALLOWED`
 * otherwise) — symmetric with how an inbound `mediaPath` never leaves that directory either.
 */
export interface SendChannelMediaInput extends ChannelConversation {
	kind: SendableArtifactKind
	mediaPath: string
	caption?: string
	/** FILE only — the name WhatsApp shows for the document (decision 6: basename of `ref`). */
	fileName?: string
	/** FILE only — resolved by extension (decision 6), mirroring `GetArtifactContent`. */
	mimeType?: string
}

/** What the gateway needs to replace the text of a message already on the channel. */
export interface EditChannelMessageInput extends ChannelConversation {
	/** The PLATFORM id the original `send` handed back — the only handle an edit can address. */
	messageId: string
	/**
	 * The text the message should now read, WHOLE.
	 *
	 * Never a delta: the wire replaces the body, and — decisively — the streaming spec's decision 7
	 * makes "every edit carries the complete text" the property that renders the mechanism
	 * self-correcting. A delta-shaped verb would make one lost edit corrupt every edit after it.
	 */
	text: string
}

/**
 * What a channel can actually DO, declared BY THE PORT rather than guessed from the platform name
 * (streaming spec, decision 4: "a capacidade é declarada pela porta, não presumida por plataforma").
 *
 * The distinction is not pedantry. "WhatsApp supports editing" is a fact about the platform and not
 * about a particular seam: the E2E harness binds a double, and a gateway build predating
 * `/messages/edit` cannot edit either. Asking the PORT puts the answer where it is actually known, and
 * keeps the fallback — one message at the end, exactly today's behaviour — reachable without a
 * platform switch anywhere in the delivery path.
 */
export interface ChannelCapabilities {
	/** Whether `edit` will actually reach a gateway that serves it. */
	readonly edit: boolean
	/**
	 * Whether `sendMedia` will actually reach a gateway that serves it ("envio de artefatos pelo canal"
	 * design, decision 5). `SendArtifact` checks this BEFORE enqueuing `deliver_channel_attachment` —
	 * `CHANNEL_MEDIA_UNSUPPORTED` is a use-case-time refusal, never a command that fails after landing.
	 */
	readonly media: boolean
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
 * ### The four verbs, and why the cues are verbs here rather than flags on `send`
 * `send` delivers WORDS; `react` and `signalTyping` deliver SIGNALS ABOUT words that do not exist
 * yet (streaming spec, decision 10). They are separate gateway endpoints, they carry no transcript
 * consequence, and — decisively — they are BEST-EFFORT while `send` is not: a failed send is retried
 * and eventually dead-lettered, a failed cue is swallowed. Folding them into `send` would put those
 * two failure policies behind one call.
 *
 * `edit` (streaming spec, decision 5) is the fourth, and it sits on the WORDS side of that split: it
 * changes what the contact reads, so a failure matters and is retried like a send. It is a verb of its
 * own rather than a flag on `send` for the blunt reason that it addresses a message that already
 * exists — it consumes an id instead of producing one.
 */
export abstract class ChannelSender {
	/**
	 * What this channel can do beyond `send` — consulted before a streamed reply is ever started, so a
	 * send-only channel degrades to one message at the end instead of failing halfway through.
	 */
	abstract readonly capabilities: ChannelCapabilities

	/** @returns the platform message id the channel assigned — the handle for quoting and for dedup. */
	abstract send(input: SendChannelMessageInput, ownerId: string): Promise<{ messageId: string }>

	/**
	 * Put one artifact on the channel as native media — image/video/audio/document, never `LINK`
	 * (`SendableArtifactKind`). The "envio de artefatos pelo canal" design's delivery verb, called only
	 * by `DeliverChannelAttachment` (the `deliver_channel_attachment` command handler), never directly
	 * by the use case — same shape as `send`/`edit`: the retry belongs to the `CommandQueue`, not here.
	 *
	 * @returns the platform message id the channel assigned — claimed against the echo exactly like
	 * `send`'s, so the WhatsApp `fromMe` replay of this delivery never becomes a spurious CONTACT entry.
	 */
	abstract sendMedia(input: SendChannelMediaInput, ownerId: string): Promise<{ messageId: string }>

	/**
	 * Replace the text of a message this account already sent (streaming spec, decision 5).
	 *
	 * The verb streaming is built on: the reply lands as soon as there is a first sentence and then
	 * GROWS, instead of the contact watching silence for the whole generation. Backed by the gateway's
	 * existing `/messages/edit` — no new endpoint (decision 5).
	 *
	 * TWO PROPERTIES THE CALLER OWNS, not this port:
	 *   - ORDER. The wire has no notion of edit sequence, so a late edit would happily overwrite a newer
	 *     one and the text would SHRINK on the contact's screen. `ReplyStreamer` carries a monotonic
	 *     sequence and drops the stale ones (decision 6).
	 *   - THE WINDOW. WhatsApp refuses an edit roughly 15 minutes after the message was sent, and this
	 *     port does not pretend otherwise: the caller checks the age and continues in a NEW message
	 *     rather than discovering the refusal as a failed command (decision 4).
	 */
	abstract edit(input: EditChannelMessageInput, ownerId: string): Promise<void>

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
	 * A beat, not a latch: the signal decays on its own, so "keep typing" means calling this again.
	 * `SustainTypingPresence` owns the cadence.
	 */
	abstract signalTyping(input: ChannelConversation, ownerId: string): Promise<void>

	/**
	 * Put the indicator OUT, explicitly.
	 *
	 * ### Why this verb exists now, when the port deliberately refused it before
	 * It used to say, in as many words, that an off-switch would be "an off-switch the wire does not
	 * have" — so silence was the whole design and the platform's own decay the only extinction. That
	 * premise was simply WRONG about the wire: `ChatPresenceType` has carried `paused` since the
	 * gateway's first version, and `WhatsmeowChannel.SendChatPresence` maps it onto
	 * `types.ChatPresencePaused`. The endpoint was there the whole time; only this port refused to
	 * name it.
	 *
	 * The measurement that settled it: with nothing ever publishing `paused`, a contact kept reading
	 * "digitando…" long past the last beat — the decay the old docblock rated at "the order of ten
	 * seconds" is not something this side gets to assume. So extinction becomes an ACT: whoever ends
	 * the loop says so on the wire.
	 *
	 * BEST-EFFORT, exactly like `signalTyping` and every other cue (streaming spec, decision 12) — a
	 * refused stop may never fail the reply that just landed. It stays SEPARATE from `signalTyping`
	 * rather than becoming a parameter on it for the reason the class doc gives for the other verbs:
	 * one call site means one presence, and the vocabulary of the gateway's enum stays out of the port.
	 */
	abstract stopTyping(input: ChannelConversation, ownerId: string): Promise<void>
}
