import { injectable } from 'tsyringe-neo'
import {
	ChannelSender,
	type ChannelCapabilities,
	type ChannelConversation,
	type EditChannelMessageInput,
	type ReactToChannelMessageInput,
	type SendChannelMessageInput,
} from './ChannelSender'

/** Records what would have gone out, and mints a platform id shaped like the gateway's. */
@injectable()
export class MockChannelSender extends ChannelSender {
	readonly sent: Array<SendChannelMessageInput & { ownerId: string }> = []
	/** Every cue, in order — the two arrays a cue test asserts on. */
	readonly reactions: Array<ReactToChannelMessageInput & { ownerId: string }> = []
	readonly typingBeats: Array<ChannelConversation & { ownerId: string }> = []
	/** Every edit, in the order the gateway would have applied them. */
	readonly edits: Array<EditChannelMessageInput & { ownerId: string }> = []
	/**
	 * MUTABLE, and that is the whole reason it is a field rather than a literal on the class.
	 *
	 * AC-6 is "a channel that cannot edit keeps today's behaviour" — a property no test can express
	 * without a channel that declares `edit: false`, and inventing a second mock class to say one
	 * boolean would leave the two doubles free to drift apart.
	 */
	capabilities: ChannelCapabilities = { edit: true }
	private seq = 0

	async send(input: SendChannelMessageInput, ownerId: string): Promise<{ messageId: string }> {
		this.sent.push({ ...input, ownerId })
		this.seq += 1
		return { messageId: `mock-wamid-${this.seq}` }
	}

	async edit(input: EditChannelMessageInput, ownerId: string): Promise<void> {
		this.edits.push({ ...input, ownerId })
	}

	async react(input: ReactToChannelMessageInput, ownerId: string): Promise<void> {
		this.reactions.push({ ...input, ownerId })
	}

	async signalTyping(input: ChannelConversation, ownerId: string): Promise<void> {
		this.typingBeats.push({ ...input, ownerId })
	}

	/**
	 * What the contact is ACTUALLY looking at, per message — the send folded together with every edit
	 * that landed on it, in order.
	 *
	 * This is the assertion surface AC-3 needs. Asserting on `edits.at(-1)` would prove only that the
	 * last call carried the right string; the property the spec cares about is what the CONVERSATION
	 * reads once everything has been applied, which is a fold over both arrays and is exactly where a
	 * regression (a stale edit applied after a newer one) becomes visible.
	 */
	screen(): string[] {
		const byId = new Map<string, string>()
		const order: string[] = []
		this.sent.forEach((message, index) => {
			const id = `mock-wamid-${index + 1}`
			order.push(id)
			byId.set(id, message.text)
		})
		for (const edit of this.edits) byId.set(edit.messageId, edit.text)
		return order.map(id => byId.get(id) ?? '')
	}
}
