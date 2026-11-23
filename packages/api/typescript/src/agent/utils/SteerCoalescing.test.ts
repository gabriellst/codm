import { describe, expect, it } from 'bun:test'
import { MailboxClaimClass, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { coalescedPrefix, type CoalescingCandidate } from './SteerCoalescing'

/**
 * ONE PERSON ANSWERED PER TURN (fase 4, item 6b × fase 3's "a reply to whoever wrote stays in the group").
 *
 * A grouped turn replies to its LAST routed steer. Messages from one person in a row share a turn (one answer to the
 * last); a message from someone else must lead the next turn, or that person gets ☑️/✅ and never an answer. Console
 * and loop steers (no channel origin) still ride along.
 *
 * Falsifier: drop the author check and the second case groups both people.
 */
const steer = (author?: string): CoalescingCandidate => ({
	claimClass: MailboxClaimClass.STEER,
	posture: PermissionPosture.AUTO,
	payload: author ? { text: 'x', entryId: `e-${author}`, channelOrigin: { senderExternalId: author } } : { text: 'x' },
})

describe('coalescedPrefix — one reply author per turn', () => {
	it('several messages from the same person, with console steers between, share a turn', () => {
		expect(coalescedPrefix(steer('ana'), [steer(), steer('ana'), steer('ana')])).toBe(3)
	})

	it('a message from another person stops the group — it leads the next turn', () => {
		expect(coalescedPrefix(steer('ana'), [steer(), steer('beto'), steer('ana')])).toBe(1)
	})

	it('a console head takes the first person, then stops at a second one', () => {
		expect(coalescedPrefix(steer(), [steer('ana'), steer(), steer('beto')])).toBe(2)
	})
})
