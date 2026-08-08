import { DrizzleClient } from '@codm/core-typescript'
import { remotes } from '@codm/contracts/db'
import { ChannelKind, ContactKind } from '@codm/contracts-typescript/wire/enums'
import type { TestBed } from '../TestBed'

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
export async function givenRemote(testBed: TestBed, overrides: RemoteOverrides): Promise<RemoteOverrides> {
	const now = new Date()
	await testBed
		.resolve(DrizzleClient)
		.insert(remotes)
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
