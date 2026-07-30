import { injectable } from 'tsyringe-neo'
import { and, asc, eq } from 'drizzle-orm'
import { DrizzleClient, tryCatchAsync } from '@codm/core-typescript'
import { remoteMemberships } from '@codm/contracts/db'
import { GroupMemberReader, type GroupMember } from './GroupMemberReader'

@injectable()
export class DrizzleGroupMemberReader extends GroupMemberReader {
	constructor(private db: DrizzleClient) {
		super()
	}

	async listMembers(channelId: string, groupId: string): Promise<GroupMember[]> {
		const result = await tryCatchAsync(async () => {
			return this.db
				.select({ memberId: remoteMemberships.memberId, isAdmin: remoteMemberships.isAdmin })
				.from(remoteMemberships)
				.where(and(eq(remoteMemberships.channelId, channelId), eq(remoteMemberships.groupId, groupId)))
				.orderBy(asc(remoteMemberships.joinedAt), asc(remoteMemberships.memberId))
		})
		return result.success ? result.data : []
	}
}
