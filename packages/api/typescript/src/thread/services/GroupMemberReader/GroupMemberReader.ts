/** One group-member edge from the gateway `remote_memberships` read model. */
export interface GroupMember {
	memberId: string
	isAdmin: boolean
}

/**
 * BC1 → BC4 read seam: the LIVE membership of a GROUP remote. AttachThread hydrates a group thread's
 * initial participant roster from it; `GetThreadSettings` and `SetParticipantInvocation` read it again
 * on every open/toggle, because the JSON roster (`Thread.participants`) is a snapshot frozen at attach
 * time and nobody rewrites it when the gateway reprojects membership afterwards. Reads the Go-owned
 * `gateway.remote_memberships` read-model table directly (a table read, not a cross-context write-model
 * import — the gateway is a separate Go process/context, faithful to how {@link ChannelConnectivity}
 * reads `gateway.channels`).
 *
 * Two questions, both answered against the SAME table: `listMembers` is the read side's "who exists
 * right now" (GetThreadSettings unions this with the JSON for canInvoke/name fallback/operator
 * sentinel); `isMember` is the write side's admission check (SetParticipantInvocation trusts it before
 * letting the JSON roster grow to admit someone it has never recorded). Splitting them into a `find`
 * would force the write path to materialize and re-filter a whole roster just to answer a boolean.
 */
export abstract class GroupMemberReader {
	abstract listMembers(channelId: string, groupId: string): Promise<GroupMember[]>
	/** Whether `memberId` is CURRENTLY a member of `groupId` on `channelId`. */
	abstract isMember(channelId: string, groupId: string, memberId: string): Promise<boolean>
}
