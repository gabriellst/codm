import { injectable } from 'tsyringe-neo'
import { ConsumedMessageRepository, type ConsumeInput } from './ConsumedMessageRepository'

@injectable()
export class MockConsumedMessageRepository extends ConsumedMessageRepository {
	private seen = new Set<string>()
	private links = new Map<string, { threadId: string; entryId: string }>()

	private key(channelId: string, platformMessageId: string): string {
		return `${channelId}:${platformMessageId}`
	}

	async claim(input: ConsumeInput): Promise<boolean> {
		const k = this.key(input.channelId, input.platformMessageId)
		if (this.seen.has(k)) return false
		this.seen.add(k)
		return true
	}

	async linkEntry(input: { channelId: string; platformMessageId: string; threadId: string; entryId: string }): Promise<void> {
		this.links.set(this.key(input.channelId, input.platformMessageId), { threadId: input.threadId, entryId: input.entryId })
	}

	async findEntry(channelId: string, platformMessageId: string): Promise<{ threadId: string; entryId: string } | undefined> {
		return this.links.get(this.key(channelId, platformMessageId))
	}

	async has(channelId: string, platformMessageId: string): Promise<boolean> {
		return this.seen.has(this.key(channelId, platformMessageId))
	}
}
