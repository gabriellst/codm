import { injectable } from 'tsyringe-neo'
import { and, eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync } from '@codm/core-typescript'
import { channels } from '@codm/contracts/db'
import { ChannelStatus } from '@codm/contracts-typescript/wire/enums'
import { ChannelConnectivity } from './ChannelConnectivity'

/**
 * When this process started — the boot half of `connectedSince`. `performance.timeOrigin` is the process's
 * own start instant, not the moment this module was first imported.
 */
const PROCESS_STARTED_AT = new Date(Math.floor(performance.timeOrigin))

@injectable()
export class LibSqlChannelConnectivity extends ChannelConnectivity {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async isConnected(channelId: string): Promise<boolean> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.driver.db
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
			const rows = await this.driver.db
				.select({ id: channels.id })
				.from(channels)
				.where(and(eq(channels.ownerId, ownerId), eq(channels.status, ChannelStatus.CONNECTED)))
				.limit(1)
			return rows.length > 0
		})
		return result.success ? result.data : false
	}

	/**
	 * The channel's last connection is the `updated_at` of its row while it is CONNECTED: the gateway's
	 * `ChannelConnectedHandler` saves the row as CONNECTED (bumping `updated_at`) on every connect — the first
	 * pairing and every reconnect — in the same handler that publishes `integration.channel.connected`. A
	 * later unrelated save of the row only moves the instant forward, which lengthens the grace and never
	 * shortens it. No TS consumer of the event and no in-memory copy of it: the row already is the fact.
	 */
	async connectedSince(channelId: string): Promise<Date | undefined> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.driver.db
				.select({ updatedAt: channels.updatedAt })
				.from(channels)
				.where(and(eq(channels.id, channelId), eq(channels.status, ChannelStatus.CONNECTED)))
				.limit(1)
			return rows[0]?.updatedAt
		})
		const connectedAt = result.success ? result.data : undefined
		if (!connectedAt) return undefined
		return connectedAt.getTime() > PROCESS_STARTED_AT.getTime() ? connectedAt : PROCESS_STARTED_AT
	}
}
