/** One group-member edge from the gateway `remote_memberships` read model. */
export interface GroupMember {
	memberId: string
	isAdmin: boolean
}

/**
 * BC1 → BC4 read seam: the members of a GROUP remote. AttachThread hydrates a group thread's
 * participant roster from it. Reads the Go-owned `gateway.remote_memberships` read-model table
 * directly (a table read, not a cross-context write-model import — the gateway is a separate Go
 * process/context, faithful to how {@link ChannelConnectivity} reads `gateway.channels`).
 */
export abstract class GroupMemberReader {
	abstract listMembers(channelId: string, groupId: string): Promise<GroupMember[]>
}
