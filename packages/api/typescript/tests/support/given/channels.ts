import { DrizzleClient, Id } from '@codm/core-typescript'
import { channels } from '@codm/contracts/db'
import { ChannelKind, ChannelStatus } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_ID } from '@auth/operator'
import type { TestBedLike } from './types'

export interface ChannelOverrides {
	channelId?: string
	ownerId?: string
	platform?: ChannelKind
	name?: string
	status?: ChannelStatus
	ownerRemoteId?: string
	/**
	 * When the row was last touched. `now` by default — override only when the ORDERING between two
	 * channels is the subject, which is the one thing two rows stamped in the same tick cannot express
	 * (`GetOperatorIdentity` picks the most recently updated connected channel).
	 */
	updatedAt?: Date
}

/**
 * One row of `gateway_channels` — a paired platform session, CONNECTED by default.
 *
 * Written through the raw client rather than a repository for the same reason `givenRemote` is: the TS
 * side owns no repository for this table, the Go gateway does. Doing it HERE rather than inline in a
 * suite is the whole point of the probe-discipline rail — the infrastructure coupling lives in
 * `tests/support/`, so a column rename is one edit instead of a grep across every test that needs a
 * connected channel.
 *
 * Reach for it whenever a read filters by the owner's channels: `GetAttachThreadWizard` lists contacts
 * of the owner's OWN channels, so a `givenRemote` with no channel behind it is invisible — an assertion
 * against it passes vacuously on `undefined`.
 */
export async function givenChannel(testBed: TestBedLike, overrides: ChannelOverrides = {}): Promise<{ channelId: string }> {
	const channelId = overrides.channelId ?? Id.value()
	const now = new Date()
	await testBed
		.resolve(DrizzleClient)
		.insert(channels)
		.values({
			id: channelId,
			ownerId: overrides.ownerId ?? OPERATOR_ID,
			platform: overrides.platform ?? ChannelKind.WHATSAPP,
			name: overrides.name ?? 'WhatsApp',
			status: overrides.status ?? ChannelStatus.CONNECTED,
			ownerRemoteId: overrides.ownerRemoteId ?? `acct-${channelId}`,
			credentials: {},
			createdAt: now,
			updatedAt: overrides.updatedAt ?? now,
		})
	return { channelId }
}
