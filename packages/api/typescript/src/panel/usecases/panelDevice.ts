import type { Transaction } from '@codm/core-typescript'
import type { PanelIdentityGroup, PanelIdentityStore, PanelMember } from '../services/PanelIdentityStore'
import { panelDeviceTokenHash } from '../utils/panelIdentity'

/**
 * THE rule for "who is this device on this group's panel" (fase 2, item 6a), shared by the identity read
 * and every action (6b): a session counts only on the group it was opened for, while unexpired, and while
 * its member is still on the group's CURRENT roster. The name and the grant come from that roster, never
 * from the session.
 *
 * Returns the group (or nothing for an unknown token) and, when the device is someone, that member and the
 * session's hash — the key an action's per-device rate limit counts by.
 */
export async function resolvePanelDevice(
	store: PanelIdentityStore,
	token: string,
	deviceToken: string | undefined,
	tx?: Transaction,
): Promise<{ group?: PanelIdentityGroup; member?: PanelMember; sessionHash?: string }> {
	const group = await store.groupByToken(token, tx)
	if (!group) return {}
	if (!deviceToken) return { group }
	const sessionHash = panelDeviceTokenHash(deviceToken)
	const session = await store.findSession(sessionHash, tx)
	if (!session || session.threadId !== group.threadId || session.expiresAt <= new Date()) return { group }
	const member = group.members.find(candidate => candidate.memberId === session.memberId)
	return member ? { group, member, sessionHash } : { group }
}
