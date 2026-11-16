import { createHmac } from 'node:crypto'

/**
 * How a person of a group is named to the CLOUD panel (fase 2, item 6a): an opaque id, never their
 * phone number or WhatsApp JID.
 *
 * `memberId = HMAC-SHA256(key, threadId + "\n" + externalId)`, 128 bits in base64url. Keyed with a secret
 * that never leaves this machine, so the cloud cannot reverse it or enumerate phone numbers against it;
 * scoped by the group, so the same person in two groups gets two unrelated ids. Stable for as long as
 * the key is — the daemon re-derives the `memberId → JID` map from the live roster on every run, so
 * nothing has to be stored per member.
 */
export abstract class PanelMemberKey {
	protected abstract key(): Buffer

	memberIdOf(threadId: string, externalId: string): string {
		return createHmac('sha256', this.key()).update(`${threadId}\n${externalId}`).digest().subarray(0, 16).toString('base64url')
	}
}
