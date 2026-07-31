import { injectable } from 'tsyringe-neo'
import { Config, BaseError } from '@codm/core-typescript'
import { sendText, sendReaction, sendChatPresence, ChatPresenceTypeEnum } from '@codm/client-typescript/go'
import { ChannelSender, type ChannelConversation, type ReactToChannelMessageInput, type SendChannelMessageInput } from './ChannelSender'
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

	async signalTyping(input: ChannelConversation, ownerId: string): Promise<void> {
		try {
			// `composing` is the gateway's own vocabulary (`ChatPresenceType`), read from the generated
			// binding rather than retyped — the wire value never gets to drift from the Go enum, and the
			// port above stays free of it.
			await sendChatPresence(
				{ channelId: input.channelId, remoteId: input.remoteId, presence: ChatPresenceTypeEnum.composing },
				{ baseURL: `${Config.env.API_GO_URL}/api`, headers: { 'X-Owner-Id': ownerId } },
			)
		} catch (error) {
			throw new BaseError<ApplicationErrors>('GATEWAY_UNAVAILABLE', `channel presence failed: ${String(error)}`)
		}
	}
}
