import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codedm/core-typescript'
import { ProviderKind, ContactKind } from '@codedm/contracts-typescript/wire/enums'
import { Thread } from './Thread'

const base = {
	ownerId: '00000000-0000-4000-8000-000000000001',
	channelId: '00000000-0000-4000-8000-0000000000aa',
	contactRef: { externalId: 'c1', displayName: 'Contact', kind: ContactKind.CONTACT },
	workspaceId: '00000000-0000-4000-8000-0000000000bb',
	providers: [ProviderKind.CLAUDE_CODE],
	participants: [
		{ participantId: 'operator', name: 'Operator', source: 'Mac', canInvoke: true },
		{ participantId: 'c1', name: 'Contact', source: 'WA', canInvoke: false },
	],
}

describe('Thread entity', () => {
	it('creates attached, idle, unpaused, gate off', () => {
		const t = Thread.create(base)
		expect(t.paused).toBe(false)
		expect(t.mentionGate.enabled).toBe(false)
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
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hi' })).toBe(false)
	})

	it('canInvoke: false when the sender is a read-only participant', () => {
		const t = Thread.create(base)
		expect(t.canInvoke({ senderExternalId: 'c1', text: 'hi' })).toBe(false)
	})

	it('canInvoke: mention gate requires the tag', () => {
		const t = Thread.create(base)
		t.configureMentionGate({ enabled: true, tag: '@bot' })
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hello' })).toBe(false)
		expect(t.canInvoke({ senderExternalId: 'operator', text: 'hey @bot go' })).toBe(true)
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
