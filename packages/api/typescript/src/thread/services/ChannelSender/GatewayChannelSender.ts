import { injectable } from 'tsyringe-neo'
import { Config, BaseError } from '@codm/core-typescript'
import { ArtifactKind } from '@codm/contracts-typescript/wire/enums'
import {
	sendText,
	sendImage,
	sendVideo,
	sendAudio,
	sendFile,
	sendReaction,
	sendChatPresence,
	editMessage,
	ChatPresenceTypeEnum,
} from '@codm/client-typescript/go'
import type { ChatPresenceType } from '@codm/client-typescript/go'
import {
	ChannelSender,
	type ChannelCapabilities,
	type ChannelConversation,
	type EditChannelMessageInput,
	type ReactToChannelMessageInput,
	type SendChannelMediaInput,
	type SendChannelMessageInput,
} from './ChannelSender'
import type { ApplicationErrors } from '../../errors'

/**
 * The real sender — the Go gateway's own generated client, called over HTTP.
 *
 * Sanctioned by the S2S rule (CLAUDE.md, founder-ratified 22-jul): a service may use ANOTHER
 * service's SDK client, because that SDK is generated from the other service's openapi and the
 * dependency runs one way. The two operational conditions are met here: the call lives behind the
 * abstract port above (so no test opens a socket), and the hop carries the owner explicitly as
 * `X-Owner-Id` — the same header `forwardToChannel` injects for the browser-facing proxy, and the
 * one every owner-scoped gateway controller binds. The gateway never infers an owner.
 *
 * The base URL carries the gateway's `/api` mount, which its openapi omits — same convention as
 * `forwardToChannel`.
 */
@injectable()
export class GatewayChannelSender extends ChannelSender {
	/**
	 * The gateway serves `PUT /messages/edit` (`EditMessageController`), so streaming is available here.
	 * It also serves `/messages/{image,video,audio,file}` with `mediaPath` support (T1 of the "envio de
	 * artefatos pelo canal" plan), so `media` is true too.
	 */
	readonly capabilities: ChannelCapabilities = { edit: true, media: true }

	async send(input: SendChannelMessageInput, ownerId: string): Promise<{ messageId: string }> {
		try {
			const out = await sendText(
				{
					channelId: input.channelId,
					remoteId: input.remoteId,
					text: input.text,
					...(input.quotedMessageId ? { quotedMessageId: input.quotedMessageId } : {}),
				},
				{ baseURL: `${Config.env.API_GO_URL}/api`, headers: { 'X-Owner-Id': ownerId } },
			)
			return { messageId: out.messageId }
		} catch (error) {
			// A dead gateway is not a bug in the thread context — it is the same GATEWAY_UNAVAILABLE the
			// proxy already surfaces. The RETRY is the CommandQueue's (B3): this send only runs as the
			// `deliver_channel_message` command, so a throw here backs the row off and re-executes it (3
			// attempts, then dead-letter). The old claim that "the outbox will retry it" was false — the
			// event carrying this send was never written anywhere.
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', `channel send failed: ${String(error)}`)
		}
	}

	/**
	 * Dispatches by `input.kind` to the gateway's own per-kind send endpoint — never the generic
	 * `/messages/media`, which exists for a different caller (T1's plan scoped `mediaPath` support to
	 * the specific endpoints this method already needed). `LINK` is excluded at the TYPE level
	 * (`SendableArtifactKind`), so the switch below is exhaustive over the remaining four.
	 */
	async sendMedia(input: SendChannelMediaInput, ownerId: string): Promise<{ messageId: string }> {
		const auth = { baseURL: `${Config.env.API_GO_URL}/api`, headers: { 'X-Owner-Id': ownerId } }
		try {
			switch (input.kind) {
				case ArtifactKind.IMAGE: {
					const out = await sendImage(
						{
							channelId: input.channelId,
							remoteId: input.remoteId,
							mediaPath: input.mediaPath,
							...(input.caption ? { caption: input.caption } : {}),
						},
						auth,
					)
					return { messageId: out.messageId }
				}
				case ArtifactKind.VIDEO: {
					const out = await sendVideo(
						{
							channelId: input.channelId,
							remoteId: input.remoteId,
							mediaPath: input.mediaPath,
							...(input.caption ? { caption: input.caption } : {}),
						},
						auth,
					)
					return { messageId: out.messageId }
				}
				case ArtifactKind.AUDIO: {
					const out = await sendAudio({ channelId: input.channelId, remoteId: input.remoteId, mediaPath: input.mediaPath }, auth)
					return { messageId: out.messageId }
				}
				case ArtifactKind.FILE: {
					const out = await sendFile(
						{
							channelId: input.channelId,
							remoteId: input.remoteId,
							mediaPath: input.mediaPath,
							...(input.fileName ? { fileName: input.fileName } : {}),
							...(input.mimeType ? { mimeType: input.mimeType } : {}),
						},
						auth,
					)
					return { messageId: out.messageId }
				}
				default: {
					const _exhaustive: never = input.kind
					throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', `unreachable artifact kind: ${String(_exhaustive)}`)
				}
			}
		} catch (error) {
			if (error instanceof BaseError) throw error
			// SAME failure policy as `send`: a dead/refusing gateway backs the `deliver_channel_attachment`
			// command off and retries it, never swallowed here.
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', `channel media send failed: ${String(error)}`)
		}
	}

	async react(input: ReactToChannelMessageInput, ownerId: string): Promise<void> {
		try {
			await sendReaction(
				{
					channelId: input.channelId,
					remoteId: input.remoteId,
					messageId: input.messageId,
					fromMe: input.fromMe,
					reaction: input.reaction,
				},
				{ baseURL: `${Config.env.API_GO_URL}/api`, headers: { 'X-Owner-Id': ownerId } },
			)
		} catch (error) {
			// SAME code as the send, DIFFERENT consequence — and the difference is the caller's, not
			// this class's. A port that swallowed here would be lying to every future caller about
			// whether the gateway is up; `ReactToChannelMessage` is the one that decides a cue failure
			// is a non-event. Keeping the throw is also what lets a cue command log the real reason.
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', `channel reaction failed: ${String(error)}`)
		}
	}

	async edit(input: EditChannelMessageInput, ownerId: string): Promise<void> {
		try {
			await editMessage(
				{ channelId: input.channelId, remoteId: input.remoteId, messageId: input.messageId, text: input.text },
				{ baseURL: `${Config.env.API_GO_URL}/api`, headers: { 'X-Owner-Id': ownerId } },
			)
		} catch (error) {
			// THROWN, like the send and unlike the cues — and the difference is the point. An edit that
			// silently did nothing would leave the contact reading a half-finished sentence with nothing
			// anywhere saying so; the CommandQueue retry is what turns a gateway blip into a late edit
			// rather than a truncated reply. The caller that must NOT care about a failure (a superseded
			// intermediate edit) drops it by sequence, not by pretending the wire succeeded.
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', `channel edit failed: ${String(error)}`)
		}
	}

	async signalTyping(input: ChannelConversation, ownerId: string): Promise<void> {
		// `composing` is the gateway's own vocabulary (`ChatPresenceType`), read from the generated
		// binding rather than retyped — the wire value never gets to drift from the Go enum, and the
		// port above stays free of it.
		await this.publishPresence(input, ownerId, ChatPresenceTypeEnum.composing)
	}

	/**
	 * The SAME endpoint, the other value: `paused` is what actually takes the indicator off the
	 * contact's screen instead of waiting for a decay this side cannot observe. It has been in
	 * `ChatPresenceType` (and in `WhatsmeowChannel.SendChatPresence`) all along — see the port.
	 */
	async stopTyping(input: ChannelConversation, ownerId: string): Promise<void> {
		await this.publishPresence(input, ownerId, ChatPresenceTypeEnum.paused)
	}

	/** One call, one presence — the two cue verbs above differ by exactly this argument. */
	private async publishPresence(input: ChannelConversation, ownerId: string, presence: ChatPresenceType): Promise<void> {
		try {
			await sendChatPresence(
				{ channelId: input.channelId, remoteId: input.remoteId, presence },
				{ baseURL: `${Config.env.API_GO_URL}/api`, headers: { 'X-Owner-Id': ownerId } },
			)
		} catch (error) {
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', `channel presence failed: ${String(error)}`)
		}
	}
}
