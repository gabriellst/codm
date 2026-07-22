import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@template/core-typescript'
import { channels } from '@template/contracts/db'
import { ChannelStatus } from '@template/contracts-typescript/wire/enums'
import { ChannelConnectivity } from './ChannelConnectivity'

@injectable()
export class DrizzleChannelConnectivity extends ChannelConnectivity {
	constructor(private db: DrizzleClient) {
		super()
	}

	async isConnected(channelId: string): Promise<boolean> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.db
				.select({ id: channels.id })
				.from(channels)
				.where(and(eq(channels.id, channelId), eq(channels.status, ChannelStatus.CONNECTED)))
				.limit(1)
			return rows.length > 0
		})
		return result.success ? result.data : false
	}

	async anyConnected(ownerId: string): Promise<boolean> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.db
				.select({ id: channels.id })
				.from(channels)
				.where(and(eq(channels.ownerId, ownerId), eq(channels.status, ChannelStatus.CONNECTED)))
				.limit(1)
			return rows.length > 0
		})
		return result.success ? result.data : false
	}
}
