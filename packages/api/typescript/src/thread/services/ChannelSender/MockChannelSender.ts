import { injectable } from 'tsyringe-neo'
import { ChannelSender, type ChannelConversation, type ReactToChannelMessageInput, type SendChannelMessageInput } from './ChannelSender'

/** Records what would have gone out, and mints a platform id shaped like the gateway's. */
@injectable()
export class MockChannelSender extends ChannelSender {
	readonly sent: Array<SendChannelMessageInput & { ownerId: string }> = []
	/** Every cue, in order — the two arrays a cue test asserts on. */
	readonly reactions: Array<ReactToChannelMessageInput & { ownerId: string }> = []
	readonly typingBeats: Array<ChannelConversation & { ownerId: string }> = []
	private seq = 0

	async send(input: SendChannelMessageInput, ownerId: string): Promise<{ messageId: string }> {
		this.sent.push({ ...input, ownerId })
		this.seq += 1
		return { messageId: `mock-wamid-${this.seq}` }
	}

	async react(input: ReactToChannelMessageInput, ownerId: string): Promise<void> {
		this.reactions.push({ ...input, ownerId })
	}

	async signalTyping(input: ChannelConversation, ownerId: string): Promise<void> {
		this.typingBeats.push({ ...input, ownerId })
	}
}
