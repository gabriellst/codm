import { injectable } from 'tsyringe-neo'
import { Config, BaseError } from '@codm/core-typescript'
import { sendText } from '@codm/client-typescript/go'
import { ChannelSender, type SendChannelMessageInput } from './ChannelSender'
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
}
