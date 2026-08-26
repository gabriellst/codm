import { injectable } from 'tsyringe-neo'
import { and, asc, eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync } from '@codm/core-typescript'
import { remoteMemberships } from '@codm/contracts/db'
import { GroupMemberReader, type GroupMember } from './GroupMemberReader'

@injectable()
export class LibSqlGroupMemberReader extends GroupMemberReader {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async listMembers(channelId: string, groupId: string): Promise<GroupMember[]> {
		const result = await tryCatchAsync(async () => {
			return this.driver.db
				.select({ memberId: remoteMemberships.memberId, isAdmin: remoteMemberships.isAdmin })
				.from(remoteMemberships)
				.where(and(eq(remoteMemberships.channelId, channelId), eq(remoteMemberships.groupId, groupId)))
				.orderBy(asc(remoteMemberships.joinedAt), asc(remoteMemberships.memberId))
		})
		return result.success ? result.data : []
	}

	async isMember(channelId: string, groupId: string, memberId: string): Promise<boolean> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.driver.db
				.select({ memberId: remoteMemberships.memberId })
				.from(remoteMemberships)
				.where(
					and(eq(remoteMemberships.channelId, channelId), eq(remoteMemberships.groupId, groupId), eq(remoteMemberships.memberId, memberId)),
				)
				.limit(1)
			return rows.length > 0
		})
		return result.success ? result.data : false
	}
}
