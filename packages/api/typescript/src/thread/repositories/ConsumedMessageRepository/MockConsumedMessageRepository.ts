import { injectable } from 'tsyringe-neo'
import { ConsumedMessageRepository, type ConsumeInput } from './ConsumedMessageRepository'

@injectable()
export class MockConsumedMessageRepository extends ConsumedMessageRepository {
	private seen = new Set<string>()

	private key(channelId: string, platformMessageId: string): string {
		return `${channelId}:${platformMessageId}`
	}

	async claim(input: ConsumeInput): Promise<boolean> {
		const k = this.key(input.channelId, input.platformMessageId)
		if (this.seen.has(k)) return false
		this.seen.add(k)
		return true
	}

	async has(channelId: string, platformMessageId: string): Promise<boolean> {
		return this.seen.has(this.key(channelId, platformMessageId))
	}
}
