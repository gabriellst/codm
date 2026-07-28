import { injectable } from 'tsyringe-neo'
import { ChannelSender, type SendChannelMessageInput } from './ChannelSender'

/** Records what would have gone out, and mints a platform id shaped like the gateway's. */
@injectable()
export class MockChannelSender extends ChannelSender {
	readonly sent: Array<SendChannelMessageInput & { ownerId: string }> = []
	private seq = 0

	async send(input: SendChannelMessageInput, ownerId: string): Promise<{ messageId: string }> {
		this.sent.push({ ...input, ownerId })
		this.seq += 1
		return { messageId: `mock-wamid-${this.seq}` }
	}
}
