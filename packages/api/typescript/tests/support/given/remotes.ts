import { DrizzleClient } from '@codedm/core-typescript'
import { remotes } from '@codedm/contracts/db'
import { ChannelKind, ContactKind } from '@codedm/contracts-typescript/wire/enums'
import type { TestBed } from '../TestBed'

export interface RemoteOverrides {
	channelId: string
	remoteId: string
	name: string
	/** USER or GROUP — the column is enum-typed, so a bare string does not satisfy the insert. */
	type?: ContactKind
	platform?: ChannelKind
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
			createdAt: now,
			updatedAt: now,
		})
	return overrides
}
