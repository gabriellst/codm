import { DrizzleDatabaseDriver } from '@codm/core-typescript'
import { remotes, remoteMemberships } from '@codm/contracts/db'
import { ChannelKind, ContactKind } from '@codm/contracts-typescript/wire/enums'
import type { TestBedLike } from './types'

export interface RemoteOverrides {
	channelId: string
	remoteId: string
	name: string
	/** USER or GROUP — the column is enum-typed, so a bare string does not satisfy the insert. */
	type?: ContactKind
	platform?: ChannelKind
	/**
	 * The platform's signed photo url. Absent by default, which is the majority state in the real
	 * table (513 of 845 rows carry one) AND the one that exercises every "no photo" branch for free —
	 * a suite that needs a face seeds this explicitly.
	 */
	avatarUrl?: string
}

/**
 * One row of the gateway's CONTACT BOOK (`gateway_remotes`) — the WhatsApp chat/contact index.
 *
 * Written through the raw client rather than a repository because the TS side owns no repository for
 * this table: the Go sync populates it. Doing it HERE rather than in a test file is the point of the
 * probe-discipline rail — the infrastructure coupling lives in `tests/support/`, so a schema rename
 * is one edit here instead of a grep across every suite that needs a named contact.
 */
export async function givenRemote(testBed: TestBedLike, overrides: RemoteOverrides): Promise<RemoteOverrides> {
	const now = new Date()
	await testBed
		.resolve(DrizzleDatabaseDriver)
		.db.insert(remotes)
		.values({
			channelId: overrides.channelId,
			remoteId: overrides.remoteId,
			type: overrides.type ?? ContactKind.USER,
			platform: overrides.platform ?? ChannelKind.WHATSAPP,
			name: overrides.name,
			avatarUrl: overrides.avatarUrl,
			createdAt: now,
			updatedAt: now,
		})
	return overrides
}

export interface RemoteMembershipOverrides {
	channelId: string
	/** The GROUP's own `remoteId` — must already exist as a `gateway_remotes` row (FK), i.e. seeded via
	 *  `givenRemote(testBed, { channelId, remoteId: groupId, type: ContactKind.GROUP })` first. */
	groupId: string
	memberId: string
	isAdmin?: boolean
}

/**
 * One edge of the gateway's LIVE membership projection (`gateway_remote_memberships`) — who is
 * CURRENTLY in a WhatsApp group, reprojected independently of the JSON roster `AttachThread` freezes
 * into `thread_threads.participants` at bind time. This is the table `GetThreadSettings` and
 * `SetParticipantInvocation` now read through `GroupMemberReader` (see the roster/membership split
 * decision), so a suite exercising a member the JSON has never recorded, or one who has since left,
 * seeds it here rather than via `givenThread`'s `participants` override.
 *
 * Written through the raw client for the same reason `givenRemote` is: the Go sync owns this table,
 * the TS side has no repository for it.
 */
export async function givenRemoteMembership(
	testBed: TestBedLike,
	overrides: RemoteMembershipOverrides,
): Promise<RemoteMembershipOverrides> {
	await testBed
		.resolve(DrizzleDatabaseDriver)
		.db.insert(remoteMemberships)
		.values({
			channelId: overrides.channelId,
			groupId: overrides.groupId,
			memberId: overrides.memberId,
			isAdmin: overrides.isAdmin ?? false,
			joinedAt: new Date(),
		})
	return overrides
}
