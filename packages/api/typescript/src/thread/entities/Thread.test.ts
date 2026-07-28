import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codedm/core-typescript'
import { ProviderKind, ContactKind } from '@codedm/contracts-typescript/wire/enums'
import { Thread } from './Thread'

const base = {
	ownerId: '00000000-0000-4000-8000-000000000001',
	channelId: '00000000-0000-4000-8000-0000000000aa',
	contactRef: { externalId: 'c1', displayName: 'Contact', kind: ContactKind.USER },
	workspaceId: '00000000-0000-4000-8000-0000000000bb',
	providers: [ProviderKind.CLAUDE_CODE],
	mentionTag: '@base',
	participants: [
		{ participantId: 'operator', name: 'Operator', source: 'Mac', canInvoke: true },
		{ participantId: 'c1', name: 'Contact', source: 'WA', canInvoke: false },
	],
}

describe('Thread entity', () => {
	it('creates attached, idle, unpaused, and GATED on the minted tag', () => {
		const t = Thread.create(base)
		expect(t.paused).toBe(false)
		// The gate is an INVARIANT, not a default: `mentionTag` is required, so an ungated thread is
		// unconstructible. `AttachThread` mints it from the linked workspace folder.
		expect(t.mentionGate).toEqual({ enabled: true, tag: '@base' })
		expect(t.status).toBe('IDLE')
	})

	it('rejects an empty provider set', () => {
		expect(() => Thread.create({ ...base, providers: [] })).toThrow(BaseError)
	})

	it('rejects a roster with no invoker', () => {
		expect(() =>
			Thread.create({ ...base, participants: [{ participantId: 'c1', name: 'Contact', source: 'WA', canInvoke: false }] }),
		).toThrow(BaseError)
	})

	it('pause() flips status to PAUSED; resume() back to IDLE', () => {
		const t = Thread.create(base)
		t.pause()
		expect(t.paused).toBe(true)
		expect(t.status).toBe('PAUSED')
		t.resume()
		expect(t.paused).toBe(false)
		expect(t.status).toBe('IDLE')
	})

	it('setParticipantInvocation rejects removing the last invoker (LAST_INVOKER)', () => {
		const t = Thread.create(base)
		expect(() => t.setParticipantInvocation('operator', false)).toThrow(BaseError)
	})

	it('setParticipantInvocation rejects an unknown participant (PARTICIPANT_NOT_FOUND)', () => {
		const t = Thread.create(base)
		expect(() => t.setParticipantInvocation('nobody', true)).toThrow(BaseError)
	})

	it('canInvoke: false when paused', () => {
		const t = Thread.create(base)
		t.pause()
		// CITES the tag, so the refusal can only come from the pause — with a bare 'hi' this test would
		// pass on the mention gate and prove nothing about pausing.
		expect(t.canInvoke({ senderExternalId: 'operator', text: '@base hi' })).toBe(false)
	})

	it('canInvoke: false when the sender is a read-only participant', () => {
		const t = Thread.create(base)
		// Cites the tag for the same reason as above: isolate the participant-deny branch.
		expect(t.canInvoke({ senderExternalId: 'c1', text: '@base hi' })).toBe(false)
	})

	it('canInvoke: mention gate requires the tag as a STANDALONE token', () => {
		const t = Thread.create(base)
		t.configureMentionGate({ enabled: true, tag: '@bot' })
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hello' })).toBe(false)
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hey @bot go' })).toBe(true)
		// Case-insensitive: the mint lowercases while every UI surface renders the raw folder path, so an
		// operator reading `/Users/x/MyApp` tells the group to type `@MyApp`.
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hey @BOT go' })).toBe(true)
		// THE REASON THIS IS NOT `String.includes`. The tag is derived from a folder name, so it collides
		// with the vocabulary of the project it names — this repo's own packages are `@codedm/*` and its
		// live thread mints `@codedm`. A scoped package name must NOT summon the agent.
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'bump @bot/core to 2.0' })).toBe(false)
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'see bot.ts and @botanical' })).toBe(false)
	})

	it('textWithoutMention strips the citation, and never empties a bare summon', () => {
		const t = Thread.create(base)
		expect(t.textWithoutMention('@base fix the login bug')).toBe('fix the login bug')
		// A bare summon strips to '' — which `RunIssueTurn`'s `prompt: z.string().trim().min(1)` rejects,
		// turning the most natural message in the product into a thrown VALIDATION_ERROR. Fall back.
		expect(t.textWithoutMention('@base')).toBe('@base')
		// Gate off ⇒ verbatim.
		t.configureMentionGate({ enabled: false })
		expect(t.textWithoutMention('@base hi')).toBe('@base hi')
	})

	it('assertCanSteer: allowed while live, rejected once paused (THREAD_PAUSED)', () => {
		const t = Thread.create(base)
		expect(() => t.assertCanSteer()).not.toThrow()
		t.pause()
		expect(() => t.assertCanSteer()).toThrow(BaseError)
	})

	it('assertCanSendDirect: rejected while live (THREAD_NOT_PAUSED), allowed once paused', () => {
		const t = Thread.create(base)
		expect(() => t.assertCanSendDirect()).toThrow(BaseError)
		t.pause()
		expect(() => t.assertCanSendDirect()).not.toThrow()
	})
})
